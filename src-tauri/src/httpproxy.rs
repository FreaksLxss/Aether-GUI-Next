
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

static TARGET: Mutex<Option<String>> = Mutex::new(None);
static LISTEN: Mutex<Option<SocketAddr>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);
static STOLEN: Mutex<Vec<SocketAddr>> = Mutex::new(Vec::new());
static ENGINE: Mutex<Option<SocketAddr>> = Mutex::new(None);
static ENGINE_TOR: Mutex<Option<SocketAddr>> = Mutex::new(None);
static ENGINE_PSIHON: Mutex<Option<SocketAddr>> = Mutex::new(None);
static PINS: Mutex<Vec<(SocketAddr, SocketAddr)>> = Mutex::new(Vec::new());

const MAX_HEAD: usize = 64 * 1024;
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_SOCKS: &str = "127.0.0.1:1819";

fn normalize_target(addr: &str) -> String {
    match addr.parse::<SocketAddr>() {
        Ok(mut sa) => {
            if sa.ip().is_unspecified() {
                sa.set_ip(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
            }
            sa.to_string()
        }
        Err(_) => DEFAULT_SOCKS.to_string(),
    }
}

pub fn set_target(addr: &str) {
    *TARGET.lock().unwrap() = Some(normalize_target(addr));
}

pub fn local_addr() -> Option<SocketAddr> {
    *LISTEN.lock().unwrap()
}

pub fn engine_addr() -> SocketAddr {
    ENGINE
        .lock()
        .unwrap()
        .unwrap_or_else(|| DEFAULT_SOCKS.parse().expect("static default"))
}

pub fn engine_tor_addr() -> Option<SocketAddr> {
    *ENGINE_TOR.lock().unwrap()
}

pub fn engine_psiphon_addr() -> Option<SocketAddr> {
    *ENGINE_PSIHON.lock().unwrap()
}

fn pin_for(addr: SocketAddr) -> Option<SocketAddr> {
    let pins = PINS.lock().unwrap();
    pins.iter()
        .find(|(l, _)| l.port() == addr.port() && l.ip() == addr.ip())
        .or_else(|| {
            pins.iter()
                .find(|(l, _)| l.port() == addr.port() && l.ip().is_unspecified())
        })
        .map(|(_, up)| *up)
}

fn target_for(door: Option<SocketAddr>) -> Result<SocketAddr, String> {
    let base = match door.and_then(pin_for) {
        Some(up) => up,
        None => current_target()?,
    };
    Ok(pin_for(base).unwrap_or(base))
}

pub fn is_claimed(addr: &SocketAddr) -> bool {
    pin_for(*addr).is_some()
}

pub fn free_loopback_ports(n: usize) -> Result<Vec<SocketAddr>, String> {
    let mut listeners = Vec::with_capacity(n);
    for _ in 0..n {
        listeners.push(TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?);
    }
    let addrs = listeners
        .iter()
        .map(|l| l.local_addr().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, String>>()?;
    drop(listeners);
    Ok(addrs)
}

pub fn route_connect(advertised: &str, tor_door: Option<SocketAddr>) -> Result<SocketAddr, String> {
    let sa: SocketAddr = advertised
        .parse()
        .map_err(|e| format!("invalid bind address {advertised}: {e}"))?;
    let mut ports = free_loopback_ports(if tor_door.is_some() { 2 } else { 1 })?.into_iter();
    let engine = ports.next().expect("at least one port");
    *ENGINE.lock().unwrap() = Some(engine);
    *ENGINE_TOR.lock().unwrap() = None;
    *ENGINE_PSIHON.lock().unwrap() = None;
    set_target(&engine.to_string());
    if let (Some(door), Some(tor)) = (tor_door, ports.next()) {
        claim_sa(door, tor)?;
        *ENGINE_TOR.lock().unwrap() = Some(tor);
    }
    claim_sa(sa, engine)?;
    Ok(engine)
}

pub fn claim_psiphon_door(door: SocketAddr) -> Result<SocketAddr, String> {
    let private = free_loopback_ports(1)?.remove(0);
    *ENGINE_PSIHON.lock().unwrap() = Some(private);
    claim_sa(door, private)?;
    Ok(private)
}

fn reserve_private(slot: &Mutex<Option<SocketAddr>>) -> Result<SocketAddr, String> {
    let private = free_loopback_ports(1)?.remove(0);
    *slot.lock().unwrap() = Some(private);
    Ok(private)
}

pub fn reserve_engine_tor() -> Result<SocketAddr, String> {
    reserve_private(&ENGINE_TOR)
}

pub fn reserve_engine_psiphon() -> Result<SocketAddr, String> {
    reserve_private(&ENGINE_PSIHON)
}

pub fn claim(addr: &str, upstream: SocketAddr) -> Result<SocketAddr, String> {
    let sa: SocketAddr = addr
        .parse()
        .map_err(|e| format!("invalid bind address {addr}: {e}"))?;
    claim_sa(sa, upstream)?;
    Ok(sa)
}

fn claim_sa(sa: SocketAddr, upstream: SocketAddr) -> Result<(), String> {
    {
        let mut pins = PINS.lock().unwrap();
        pins.retain(|(listen, _)| *listen != sa);
        pins.push((sa, upstream));
    }
    if STOLEN.lock().unwrap().contains(&sa) {
        return Ok(());
    }
    let listener = TcpListener::bind(sa).map_err(|e| format!("bind {sa}: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?;
    STOLEN.lock().unwrap().push(bound);
    log::info!("[httpproxy] claimed advertised proxy {bound} → {upstream}");
    std::thread::spawn(move || accept_loop(listener));
    Ok(())
}

pub fn start() -> Result<SocketAddr, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return local_addr().ok_or_else(|| "bridge listener has no bound address".to_string());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    *LISTEN.lock().unwrap() = Some(addr);
    RUNNING.store(true, Ordering::SeqCst);
    log::info!("[httpproxy] loopback HTTP bridge listening on {addr}");
    std::thread::spawn(move || accept_loop(listener));
    Ok(addr)
}

fn accept_loop(listener: TcpListener) {
    for conn in listener.incoming() {
        match conn {
            Ok(stream) => {
                let _ = stream.set_nodelay(true);
                std::thread::spawn(move || handle_client(stream));
            }
            Err(e) => log::warn!("[httpproxy] accept error: {e}"),
        }
    }
    log::debug!("[httpproxy] accept loop ended");
}


fn handle_client(mut client: TcpStream) {
    let door = client.local_addr().ok();
    let mut first = [0u8; 1];
    match client.read(&mut first) {
        Ok(0) | Err(_) => return,
        Ok(_) => {}
    }
    if first[0] == 0x05 {
        let _ = handle_socks5(client, door);
        return;
    }
    if !first[0].is_ascii_alphabetic() {
        return;
    }

    let (head_bytes, leftover) = match read_head(&mut client, first.to_vec()) {
        Ok(x) => x,
        Err(e) => {
            log::debug!("[httpproxy] could not read request head: {e}");
            return;
        }
    };

    let (method, target) = match request_line(&head_bytes) {
        Some(x) => x,
        None => {
            let _ = write_simple(&mut client, b"HTTP/1.1 400 Bad Request\r\n\r\n");
            return;
        }
    };

    let target_addr = match target_for(door) {
        Ok(a) => a,
        Err(_) => {
            let _ = write_simple(&mut client, b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
            return;
        }
    };

    if method == "CONNECT" {
        let (host, port) = match parse_authority(&target, 0) {
            (_, 0) => {
                log::debug!("[httpproxy] CONNECT without a port: {target}");
                let _ = write_simple(&mut client, b"HTTP/1.1 400 Bad Request\r\n\r\n");
                return;
            }
            other => other,
        };
        log::debug!("[httpproxy] CONNECT {target}");
        let upstream = match socks_connect(&host, port, &target_addr) {
            Ok(s) => s,
            Err(e) => {
                log::debug!("[httpproxy] CONNECT upstream failed: {e}");
                let _ = write_simple(&mut client, b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
                return;
            }
        };
        let _ = client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n");
        relay(client, upstream);
    } else {
        handle_plain_http(
            client,
            &head_bytes,
            leftover,
            &method,
            &target,
            &target_addr,
        );
    }
}

fn handle_plain_http(
    mut client: TcpStream,
    head: &[u8],
    mut leftover: Vec<u8>,
    method: &str,
    target: &str,
    target_addr: &SocketAddr,
) {
    let (host, port, strict_path) = split_request_target(target);
    if host.is_empty() {
        let (hh, hp) = first_host_header(head);
        let connect_host = hh.unwrap_or_else(|| "127.0.0.1".to_string());
        let connect_port = hp.unwrap_or(port);
        let mut upstream = match socks_connect(&connect_host, connect_port, target_addr) {
            Ok(s) => s,
            Err(e) => {
                log::debug!("[httpproxy] upstream connect failed: {e}");
                let _ = write_simple(&mut client, b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
                return;
            }
        };
        if upstream.write_all(head).is_err() {
            return;
        }
        crate::traffic::record_tx(head.len() as u64);
        let tail = std::mem::take(&mut leftover);
        if !tail.is_empty() {
            if upstream.write_all(&tail).is_err() {
                return;
            }
            crate::traffic::record_tx(tail.len() as u64);
        }
        relay(client, upstream);
        return;
    }

    let connect_port = if port == 0 { 80 } else { port };
    log::debug!("[httpproxy] {method} {target} -> {host}:{connect_port}");
    let mut upstream = match socks_connect(&host, connect_port, target_addr) {
        Ok(s) => s,
        Err(e) => {
            log::debug!("[httpproxy] upstream connect failed: {e}");
            let _ = write_simple(&mut client, b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
            return;
        }
    };

    let rewritten = rewrite_http(head, method, &strict_path);
    if upstream.write_all(&rewritten).is_err() {
        return;
    }
    crate::traffic::record_tx(rewritten.len() as u64);
    let tail = std::mem::take(&mut leftover);
    if !tail.is_empty() {
        if upstream.write_all(&tail).is_err() {
            return;
        }
        crate::traffic::record_tx(tail.len() as u64);
    }
    relay(client, upstream);
}

fn handle_socks5(mut client: TcpStream, door: Option<SocketAddr>) -> io::Result<()> {
    let mut nmethods = [0u8; 1];
    client.read_exact(&mut nmethods)?;
    let mut methods = vec![0u8; nmethods[0] as usize];
    client.read_exact(&mut methods)?;
    client.write_all(&[0x05, 0x00])?;

    let mut req = [0u8; 4];
    client.read_exact(&mut req)?;
    if req[0] != 0x05 || req[1] != 0x01 {
        let _ = client.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        return Ok(());
    }
    let body = match read_socks_addr_body(&mut client, req[3]) {
        Ok(b) => b,
        Err(_) => {
            let _ = client.write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
            return Ok(());
        }
    };
    let Some((host, port)) = socks_dest(req[3], &body) else {
        let _ = client.write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        return Ok(());
    };
    let target = target_for(door).map_err(io::Error::other)?;
    let upstream = match socks_connect(&host, port, &target) {
        Ok(s) => s,
        Err(e) => {
            log::debug!("[httpproxy] SOCKS5 upstream failed: {e}");
            let _ = client.write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
            return Ok(());
        }
    };
    client.write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])?;
    relay(client, upstream);
    Ok(())
}

fn read_socks_addr_body(r: &mut impl Read, atyp: u8) -> io::Result<Vec<u8>> {
    let fixed = match atyp {
        1 => 6,
        4 => 18,
        3 => {
            let mut n = [0u8; 1];
            r.read_exact(&mut n)?;
            let mut body = n.to_vec();
            let mut rest = vec![0u8; n[0] as usize + 2];
            r.read_exact(&mut rest)?;
            body.extend_from_slice(&rest);
            return Ok(body);
        }
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "unsupported SOCKS5 address type",
            ))
        }
    };
    let mut body = vec![0u8; fixed];
    r.read_exact(&mut body)?;
    Ok(body)
}

fn socks_dest(atyp: u8, body: &[u8]) -> Option<(String, u16)> {
    match atyp {
        1 => {
            let ip: [u8; 4] = body.get(..4)?.try_into().ok()?;
            let port = u16::from_be_bytes([*body.get(4)?, *body.get(5)?]);
            Some((std::net::Ipv4Addr::from(ip).to_string(), port))
        }
        4 => {
            let ip: [u8; 16] = body.get(..16)?.try_into().ok()?;
            let port = u16::from_be_bytes([*body.get(16)?, *body.get(17)?]);
            Some((std::net::Ipv6Addr::from(ip).to_string(), port))
        }
        3 => {
            let n = *body.first()? as usize;
            let host = std::str::from_utf8(body.get(1..1 + n)?).ok()?;
            let port = u16::from_be_bytes([*body.get(1 + n)?, *body.get(2 + n)?]);
            Some((host.to_string(), port))
        }
        _ => None,
    }
}

fn relay(client: TcpStream, upstream: TcpStream) {
    let c1 = client.try_clone();
    let c2 = client.try_clone();
    let u1 = upstream.try_clone();
    let u2 = upstream.try_clone();
    let (Ok(c1), Ok(c2), Ok(u1), Ok(u2)) = (c1, c2, u1, u2) else {
        return;
    };

    let t1 = std::thread::spawn(move || {
        let _ = pipe_counted(c1, u1, true);
    });
    let t2 = std::thread::spawn(move || {
        let _ = pipe_counted(u2, c2, false);
    });
    let _ = t1.join();
    let _ = t2.join();
}

fn pipe_counted(mut src: TcpStream, mut dst: TcpStream, is_tx: bool) -> io::Result<u64> {
    let mut buf = [0u8; 8192];
    let mut total: u64 = 0;
    loop {
        let n = src.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])?;
        total += n as u64;
        if is_tx {
            crate::traffic::record_tx(n as u64);
        } else {
            crate::traffic::record_rx(n as u64);
        }
    }
    let _ = dst.shutdown(std::net::Shutdown::Write);
    Ok(total)
}


fn read_head(stream: &mut TcpStream, seed: Vec<u8>) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let mut buffer = seed;
    let mut chunk = [0u8; 4096];
    loop {
        if buffer.len() > MAX_HEAD {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "request head exceeds limit",
            ));
        }
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "client closed before head",
            ));
        }
        buffer.extend_from_slice(&chunk[..n]);
        if let Some(end) = head_end_index(&buffer) {
            let body = buffer.split_off(end);
            return Ok((buffer, body));
        }
    }
}

fn head_end_index(buf: &[u8]) -> Option<usize> {
    buf.windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| i + 4)
        .or_else(|| buf.windows(2).position(|w| w == b"\n\n").map(|i| i + 2))
}

fn request_line(head: &[u8]) -> Option<(String, String)> {
    let text = std::str::from_utf8(head).ok()?;
    let first = text.split("\r\n").next()?.to_string();
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();
    Some((method, target))
}

fn first_host_header(head: &[u8]) -> (Option<String>, Option<u16>) {
    let text = match std::str::from_utf8(head) {
        Ok(t) => t,
        Err(_) => return (None, None),
    };
    let Some(idx) = text.find("\r\n\r\n") else {
        return (None, None);
    };
    for line in text[..idx].lines().skip(1) {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("host") {
                let (h, p) = parse_authority(value.trim(), 80);
                return (Some(h), Some(p));
            }
        }
    }
    (None, None)
}

fn parse_authority(auth: &str, default_port: u16) -> (String, u16) {
    let auth = auth.trim();
    if let Some(rest) = auth.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            let host = &rest[..end];
            let after = &rest[end + 1..];
            if let Some(p) = after.strip_prefix(':') {
                if let Ok(port) = p.parse() {
                    return (host.to_string(), port);
                }
            }
            return (host.to_string(), default_port);
        }
    }
    if let Some((host, port)) = auth.rsplit_once(':') {
        if let Ok(port) = port.parse() {
            return (host.to_string(), port);
        }
    }
    (auth.to_string(), default_port)
}

fn split_request_target(target: &str) -> (String, u16, String) {
    for scheme in ["http://", "https://"] {
        if let Some(rest) = target.trim().to_ascii_lowercase().strip_prefix(scheme) {
            let is_https = scheme == "https://";
            let (auth, path) = match rest.find('/') {
                Some(i) => (&rest[..i], rest[i..].to_string()),
                None => (rest, "/".to_string()),
            };
            let (host, port) = parse_authority(auth, if is_https { 443 } else { 80 });
            return (host, port, path);
        }
    }
    let origin = target.trim().to_string();
    (String::new(), 0, origin)
}

fn rewrite_http(head: &[u8], method: &str, path: &str) -> Vec<u8> {
    let end = head
        .windows(2)
        .position(|w| w == b"\r\n")
        .map(|i| i + 2)
        .or_else(|| head.iter().position(|&b| b == b'\n').map(|i| i + 1))
        .unwrap_or(head.len());

    let tail = &head[end..];

    let mut out = Vec::with_capacity(tail.len() + 64);
    out.extend_from_slice(format!("{method} {path}\r\n").as_bytes());
    out.extend_from_slice(tail);
    out
}

fn write_simple(stream: &mut TcpStream, bytes: &[u8]) -> io::Result<()> {
    stream.write_all(bytes)
}


fn current_target() -> Result<SocketAddr, String> {
    TARGET
        .lock()
        .unwrap()
        .as_deref()
        .unwrap_or(DEFAULT_SOCKS)
        .parse()
        .map_err(|e| format!("invalid SOCKS target: {e}"))
}

fn socks_connect(host: &str, port: u16, upstream: &SocketAddr) -> Result<TcpStream, String> {
    let mut stream = TcpStream::connect_timeout(upstream, UPSTREAM_TIMEOUT)
        .map_err(|e| format!("connect upstream: {e}"))?;
    let _ = stream.set_nodelay(true);

    stream
        .write_all(&[0x05, 0x01, 0x00])
        .map_err(|e| format!("write greeting: {e}"))?;
    let mut resp = [0u8; 2];
    stream
        .read_exact(&mut resp)
        .map_err(|e| format!("read greeting: {e}"))?;
    if resp != [0x05, 0x00] {
        return Err(format!("SOCKS greeting rejected: {resp:02x?}"));
    }

    let mut req = vec![0x05, 0x01, 0x00];
    match host.parse::<std::net::IpAddr>() {
        Ok(ip) => match ip {
            IpAddr::V4(v4) => {
                req.push(0x01);
                req.extend_from_slice(&v4.octets());
            }
            IpAddr::V6(v6) => {
                req.push(0x04);
                req.extend_from_slice(&v6.octets());
            }
        },
        Err(_) => {
            let domain = host.as_bytes();
            if domain.is_empty() || domain.len() > 255 {
                return Err("invalid destination domain".to_string());
            }
            req.push(0x03);
            req.push(domain.len() as u8);
            req.extend_from_slice(domain);
        }
    }
    req.extend_from_slice(&port.to_be_bytes());
    stream
        .write_all(&req)
        .map_err(|e| format!("write CONNECT: {e}"))?;

    let mut reply = [0u8; 4];
    stream
        .read_exact(&mut reply)
        .map_err(|e| format!("read CONNECT reply: {e}"))?;
    if reply[1] != 0x00 {
        return Err(format!("SOCKS5 connect failed: 0x{:02x}", reply[1]));
    }
    match reply[3] {
        0x01 => {
            let mut rest = [0u8; 6];
            stream.read_exact(&mut rest).map_err(|e| e.to_string())?;
        }
        0x04 => {
            let mut rest = [0u8; 18];
            stream.read_exact(&mut rest).map_err(|e| e.to_string())?;
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).map_err(|e| e.to_string())?;
            let mut rest = vec![0u8; len[0] as usize + 2];
            stream.read_exact(&mut rest).map_err(|e| e.to_string())?;
        }
        other => return Err(format!("unexpected address type: {other:02x}")),
    }
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_to_loopback() {
        assert_eq!(normalize_target("0.0.0.0:1819"), "127.0.0.1:1819");
        assert_eq!(normalize_target("[::]:1819"), "127.0.0.1:1819");
        assert_eq!(normalize_target("127.0.0.1:9999"), "127.0.0.1:9999");
        assert_eq!(normalize_target("junk"), DEFAULT_SOCKS);
    }

    #[test]
    fn authority_parsing() {
        assert_eq!(
            parse_authority("example.com:443", 80),
            ("example.com".into(), 443)
        );
        assert_eq!(
            parse_authority("example.com", 80),
            ("example.com".into(), 80)
        );
        assert_eq!(parse_authority("[::1]:8080", 80), ("::1".into(), 8080));
        assert_eq!(parse_authority("[::1]", 80), ("::1".into(), 80));
        assert_eq!(parse_authority("1.2.3.4:9", 80), ("1.2.3.4".into(), 9));
    }

    #[test]
    fn absolute_target_parsing() {
        assert_eq!(
            split_request_target("http://example.com/a/b"),
            ("example.com".into(), 80, "/a/b".into())
        );
        assert_eq!(
            split_request_target("https://example.com"),
            ("example.com".into(), 443, "/".into())
        );
        assert_eq!(
            split_request_target("/local/path"),
            ("".into(), 0, "/local/path".into())
        );
    }

    #[test]
    fn host_header_parsing() {
        let head = b"GET / HTTP/1.1\r\nHost: example.com:8080\r\n\r\n";
        assert_eq!(
            first_host_header(head),
            (Some("example.com".into()), Some(8080))
        );
        let head2 = b"GET / HTTP/1.1\r\nhost: example.com\r\n\r\n";
        assert_eq!(
            first_host_header(head2),
            (Some("example.com".into()), Some(80))
        );
        let head3 = b"GET / HTTP/1.1\r\n\r\n";
        assert_eq!(first_host_header(head3), (None, None));
    }

    #[test]
    fn find_head_end() {
        assert_eq!(head_end_index(b"GET / HTTP/1.1\r\n\r\nbody"), Some(18));
        assert_eq!(head_end_index(b"GET / HTTP/1.1\n\nbody"), Some(16));
        assert_eq!(head_end_index(b"no body here"), None);
    }

    #[test]
    fn route_connect_claims_doors_and_never_chains_into_itself() {
        let tmp = TcpListener::bind("127.0.0.1:0").unwrap();
        let advertised = tmp.local_addr().unwrap();
        drop(tmp);

        let engine = route_connect(&advertised.to_string(), None).expect("route");
        assert_ne!(engine, advertised);
        assert_eq!(current_target().expect("target"), engine);

        let tmp2 = TcpListener::bind("127.0.0.1:0").unwrap();
        let http_door = tmp2.local_addr().unwrap();
        drop(tmp2);
        claim(&http_door.to_string(), engine).expect("claim");
        assert_eq!(target_for(Some(http_door)), Ok(engine));

        set_target(&advertised.to_string());
        assert_eq!(target_for(None), Ok(engine));

        let engine2 = route_connect(&advertised.to_string(), None).expect("re-route");
        assert_ne!(engine2, advertised);
        assert_eq!(current_target().expect("target2"), engine2);
        assert!(is_claimed(&advertised));
    }

    #[test]
    fn socks5_handshake_survives_first_byte_sniff() {
        let engine_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let engine_addr = engine_listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut s, _) = engine_listener.accept().unwrap();
            let mut g = [0u8; 3];
            s.read_exact(&mut g).unwrap();
            assert_eq!(g[0], 0x05);
            s.write_all(&[0x05, 0x00]).unwrap();
            let mut req = [0u8; 4];
            s.read_exact(&mut req).unwrap();
            let mut body = vec![
                0u8;
                match req[3] {
                    1 => 6,
                    3 => {
                        let mut n = [0u8; 1];
                        s.read_exact(&mut n).unwrap();
                        s.read_exact(&mut vec![0u8; n[0] as usize + 2][..]).unwrap();
                        0
                    }
                    _ => 6,
                }
            ];
            if !body.is_empty() {
                s.read_exact(&mut body).unwrap();
            }
            s.write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .unwrap();
            let mut echo = [0u8; 4];
            s.read_exact(&mut echo).unwrap();
            s.write_all(&echo).unwrap();
        });

        let tmp = TcpListener::bind("127.0.0.1:0").unwrap();
        let door = tmp.local_addr().unwrap();
        drop(tmp);
        claim(&door.to_string(), engine_addr).expect("claim");

        let mut c = TcpStream::connect(door).unwrap();
        c.write_all(&[0x05, 0x01, 0x00]).unwrap();
        let mut r = [0u8; 2];
        c.read_exact(&mut r).unwrap();
        assert_eq!(
            r,
            [0x05, 0x00],
            "greeting must survive the first-byte sniff"
        );
        c.write_all(&[0x05, 0x01, 0x00, 0x01, 1, 2, 3, 4, 0x01, 0xbb])
            .unwrap();
        let mut rep = [0u8; 10];
        c.read_exact(&mut rep).unwrap();
        assert_eq!(rep[1], 0x00, "CONNECT reply: {rep:02x?}");
        c.write_all(b"ping").unwrap();
        let mut back = [0u8; 4];
        c.read_exact(&mut back).unwrap();
        assert_eq!(&back, b"ping");
    }

    #[test]
    fn socks5_dest_decoding() {
        assert_eq!(
            socks_dest(1, &[127, 0, 0, 1, 0x07, 0x53]),
            Some(("127.0.0.1".into(), 1875))
        );
        assert_eq!(
            socks_dest(
                3,
                &[
                    11, b'e', b'x', b'a', b'm', b'p', b'l', b'e', b'.', b'c', b'o', b'm', 0x01,
                    0xbb
                ]
            ),
            Some(("example.com".into(), 443))
        );
        let mut v6 = vec![0u8; 16];
        v6[15] = 1;
        v6.extend_from_slice(&443u16.to_be_bytes());
        assert_eq!(socks_dest(4, &v6), Some(("::1".into(), 443)));
        assert!(socks_dest(5, &[0; 6]).is_none());
        assert!(socks_dest(1, &[0; 3]).is_none());
    }
}
