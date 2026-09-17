//! In-memory traffic counters — upload / download / rates.
//! Uses OS interface octet counters on Windows (GetIfTable2) so it works for
//! any app (browser, Telegram, video) regardless of capture mode / whether
//! the app respects the system proxy. Falls back to the proxy/TUN atomics on
//! other platforms or if the IP Helper call fails. Counters are process-
//! scoped: BASELINE is taken on first snapshot and never persisted, so totals
//! reset when the app process exits ("resets every time user turn off/on
//! the app").

use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::Instant;

#[derive(Serialize, Clone, Debug)]
pub struct TrafficStats {
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    pub tx_rate: u64,
    pub rx_rate: u64,
}

static TX_BYTES: AtomicU64 = AtomicU64::new(0);
static RX_BYTES: AtomicU64 = AtomicU64::new(0);

/// Previous snapshot used to compute B/s rate.
static PREV: Mutex<(u64, u64, Option<Instant>)> = Mutex::new((0, 0, None));
/// Baseline OS counters taken on first successful OS snapshot so `tx/rx`
/// are deltas from app start (in-memory reset).
static BASELINE: Mutex<Option<(u64, u64)>> = Mutex::new(None);

pub fn record_tx(n: u64) {
    if n == 0 {
        return;
    }
    TX_BYTES.fetch_add(n, Ordering::Relaxed);
}

pub fn record_rx(n: u64) {
    if n == 0 {
        return;
    }
    RX_BYTES.fetch_add(n, Ordering::Relaxed);
}

#[cfg(windows)]
fn os_counters() -> Option<(u64, u64)> {
    unsafe {
        use windows_sys::Win32::NetworkManagement::IpHelper::MIB_IF_TABLE2;
        use windows_sys::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2};

        let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        let ret = GetIfTable2(&mut table);
        if ret != 0 || table.is_null() {
            return None;
        }
        let num = (*table).NumEntries as usize;
        if num == 0 {
            FreeMibTable(table as *mut _);
            return None;
        }
        // MIB_IF_TABLE2 is variable-length: NumEntries + Table[1] as start
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), num);
        let mut out: u64 = 0;
        let mut inn: u64 = 0;
        for row in rows {
            // Skip software loopback (Type 24) — its counters double-count
            // loopback HTTP→SOCKS bridge traffic and are not real Internet use.
            // Otherwise sum every oper-up interface so Telegram/UDP/video that
            // bypasses the HTTP bridge is still captured.
            if row.Type == 24 {
                continue;
            }
            // IfOperStatusUp = 1
            if row.OperStatus != 1 {
                continue;
            }
            out = out.wrapping_add(row.OutOctets);
            inn = inn.wrapping_add(row.InOctets);
        }
        FreeMibTable(table as *mut _);
        // If both zero, treat as no data (e.g. all adapters down)
        if out == 0 && inn == 0 {
            return None;
        }
        Some((out, inn))
    }
}

/// Snapshot current totals + rates. On Windows prefers OS counters (system-
/// wide) so it works regardless of capture mode; falls back to proxy/TUN
/// atomics elsewhere.
pub fn snapshot() -> TrafficStats {
    #[cfg(windows)]
    {
        if let Some((cur_tx, cur_rx)) = os_counters() {
            // Establish baseline on first call
            let (base_tx, base_rx) = {
                let mut base = BASELINE.lock().unwrap();
                match *base {
                    Some(v) => v,
                    None => {
                        *base = Some((cur_tx, cur_rx));
                        (cur_tx, cur_rx)
                    }
                }
            };
            let tx = cur_tx.saturating_sub(base_tx);
            let rx = cur_rx.saturating_sub(base_rx);

            let mut prev = PREV.lock().unwrap();
            let now = Instant::now();
            let (tx_rate, rx_rate) = match prev.2 {
                Some(prev_time) => {
                    let elapsed = now.duration_since(prev_time).as_secs_f64();
                    if elapsed > 0.05 {
                        let dtx = (tx.saturating_sub(prev.0) as f64 / elapsed) as u64;
                        let drx = (rx.saturating_sub(prev.1) as f64 / elapsed) as u64;
                        (dtx, drx)
                    } else {
                        (0, 0)
                    }
                }
                None => (0, 0),
            };
            *prev = (tx, rx, Some(now));
            return TrafficStats {
                tx_bytes: tx,
                rx_bytes: rx,
                tx_rate,
                rx_rate,
            };
        }
    }

    // Fallback: proxy/TUN atomics
    let tx = TX_BYTES.load(Ordering::Relaxed);
    let rx = RX_BYTES.load(Ordering::Relaxed);
    let mut prev = PREV.lock().unwrap();
    let now = Instant::now();
    let (tx_rate, rx_rate) = match prev.2 {
        Some(prev_time) => {
            let elapsed = now.duration_since(prev_time).as_secs_f64();
            if elapsed > 0.05 {
                let dtx = tx.saturating_sub(prev.0) as f64 / elapsed;
                let drx = rx.saturating_sub(prev.1) as f64 / elapsed;
                (dtx as u64, drx as u64)
            } else {
                (0, 0)
            }
        }
        None => (0, 0),
    };
    *prev = (tx, rx, Some(now));
    TrafficStats {
        tx_bytes: tx,
        rx_bytes: rx,
        tx_rate,
        rx_rate,
    }
}

pub fn reset() {
    TX_BYTES.store(0, Ordering::Relaxed);
    RX_BYTES.store(0, Ordering::Relaxed);
    *BASELINE.lock().unwrap() = None;
    *PREV.lock().unwrap() = (0, 0, None);
}

#[derive(Serialize, Clone, Debug)]
pub struct ActiveConn {
    pub pid: u32,
    pub exe: String,
    pub local: String,
    pub remote: String,
    pub state: String,
    pub proto: String,
}

#[cfg(windows)]
fn pid_exe(pid: u32) -> String {
    if pid == 0 {
        return "System Idle".into();
    }
    if pid == 4 {
        return "System".into();
    }
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return String::new();
        }
        let mut buf = [0u16; 520];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(h);
        if ok == 0 || size == 0 {
            return String::new();
        }
        let full = String::from_utf16_lossy(&buf[..size as usize]);
        // basename
        let base = full.rsplit(['\\', '/']).next().unwrap_or(&full);
        base.to_string()
    }
}

#[cfg(windows)]
fn tcp_state_label(s: u32) -> &'static str {
    match s {
        1 => "CLOSED",
        2 => "LISTEN",
        3 => "SYN_SENT",
        4 => "SYN_RCVD",
        5 => "ESTABLISHED",
        6 => "FIN_WAIT1",
        7 => "FIN_WAIT2",
        8 => "CLOSE_WAIT",
        9 => "CLOSING",
        10 => "LAST_ACK",
        11 => "TIME_WAIT",
        12 => "DELETE_TCB",
        _ => "UNKNOWN",
    }
}

#[cfg(windows)]
fn fmt_ipv4(addr: u32, port_net: u32) -> String {
    // dwAddr is host-order? Actually network order in MIB rows. Empirically GetExtendedTcpTable stores in network byte order.
    // Convert: addr as u32 -> bytes in network order already, decode as big-endian IP.
    let ip = std::net::Ipv4Addr::from(u32::from_be(addr));
    // dwPort is in network byte order in low 16 bits shifted? MIB stores port in network byte order in dwLocalPort.
    // In MIB_TCPROW_OWNER_PID dwLocalPort is network byte order. So ntohs.
    let port = u16::from_be((port_net & 0xFFFF) as u16);
    if port == 0 {
        ip.to_string()
    } else {
        format!("{ip}:{port}")
    }
}

pub fn active_connections() -> Vec<ActiveConn> {
    #[cfg(not(windows))]
    {
        return Vec::new();
    }
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::NetworkManagement::IpHelper::{
            GetExtendedTcpTable, GetExtendedUdpTable,
        };
        let mut out: Vec<ActiveConn> = Vec::new();
        // TCP
        {
            let mut size: u32 = 0;
            // first call to get size
            GetExtendedTcpTable(std::ptr::null_mut(), &mut size, 0, 2, 5, 0);
            if size > 0 && size < 8 * 1024 * 1024 {
                let mut buf: Vec<u8> = vec![0u8; size as usize];
                let ret = GetExtendedTcpTable(buf.as_mut_ptr() as *mut _, &mut size, 1, 2, 5, 0);
                if ret == 0 {
                    let num = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
                    let row_size = std::mem::size_of::<
                        windows_sys::Win32::NetworkManagement::IpHelper::MIB_TCPROW_OWNER_PID,
                    >();
                    let base = buf.as_ptr().add(4);
                    for i in 0..num {
                        if i * row_size + row_size > buf.len() {
                            break;
                        }
                        let row = &*(base.add(i * row_size) as *const windows_sys::Win32::NetworkManagement::IpHelper::MIB_TCPROW_OWNER_PID);
                        // skip loopback remote? keep all but could filter
                        let exe = pid_exe(row.dwOwningPid);
                        out.push(ActiveConn {
                            pid: row.dwOwningPid,
                            exe,
                            local: fmt_ipv4(row.dwLocalAddr, row.dwLocalPort),
                            remote: fmt_ipv4(row.dwRemoteAddr, row.dwRemotePort),
                            state: tcp_state_label(row.dwState).into(),
                            proto: "TCP".into(),
                        });
                        if out.len() >= 128 {
                            break;
                        }
                    }
                }
            }
        }
        // UDP (no remote/state)
        {
            let mut size: u32 = 0;
            GetExtendedUdpTable(std::ptr::null_mut(), &mut size, 0, 2, 1, 0);
            if size > 0 && size < 8 * 1024 * 1024 {
                let mut buf: Vec<u8> = vec![0u8; size as usize];
                let ret = GetExtendedUdpTable(buf.as_mut_ptr() as *mut _, &mut size, 1, 2, 1, 0);
                if ret == 0 {
                    let num = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
                    let row_size = std::mem::size_of::<
                        windows_sys::Win32::NetworkManagement::IpHelper::MIB_UDPROW_OWNER_PID,
                    >();
                    let base = buf.as_ptr().add(4);
                    for i in 0..num {
                        if i * row_size + row_size > buf.len() {
                            break;
                        }
                        let row = &*(base.add(i * row_size) as *const windows_sys::Win32::NetworkManagement::IpHelper::MIB_UDPROW_OWNER_PID);
                        let exe = pid_exe(row.dwOwningPid);
                        out.push(ActiveConn {
                            pid: row.dwOwningPid,
                            exe,
                            local: fmt_ipv4(row.dwLocalAddr, row.dwLocalPort),
                            remote: "*:*".into(),
                            state: "".into(),
                            proto: "UDP".into(),
                        });
                        if out.len() >= 160 {
                            break;
                        }
                    }
                }
            }
        }
        // Sort: ESTABLISHED first, then by exe
        out.sort_by(|a, b| {
            let ak = if a.state == "ESTABLISHED" { 0 } else { 1 };
            let bk = if b.state == "ESTABLISHED" { 0 } else { 1 };
            ak.cmp(&bk)
                .then_with(|| a.exe.cmp(&b.exe))
                .then_with(|| a.pid.cmp(&b.pid))
        });
        // dedup pid+local+remote to keep list short, cap 64 rows
        out.truncate(64);
        out
    }
}

/// Current totals without advancing the rate window — used only if needed.
#[allow(dead_code)]
pub fn totals() -> (u64, u64) {
    // Prefer OS delta if available
    #[cfg(windows)]
    {
        if let Some((cur_tx, cur_rx)) = os_counters() {
            if let Some((base_tx, base_rx)) = *BASELINE.lock().unwrap() {
                return (
                    cur_tx.saturating_sub(base_tx),
                    cur_rx.saturating_sub(base_rx),
                );
            }
        }
    }
    (
        TX_BYTES.load(Ordering::Relaxed),
        RX_BYTES.load(Ordering::Relaxed),
    )
}
