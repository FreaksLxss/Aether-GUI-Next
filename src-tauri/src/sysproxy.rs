//! Cross-platform system proxy manager.
//!
//! Every OS only ever gets pointed at our loopback HTTP→SOCKS5 bridge (the
//! same `httpproxy` module the Windows path uses), so the *shape* of the
//! config is identical everywhere — only the mechanism for telling the OS
//! "use 127.0.0.1:port as your proxy" differs:
//!
//! - Windows: writes `ProxyEnable`/`ProxyServer` in `HKCU\...\Internet
//!   Settings` and broadcasts `WM_SETTINGCHANGE` (the WinINet/SHACLE path
//!   legitimate apps use, which also avoids AV heuristics flagging the write).
//! - Linux: `gsettings` on `org.gnome.system.proxy` (GNOME/GTK desktops —
//!   what Settings, Chromium, Firefox-native and most GTK apps read).
//! - macOS: `networksetup -setwebproxy/-setsecurewebproxy` on each network
//!   service.
//!
//! Because both the main tunnel and the IP-changer share one OS-level proxy
//! key, the module tracks an *owner* (`SOURCE_MAIN` vs `SOURCE_IP_CHANGER`)
//! plus the upstream SOCKS port, so the two toggles can't silently clobber
//! each other and the navbar can show *which* proxy is live.

use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU8, Ordering};

static PROXY_ENABLED: AtomicBool = AtomicBool::new(false);

/// Who set the current system proxy.
pub const SOURCE_NONE: u8 = 0;
pub const SOURCE_MAIN: u8 = 1;
pub const SOURCE_IP_CHANGER: u8 = 2;

static PROXY_SOURCE: AtomicU8 = AtomicU8::new(SOURCE_NONE);
/// SOCKS port behind the live proxy (e.g. 1819 main / 9050 Tor), used by the
/// navbar indicator to show *which* proxy is on.
static PROXY_SOCKS_PORT: AtomicU16 = AtomicU16::new(0);

pub fn source() -> u8 {
    PROXY_SOURCE.load(Ordering::Relaxed)
}

pub fn socks_port() -> u16 {
    PROXY_SOCKS_PORT.load(Ordering::Relaxed)
}

/// Check if we currently have the system proxy set.
pub fn is_enabled() -> bool {
    PROXY_ENABLED.load(Ordering::Relaxed)
}

/// Refuse to take over the system proxy from a *different* owner. Same-owner
/// re-enables (e.g. the main toggle re-pointing after a profile change) pass.
pub fn ensure_free(source: u8) -> Result<(), String> {
    if PROXY_ENABLED.load(Ordering::Relaxed) && PROXY_SOURCE.load(Ordering::Relaxed) != source {
        Err("A system proxy is already set — turn it off first before switching".to_string())
    } else {
        Ok(())
    }
}

/// Tear down the proxy on tunnel stop/disconnect, but only when the main
/// tunnel *owns* it — never clobber an IP-changer's proxy while it's live.
pub fn disable_if_main() {
    if PROXY_SOURCE.load(Ordering::Relaxed) == SOURCE_MAIN {
        let _ = disable();
    }
}

/// Enable the system proxy, pointing the OS at the loopback HTTP bridge whose
/// upstream is Aether's SOCKS5 listener at `addr`. Works on every platform;
/// see the module docs for how each OS applies the bridge address.
pub fn enable(addr: &str, source: u8) -> Result<(), String> {
    crate::httpproxy::set_target(addr);
    let listen = crate::httpproxy::local_addr()
        .ok_or_else(|| "HTTP proxy bridge is not running".to_string())?;
    let port = listen.port();

    #[cfg(target_os = "windows")]
    set_proxy_windows(port)?;
    #[cfg(target_os = "linux")]
    set_proxy_linux(port)?;
    #[cfg(target_os = "macos")]
    set_proxy_macos(port)?;
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return Err("System proxy is not supported on this OS yet".to_string());

    PROXY_ENABLED.store(true, Ordering::Relaxed);
    PROXY_SOURCE.store(source, Ordering::Relaxed);
    if let Some(port) = addr
        .rsplit_once(':')
        .and_then(|(_, p)| p.parse::<u16>().ok())
    {
        PROXY_SOCKS_PORT.store(port, Ordering::Relaxed);
    }
    Ok(())
}

/// Disable the system proxy on the current OS.
pub fn disable() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    clear_proxy_windows()?;
    #[cfg(target_os = "linux")]
    clear_proxy_linux()?;
    #[cfg(target_os = "macos")]
    clear_proxy_macos()?;
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return Err("System proxy is not supported on this OS yet".to_string());

    PROXY_ENABLED.store(false, Ordering::Relaxed);
    PROXY_SOURCE.store(SOURCE_NONE, Ordering::Relaxed);
    PROXY_SOCKS_PORT.store(0, Ordering::Relaxed);
    Ok(())
}

// ─── Windows ────────────────────────────────────────────────────────────

/// Notify Windows (WinINet + shell) that the proxy settings changed, the way
/// legitimate apps do — writing the registry keys alone without this broadcast
/// is the exact OS pattern AV heuristics flag as proxy hijacking.
#[cfg(target_os = "windows")]
fn notify_proxy_changed() {
    use windows_sys::Win32::Networking::WinInet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    unsafe {
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_SETTINGS_CHANGED,
            std::ptr::null_mut(),
            0,
        );
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_REFRESH,
            std::ptr::null_mut(),
            0,
        );

        let settings: Vec<u16> = "InternetSettings\0".encode_utf16().collect();
        let mut result = 0usize;
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            settings.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            1000,
            &mut result,
        );
    }
}

#[cfg(target_os = "windows")]
fn set_proxy_windows(port: u16) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let listen = crate::httpproxy::local_addr()
        .ok_or_else(|| "HTTP proxy bridge is not running".to_string())?;

    let internet = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )
        .map_err(|e| format!("Failed to open registry: {e}"))?;

    internet
        .set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("Failed to set ProxyEnable: {e}"))?;

    // Plain HTTP proxy pointing at our loopback bridge. No scheme prefix —
    // that is what Windows Settings renders as "proxy ip address:port" and
    // what every app (Chrome, Edge, Store, WinHTTP) honors.
    let proxy_value = format!("127.0.0.1:{port}");
    internet
        .set_value("ProxyServer", &proxy_value)
        .map_err(|e| format!("Failed to set ProxyServer: {e}"))?;

    internet
        .set_value(
            "ProxyOverride",
            &"<local>;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;localhost",
        )
        .map_err(|e| format!("Failed to set ProxyOverride: {e}"))?;

    notify_proxy_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
fn clear_proxy_windows() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let internet = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )
        .map_err(|e| format!("Failed to open registry: {e}"))?;

    internet
        .set_value("ProxyEnable", &0u32)
        .map_err(|e| format!("Failed to clear ProxyEnable: {e}"))?;

    notify_proxy_changed();
    Ok(())
}

// ─── Linux ──────────────────────────────────────────────────────────────

/// Run a command, returning a friendly error naming the tool if it is
/// missing or exits non-zero.
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn run_cmd(cmd: &str, args: &[&str]) -> Result<(), String> {
    let out = Command::new(cmd).args(args).output().map_err(|e| {
        format!("could not run `{cmd}` ({e}) — system proxy needs the {cmd} helper installed",)
    })?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "`{cmd}` failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

#[cfg(target_os = "linux")]
fn set_proxy_linux(port: u16) -> Result<(), String> {
    // GNOME/GTK desktops read these GSettings keys, and `gsettings` is what
    // their Settings app writes through, so apps (and `Environment`) honor it.
    let schema = "org.gnome.system.proxy";
    run_cmd("gsettings", &["set", schema, "mode", "manual"])?;
    for sub in ["http", "https"] {
        run_cmd(
            "gsettings",
            &["set", schema, &format!("{sub}.host"), "127.0.0.1"],
        )?;
        run_cmd(
            "gsettings",
            &["set", schema, &format!("{sub}.port"), &port.to_string()],
        )?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn clear_proxy_linux() -> Result<(), String> {
    run_cmd(
        "gsettings",
        &["set", "org.gnome.system.proxy", "mode", "none"],
    )
}

// ─── macOS ──────────────────────────────────────────────────────────────

/// The user-facing network services (Wi-Fi, Ethernet, …) known to the system.
#[cfg(target_os = "macos")]
fn network_services() -> Result<Vec<String>, String> {
    let out = Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
        .map_err(|e| format!("could not run networksetup: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "networksetup -listallnetworkservices failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text
        .lines()
        // `networksetup` glibly embeds an "An asterisk (*) denotes..." line.
        .filter(|l| !l.starts_with('*') && !l.trim().is_empty())
        .map(|s| s.trim().to_string())
        .collect())
}

#[cfg(target_os = "macos")]
fn set_proxy_macos(port: u16) -> Result<(), String> {
    for service in network_services()? {
        run_cmd(
            "networksetup",
            &["-setwebproxy", &service, "127.0.0.1", &port.to_string()],
        )?;
        run_cmd(
            "networksetup",
            &[
                "-setsecurewebproxy",
                &service,
                "127.0.0.1",
                &port.to_string(),
            ],
        )?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn clear_proxy_macos() -> Result<(), String> {
    for service in network_services()? {
        run_cmd("networksetup", &["-setwebproxystate", &service, "off"])?;
        run_cmd(
            "networksetup",
            &["-setsecurewebproxystate", &service, "off"],
        )?;
    }
    Ok(())
}
