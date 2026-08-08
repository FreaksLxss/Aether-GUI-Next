//! Loopback HTTP → SOCKS5 bridge.
//!
//! Aether only exposes a SOCKS5 listener, but the Windows system proxy is an
//! HTTP proxy: writing `socks=host:port` into `ProxyServer` makes the Settings
//! UI mangle the entry and causes Chrome/Edge/Store apps to ignore it entirely.
//! Karing — and every other tunnel GUI — instead runs a small local HTTP proxy
//! and points the OS at that.
//!
//! This module owns that bridge: a `TcpListener` bound to `127.0.0.1:0`
//! (loopback only, so nothing is ever exposed to the LAN) that accepts HTTP
//! requests and CONNECT tunnels, forwards each one through Aether's SOCKS5
//! upstream, and relays bytes both ways. The listener runs for the life of the
//! app; enabling the system proxy merely decides whether the OS routes traffic
//! into it.

use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// The SOCKS5 upstream to bridge to. Kept as a string because the frontend
/// passes `bind_address`, which may be `0.0.0.0:1819` in LAN mode — that gets
/// normalized to loopback here (connecting to `0.0.0.0` directly would fail).
/// `None` until `set_target` runs; `current_target` falls back to the default.
static TARGET: Mutex<Option<String>> = Mutex::new(None);
/// Bound address of the listener once started (remains `None` if bind failed).
static LISTEN: Mutex<Option<SocketAddr>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);

const MAX_HEAD: usize = 64 * 1024;
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_SOCKS: &str = "127.0.0.1:1819";

/// Normalize a bind address for use as SOCKS5 upstream. Aether serving on
/// `0.0.0.0`/`::` still answers on loopback, and `TcpStream::connect` to an
/// unspecified address fails on every OS.
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

/// Point the bridge at a new SOCKS5 upstream (the Aether bind address).
pub fn set_target(addr: &str) {
    *TARGET.lock().unwrap() = Some(normalize_target(addr));
}

/// The loopback address the bridge is bound to, if it started successfully.
pub fn local_addr() -> Option<SocketAddr> {
    *LISTEN.lock().unwrap()
}

/// Start the loopback HTTP → SOCKS5 bridge. Idempotent: a second call just
/// returns the already-bound address.
pub fn start() -> Result<SocketAddr, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return local_addr().ok_or_else(|| "bridge listener has no bound address".to_string());
    }
    // Bind an ephemeral loopback port so we never collide with Aether's SOCKS
    // port or the user's chosen bind address. Whatever port we land on is what
    // `local_addr()` reports and what gets written into ProxyServer.
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

// ─── Per-connection handling ────────────────────────────────────────────

fn handle_client(mut client: TcpStream) {
    let (head_bytes, leftover) = match read_head(&mut client) {
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

    let target_addr = match current_target() {
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
        // origin-form request ("GET /path HTTP/1.1") — the host (and optional
        // :port) lives in the Host header we already forward untouched.
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
        // No path rewrite needed — origin-form is already what the origin
        // server expects.
        if upstream.write_all(head).is_err() {
            return;
        }
        let tail = std::mem::take(&mut leftover);
        if upstream.write_all(&tail).is_err() {
            return;
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

    // Snip the "http://host:port" prefix off the request line so the origin
    // server gets a plain origin-form request, then forward head + body.
    let rewritten = rewrite_http(head, method, &strict_path);
    if upstream.write_all(&rewritten).is_err() {
        return;
    }
    let tail = std::mem::take(&mut leftover);
    if upstream.write_all(&tail).is_err() {
        return;
    }
    relay(client, upstream);
}

/// Echo bytes in both directions until one side closes. The loop handles
/// keep-alive naturally: whatever the client writes next still flows across,
/// and the response of the moment still flows back.
fn relay(client: TcpStream, upstream: TcpStream) {
    let c1 = client.try_clone();
    let c2 = client.try_clone();
    let u1 = upstream.try_clone();
    let u2 = upstream.try_clone();
    let (Ok(c1), Ok(c2), Ok(u1), Ok(u2)) = (c1, c2, u1, u2) else {
        return;
    };

    let t1 = std::thread::spawn(move || {
        let _ = pipe(c1, u1);
    });
    let t2 = std::thread::spawn(move || {
        let _ = pipe(u2, c2);
    });
    let _ = t1.join();
    let _ = t2.join();
}

fn pipe(mut src: TcpStream, mut dst: TcpStream) -> io::Result<u64> {
    let n = io::copy(&mut src, &mut dst)?;
    let _ = dst.shutdown(std::net::Shutdown::Write);
    Ok(n)
}

// ─── Request head reading / parsing ─────────────────────────────────────

/// Read bytes until the blank line ending the request head. Returns
/// `(head, leftover)` where `leftover` is any body bytes that arrived in the
/// same TCP segment (and must be forwarded right after the head).
fn read_head(stream: &mut TcpStream) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let mut buffer = Vec::with_capacity(4096);
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

/// Index just past the `\r\n\r\n` (or `\n\n`) that terminates a request head.
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

/// Extract `Host` (and its optional `:port`) from the request head, for
/// origin-form requests where the host lives in a header rather than the
/// request line.
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

/// Parse an authority (`host`, `host:port`, `[v6]:port`, host excluding port).
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

/// Split a request target into `(host, port)` and the origin-form path to
/// send upstream. For origin-form targets (already `"/…"`) host comes back
/// empty and the caller falls back to the `Host` header.
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
    // origin-form or `*`; no absolute path derivation, forward as-is.
    (String::new(), 0, origin)
}

/// Rebuild the head with an origin-form request line so the origin server
/// understands the request. Preserves the original line-terminator style
/// (`\r\n` for HTTP/1.x, bare `\n` for any oddball client).
fn rewrite_http(head: &[u8], method: &str, path: &str) -> Vec<u8> {
    // Find the end of the first line.
    let end = head
        .windows(2)
        .position(|w| w == b"\r\n")
        .map(|i| i + 2)
        .or_else(|| head.iter().position(|&b| b == b'\n').map(|i| i + 1))
        .unwrap_or(head.len());

    // The remaining headers start right after the request line.
    let tail = &head[end..];

    let mut out = Vec::with_capacity(tail.len() + 64);
    out.extend_from_slice(format!("{method} {path}\r\n").as_bytes());
    out.extend_from_slice(tail);
    out
}

fn write_simple(stream: &mut TcpStream, bytes: &[u8]) -> io::Result<()> {
    stream.write_all(bytes)
}

// ── SOCKS5 client ───────────────────────────────────────────────────────

fn current_target() -> Result<SocketAddr, String> {
    TARGET
        .lock()
        .unwrap()
        .as_deref()
        .unwrap_or(DEFAULT_SOCKS)
        .parse()
        .map_err(|e| format!("invalid SOCKS target: {e}"))
}

/// Open a SOCKS5 connection to `host:port` through the configured upstream,
/// supporting IPv4, IPv6, and domain destinations.
fn socks_connect(host: &str, port: u16, upstream: &SocketAddr) -> Result<TcpStream, String> {
    let mut stream = TcpStream::connect_timeout(upstream, UPSTREAM_TIMEOUT)
        .map_err(|e| format!("connect upstream: {e}"))?;
    let _ = stream.set_nodelay(true);

    // No-auth greeting.
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

    // CONNECT request with the correct address type.
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

    // Read [ver, rep, rsv, atyp] then skip the rest of the reply.
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
}
