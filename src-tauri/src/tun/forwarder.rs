use parking_lot::Mutex;
use pnet_packet::ip::IpNextHeaderProtocols;
use pnet_packet::ipv4::{self, Ipv4Packet, MutableIpv4Packet};
use pnet_packet::tcp::{MutableTcpPacket, TcpPacket};
use pnet_packet::udp::UdpPacket;
use pnet_packet::Packet;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::Arc;
use std::time::Duration;

use super::adapter::TunAdapter;
use super::dns;
use crate::aether::profiles::DnsMode;
use crate::traffic;


#[derive(Hash, Eq, PartialEq, Clone, Debug)]
struct FlowKey {
    src_ip: [u8; 4],
    dst_ip: [u8; 4],
    src_port: u16,
    dst_port: u16,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum TcpState {
    SynReceived,
    Established,
    CloseWait,
    Closed,
}

struct Flow {
    stream: TcpStream,
    state: TcpState,
    client_seq: u32,
    server_seq: u32,
}

struct ForwarderState {
    flows: HashMap<FlowKey, Arc<Mutex<Flow>>>,
    socks_addr: SocketAddr,
    dns_mode: DnsMode,
    tun_ip: [u8; 4],
}


pub fn run_forwarder(adapter: Arc<TunAdapter>, socks_addr: SocketAddr, dns_mode: DnsMode) {
    let tun_ip = parse_tun_ip();

    let state = Arc::new(Mutex::new(ForwarderState {
        flows: HashMap::new(),
        socks_addr,
        dns_mode,
        tun_ip,
    }));

    log::info!("[tun] Forwarder started, listening on TUN adapter");

    loop {
        let buf = match adapter.receive_packet() {
            Ok(b) => b,
            Err(e) => {
                log::debug!("[tun] Reader closed: {e}");
                break;
            }
        };

        if buf.len() < 20 {
            continue;
        }

        let ip_packet = match Ipv4Packet::new(&buf) {
            Some(pkt) => pkt,
            None => continue,
        };

        if ip_packet.get_version() != 4 {
            continue;
        }

        let src_ip = ip_packet.get_source().octets();
        let dst_ip = ip_packet.get_destination().octets();
        let protocol = ip_packet.get_next_level_protocol();

        match protocol {
            IpNextHeaderProtocols::Tcp => {
                if let Some(tcp) = TcpPacket::new(ip_packet.payload()) {
                    handle_tcp_packet(
                        &adapter,
                        &state,
                        &src_ip,
                        &dst_ip,
                        &tcp,
                        ip_packet.get_total_length(),
                    );
                }
            }
            IpNextHeaderProtocols::Udp => {
                if let Some(udp) = UdpPacket::new(ip_packet.payload()) {
                    if udp.get_destination() == 53 || udp.get_source() == 53 {
                        let state = Arc::clone(&state);
                        let payload = udp.payload().to_vec();
                        let dst = SocketAddr::new(
                            std::net::IpAddr::V4(ip_packet.get_destination()),
                            udp.get_destination(),
                        );
                        std::thread::spawn(move || {
                            handle_dns_packet(state, &payload, dst);
                        });
                    }
                }
            }
            _ => {}
        }
    }

    let st = state.lock();
    for flow in st.flows.values() {
        let mut f = flow.lock();
        f.state = TcpState::Closed;
        let _ = f.stream.shutdown(std::net::Shutdown::Both);
    }
}


fn handle_tcp_packet(
    adapter: &Arc<TunAdapter>,
    state: &Arc<Mutex<ForwarderState>>,
    src_ip: &[u8; 4],
    dst_ip: &[u8; 4],
    tcp: &TcpPacket,
    _ip_total_length: u16,
) {
    let flags = tcp_flags(tcp);
    let is_syn = flags & 0x02 != 0;
    let is_ack = flags & 0x10 != 0;
    let is_fin = flags & 0x01 != 0;
    let is_rst = flags & 0x04 != 0;

    let key = FlowKey {
        src_ip: *src_ip,
        dst_ip: *dst_ip,
        src_port: tcp.get_source(),
        dst_port: tcp.get_destination(),
    };

    if is_rst {
        let mut st = state.lock();
        if let Some(flow) = st.flows.remove(&key) {
            let mut f = flow.lock();
            f.state = TcpState::Closed;
            let _ = f.stream.shutdown(std::net::Shutdown::Both);
            log::debug!("[tun] Flow reset: {}:{}", key.dst_ip_addr(), key.dst_port);
        }
        return;
    }

    if is_syn && !is_ack {
        let st = state.lock();
        if st.flows.contains_key(&key) {
            return;
        }
        drop(st);

        let client_seq = tcp.get_sequence();
        let tun_ip = state.lock().tun_ip;

        let state = Arc::clone(state);
        let adapter = Arc::clone(adapter);
        let key_clone = key.clone();

        std::thread::spawn(move || {
            handle_syn(adapter, state, key_clone, client_seq, tun_ip);
        });
        return;
    }

    let st = state.lock();
    let flow = match st.flows.get(&key) {
        Some(f) => Arc::clone(f),
        None => {
            return;
        }
    };
    drop(st);

    let mut f = flow.lock();

    let payload_len = tcp.payload().len() as u32;
    if payload_len > 0 {
        f.client_seq = tcp.get_sequence().wrapping_add(payload_len);
    }

    match f.state {
        TcpState::SynReceived => {
            if is_ack && !is_fin {
                f.state = TcpState::Established;
                f.client_seq = tcp.get_sequence();
                log::debug!(
                    "[tun] Flow established: {}:{}",
                    key.dst_ip_addr(),
                    key.dst_port
                );
                drop(f);

                let state_clone = Arc::clone(state);
                let adapter_clone = Arc::clone(adapter);
                let key2 = key.clone();
                std::thread::spawn(move || {
                    relay_socks_to_tun(state_clone, key2, &adapter_clone);
                });
            }
        }
        TcpState::Established => {
            if payload_len > 0 && !is_fin {
                let data = tcp.payload().to_vec();
                let _ = f.stream.write_all(&data);
                let _ = f.stream.flush();
                traffic::record_tx(data.len() as u64);
            }

            if is_fin {
                f.state = TcpState::CloseWait;
                let seq = f.server_seq;
                let ack_num = f.client_seq;
                drop(f);
                let tun_ip = state.lock().tun_ip;
                send_tcp_packet(
                    adapter,
                    &tun_ip,
                    &key.dst_ip,
                    key.dst_port,
                    key.src_port,
                    seq,
                    ack_num,
                    0x10,
                );
                let st = state.lock();
                if let Some(fl) = st.flows.get(&key) {
                    let fl2 = fl.lock();
                    let _ = fl2.stream.shutdown(std::net::Shutdown::Both);
                }
            }
        }
        _ => {}
    }
}


fn handle_syn(
    adapter: Arc<TunAdapter>,
    state: Arc<Mutex<ForwarderState>>,
    key: FlowKey,
    client_seq: u32,
    tun_ip: [u8; 4],
) {
    let dst_ip = key.dst_ip_addr();
    let dst_port = key.dst_port;
    let socks_addr = state.lock().socks_addr;

    let mut stream = match TcpStream::connect_timeout(&socks_addr, Duration::from_secs(5)) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("[tun] SOCKS5 connect failed for {dst_ip}:{dst_port}: {e}");
            send_rst(
                &adapter,
                &tun_ip,
                &key.dst_ip,
                dst_port,
                key.src_port,
                client_seq + 1,
            );
            return;
        }
    };

    if let Err(e) = socks5_connect(&mut stream, &key) {
        log::warn!("[tun] SOCKS5 handshake failed for {dst_ip}:{dst_port}: {e}");
        send_rst(
            &adapter,
            &tun_ip,
            &key.dst_ip,
            dst_port,
            key.src_port,
            client_seq + 1,
        );
        return;
    }

    let server_seq = 1000u32;

    send_tcp_packet(
        &adapter,
        &tun_ip,
        &key.dst_ip,
        dst_port,
        key.src_port,
        server_seq,
        client_seq.wrapping_add(1),
        0x12,
    );

    log::debug!(
        "[tun] SYN-ACK sent to {}:{}",
        key.src_ip_addr(),
        key.src_port
    );

    let flow = Arc::new(Mutex::new(Flow {
        stream,
        state: TcpState::SynReceived,
        client_seq,
        server_seq: server_seq.wrapping_add(1),
    }));

    {
        let mut st = state.lock();
        st.flows.insert(key, flow);
    }
}


fn relay_socks_to_tun(state: Arc<Mutex<ForwarderState>>, key: FlowKey, adapter: &Arc<TunAdapter>) {
    let mut buf = [0u8; 16384];

    loop {
        let flow = {
            let st = state.lock();
            match st.flows.get(&key) {
                Some(f) => Arc::clone(f),
                None => return,
            }
        };

        let n = {
            let mut f = flow.lock();
            if f.state == TcpState::Closed || f.state == TcpState::CloseWait {
                return;
            }
            f.stream
                .set_read_timeout(Some(Duration::from_secs(30)))
                .ok();
            match f.stream.read(&mut buf) {
                Ok(0) => {
                    f.state = TcpState::CloseWait;
                    let server_seq = f.server_seq;
                    drop(f);
                    send_tcp_packet(
                        adapter,
                        &state.lock().tun_ip,
                        &key.dst_ip,
                        key.dst_port,
                        key.src_port,
                        server_seq,
                        state
                            .lock()
                            .flows
                            .get(&key)
                            .map(|fl| fl.lock().client_seq)
                            .unwrap_or(0),
                        0x11,
                    );
                    {
                        let st = state.lock();
                        if let Some(fl) = st.flows.get(&key) {
                            let mut fl2 = fl.lock();
                            fl2.server_seq = server_seq.wrapping_add(1);
                        }
                    }
                    log::debug!(
                        "[tun] SOCKS5 EOF for {}:{}",
                        key.dst_ip_addr(),
                        key.dst_port
                    );
                    return;
                }
                Ok(n) => n,
                Err(e) => {
                    log::warn!("[tun] SOCKS5 read error: {e}");
                    let _ = f.stream.shutdown(std::net::Shutdown::Both);
                    f.state = TcpState::Closed;
                    send_rst(
                        adapter,
                        &state.lock().tun_ip,
                        &key.dst_ip,
                        key.dst_port,
                        key.src_port,
                        f.server_seq,
                    );
                    return;
                }
            }
        };

        traffic::record_rx(n as u64);
        let data = &buf[..n];
        let (server_seq, client_seq) = {
            let st = state.lock();
            if let Some(fl) = st.flows.get(&key) {
                let mut f = fl.lock();
                let seq = f.server_seq;
                f.server_seq = seq.wrapping_add(n as u32);
                (seq, f.client_seq)
            } else {
                return;
            }
        };

        send_tcp_data(
            adapter,
            &state.lock().tun_ip,
            &key.dst_ip,
            key.dst_port,
            key.src_port,
            server_seq,
            client_seq,
            data,
        );
    }
}


#[allow(clippy::too_many_arguments)]
fn send_tcp_packet(
    adapter: &Arc<TunAdapter>,
    src_ip: &[u8; 4],
    dst_ip: &[u8; 4],
    src_port: u16,
    dst_port: u16,
    seq: u32,
    ack: u32,
    flags: u8,
) {
    let tcp_header_len = 20u16;
    let ip_header_len = 20u16;
    let total_len = ip_header_len + tcp_header_len;

    let mut packet = vec![0u8; total_len as usize];

    {
        let mut tcp_pkt = MutableTcpPacket::new(&mut packet[20..]).unwrap();
        tcp_pkt.set_source(src_port);
        tcp_pkt.set_destination(dst_port);
        tcp_pkt.set_sequence(seq);
        tcp_pkt.set_acknowledgement(ack);
        tcp_pkt.set_data_offset(5);
        tcp_pkt.set_flags(flags);
        tcp_pkt.set_window(65535);
        tcp_pkt.set_checksum(0);

        let tcp_checksum = pnet_packet::tcp::ipv4_checksum(
            &tcp_pkt.to_immutable(),
            &std::net::Ipv4Addr::from(*src_ip),
            &std::net::Ipv4Addr::from(*dst_ip),
        );
        tcp_pkt.set_checksum(tcp_checksum);
    }

    {
        let mut ip_pkt = MutableIpv4Packet::new(&mut packet).unwrap();
        ip_pkt.set_version(4);
        ip_pkt.set_header_length(5);
        ip_pkt.set_total_length(total_len);
        ip_pkt.set_ttl(64);
        ip_pkt.set_next_level_protocol(IpNextHeaderProtocols::Tcp);
        ip_pkt.set_source(std::net::Ipv4Addr::from(*src_ip));
        ip_pkt.set_destination(std::net::Ipv4Addr::from(*dst_ip));

        let ip_checksum = ipv4::checksum(&ip_pkt.to_immutable());
        ip_pkt.set_checksum(ip_checksum);
    }

    if let Err(e) = adapter.send_packet(&packet) {
        log::warn!("[tun] Failed to inject TCP packet: {e}");
    }
}

#[allow(clippy::too_many_arguments)]
fn send_tcp_data(
    adapter: &Arc<TunAdapter>,
    src_ip: &[u8; 4],
    dst_ip: &[u8; 4],
    src_port: u16,
    dst_port: u16,
    seq: u32,
    ack: u32,
    data: &[u8],
) {
    let tcp_header_len = 20u16;
    let ip_header_len = 20u16;
    let total_len = ip_header_len + tcp_header_len + data.len() as u16;

    let mut packet = vec![0u8; total_len as usize];

    packet[(ip_header_len + tcp_header_len) as usize..].copy_from_slice(data);

    {
        let mut tcp_pkt = MutableTcpPacket::new(&mut packet[20..]).unwrap();
        tcp_pkt.set_source(src_port);
        tcp_pkt.set_destination(dst_port);
        tcp_pkt.set_sequence(seq);
        tcp_pkt.set_acknowledgement(ack);
        tcp_pkt.set_data_offset(5);
        tcp_pkt.set_flags(0x18);
        tcp_pkt.set_window(65535);
        tcp_pkt.set_checksum(0);

        let tcp_checksum = pnet_packet::tcp::ipv4_checksum(
            &tcp_pkt.to_immutable(),
            &std::net::Ipv4Addr::from(*src_ip),
            &std::net::Ipv4Addr::from(*dst_ip),
        );
        tcp_pkt.set_checksum(tcp_checksum);
    }

    {
        let mut ip_pkt = MutableIpv4Packet::new(&mut packet).unwrap();
        ip_pkt.set_version(4);
        ip_pkt.set_header_length(5);
        ip_pkt.set_total_length(total_len);
        ip_pkt.set_ttl(64);
        ip_pkt.set_next_level_protocol(IpNextHeaderProtocols::Tcp);
        ip_pkt.set_source(std::net::Ipv4Addr::from(*src_ip));
        ip_pkt.set_destination(std::net::Ipv4Addr::from(*dst_ip));

        let ip_checksum = ipv4::checksum(&ip_pkt.to_immutable());
        ip_pkt.set_checksum(ip_checksum);
    }

    if let Err(e) = adapter.send_packet(&packet) {
        log::warn!("[tun] Failed to inject TCP data: {e}");
    }
}

fn send_rst(
    adapter: &Arc<TunAdapter>,
    src_ip: &[u8; 4],
    dst_ip: &[u8; 4],
    src_port: u16,
    dst_port: u16,
    seq: u32,
) {
    send_tcp_packet(adapter, src_ip, dst_ip, src_port, dst_port, seq, 0, 0x04);
}


fn socks5_connect(stream: &mut TcpStream, key: &FlowKey) -> Result<(), String> {
    stream
        .write_all(&[0x05, 0x01, 0x00])
        .map_err(|e| format!("greeting: {e}"))?;
    let mut resp = [0u8; 2];
    stream
        .read_exact(&mut resp)
        .map_err(|e| format!("greeting resp: {e}"))?;
    if resp[0] != 0x05 || resp[1] != 0x00 {
        return Err(format!("bad greeting: {:02x} {:02x}", resp[0], resp[1]));
    }

    let dst_ip = std::net::Ipv4Addr::from(key.dst_ip);
    let mut req = vec![0x05, 0x01, 0x00, 0x01];
    req.extend_from_slice(&dst_ip.octets());
    req.extend_from_slice(&key.dst_port.to_be_bytes());
    stream
        .write_all(&req)
        .map_err(|e| format!("CONNECT: {e}"))?;

    let mut resp = [0u8; 10];
    stream
        .read_exact(&mut resp)
        .map_err(|e| format!("CONNECT resp: {e}"))?;
    if resp[1] != 0x00 {
        return Err(format!("CONNECT failed: 0x{:02x}", resp[1]));
    }
    Ok(())
}


fn handle_dns_packet(state: Arc<Mutex<ForwarderState>>, payload: &[u8], dst: SocketAddr) {
    let dns_mode = state.lock().dns_mode.clone();
    match dns_mode {
        DnsMode::Forward => {
            if let Err(e) = dns::forward_dns_tcp(payload, state.lock().socks_addr) {
                log::warn!("[tun] DNS forward failed: {e}");
            }
        }
        DnsMode::Direct => {
            if let Err(e) = dns::resolve_direct(payload, dst) {
                log::warn!("[tun] Direct DNS failed: {e}");
            }
        }
    }
}


fn tcp_flags(tcp: &TcpPacket) -> u8 {
    if tcp.packet().len() > 13 {
        tcp.packet()[13]
    } else {
        0
    }
}

impl FlowKey {
    fn dst_ip_addr(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::from(self.dst_ip)
    }
    fn src_ip_addr(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::from(self.src_ip)
    }
}

fn parse_tun_ip() -> [u8; 4] {
    [10, 0, 0, 2]
}
