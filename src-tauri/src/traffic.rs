//! In-memory traffic counters — upload / download / rates.
//! Counts bytes actually carried through the tunnel: the HTTP proxy relay
//! (`httpproxy.rs`) and the TUN forwarder (`tun/forwarder.rs`) feed the
//! atomics once per payload byte — a 330 MB download shows ≈330 MB, nothing
//! else on the NIC (background, retries, wire overhead) leaks in. ponytail:
//! in proxy mode, apps that ignore the system proxy aren't counted — switch
//! to per-NIC OS counters (`GetBestInterface` + `GetIfEntry2`) if system-wide
//! totals are ever wanted. Totals are in-memory: `reset()` on
//! connect/disconnect, gone on exit.

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

/// Totals + rates from the last observation window.
fn rates(tx: u64, rx: u64) -> TrafficStats {
    let mut prev = PREV.lock().unwrap();
    let now = Instant::now();
    let (tx_rate, rx_rate) = match prev.2 {
        Some(prev_time) => {
            let elapsed = now.duration_since(prev_time).as_secs_f64();
            if elapsed > 0.05 {
                (
                    (tx.saturating_sub(prev.0) as f64 / elapsed) as u64,
                    (rx.saturating_sub(prev.1) as f64 / elapsed) as u64,
                )
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

/// Snapshot current totals + rates — tunnel-scoped atomics only.
pub fn snapshot() -> TrafficStats {
    rates(
        TX_BYTES.load(Ordering::Relaxed),
        RX_BYTES.load(Ordering::Relaxed),
    )
}

pub fn reset() {
    TX_BYTES.store(0, Ordering::Relaxed);
    RX_BYTES.store(0, Ordering::Relaxed);
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
