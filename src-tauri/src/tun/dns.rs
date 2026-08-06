use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, UdpSocket};
use std::time::Duration;

/// Perform a minimal SOCKS5 handshake (no auth).
fn socks5_handshake(stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(&[0x05, 0x01, 0x00])
        .map_err(|e| format!("write greeting: {e}"))?;

    let mut response = [0u8; 2];
    stream
        .read_exact(&mut response)
        .map_err(|e| format!("read greeting response: {e}"))?;

    if response[0] != 0x05 || response[1] != 0x00 {
        return Err(format!(
            "unexpected greeting: {:02x} {:02x}",
            response[0], response[1]
        ));
    }
    Ok(())
}

/// SOCKS5 CONNECT to a given IPv4 address and port.
fn socks5_connect(stream: &mut TcpStream, ip: std::net::Ipv4Addr, port: u16) -> Result<(), String> {
    let mut req = Vec::with_capacity(10);
    req.push(0x05);
    req.push(0x01);
    req.push(0x00);
    req.push(0x01);
    req.extend_from_slice(&ip.octets());
    req.extend_from_slice(&port.to_be_bytes());

    stream
        .write_all(&req)
        .map_err(|e| format!("write CONNECT: {e}"))?;

    let mut resp = [0u8; 10];
    stream
        .read_exact(&mut resp)
        .map_err(|e| format!("read CONNECT response: {e}"))?;

    if resp[1] != 0x00 {
        return Err(format!("SOCKS5 CONNECT failed: 0x{:02x}", resp[1]));
    }
    Ok(())
}

/// Forward a DNS query through the SOCKS5 proxy using TCP DNS (RFC 7766).
pub fn forward_dns_tcp(payload: &[u8], socks_addr: SocketAddr) -> Result<(), String> {
    let mut stream = TcpStream::connect_timeout(&socks_addr, Duration::from_secs(3))
        .map_err(|e| format!("SOCKS5 connect: {e}"))?;

    socks5_handshake(&mut stream)?;

    let target = std::net::Ipv4Addr::new(8, 8, 8, 8);
    socks5_connect(&mut stream, target, 53)?;

    // DNS over TCP: 2-byte length prefix + DNS message
    let len = payload.len() as u16;
    stream
        .write_all(&len.to_be_bytes())
        .map_err(|e| format!("write DNS length: {e}"))?;
    stream
        .write_all(payload)
        .map_err(|e| format!("write DNS query: {e}"))?;

    let mut len_buf = [0u8; 2];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("read DNS response length: {e}"))?;
    let resp_len = u16::from_be_bytes(len_buf) as usize;

    if resp_len > 4096 {
        return Err(format!("DNS response too large: {resp_len} bytes"));
    }

    let mut resp_buf = vec![0u8; resp_len];
    stream
        .read_exact(&mut resp_buf)
        .map_err(|e| format!("read DNS response: {e}"))?;

    log::debug!("[tun] DNS response received: {} bytes", resp_len);
    Ok(())
}

/// Resolve DNS directly using a UDP socket.
pub fn resolve_direct(payload: &[u8], dst: SocketAddr) -> Result<(), String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("bind UDP socket: {e}"))?;

    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| format!("set timeout: {e}"))?;

    let target = if dst.ip().is_unspecified() || dst.ip().to_string().starts_with("10.") {
        SocketAddr::new(
            std::net::IpAddr::V4(std::net::Ipv4Addr::new(8, 8, 8, 8)),
            53,
        )
    } else {
        dst
    };

    socket
        .send_to(payload, target)
        .map_err(|e| format!("send DNS query: {e}"))?;

    let mut resp_buf = [0u8; 4096];
    match socket.recv_from(&mut resp_buf) {
        Ok((len, _)) => {
            log::debug!("[tun] Direct DNS response: {len} bytes");
            Ok(())
        }
        Err(e) => Err(format!("recv DNS response: {e}")),
    }
}
