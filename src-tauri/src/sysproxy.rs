use std::sync::atomic::{AtomicBool, Ordering};

static PROXY_ENABLED: AtomicBool = AtomicBool::new(false);

/// Notify Windows (WinINet + shell) that the proxy settings changed, the way
/// legitimate apps do. Writing the registry keys alone without this broadcast
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
        // Tell WinINET to reload the cached proxy configuration.
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

        // Broadcast the classic "InternetSettings" change so browsers and
        // other system components pick up the new proxy immediately.
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

/// Check if the system proxy is currently set to our HTTP proxy bridge.
pub fn is_enabled() -> bool {
    PROXY_ENABLED.load(Ordering::Relaxed)
}

/// Enable the Windows system proxy, pointing it at the loopback HTTP bridge
/// which forwards through Aether's SOCKS5 listener at `addr`.
///
/// The bridge (not the SOCKS address) is what apps connect to, and Windows'
/// system proxy is HTTP-oriented — writing `socks=host:port` directly makes
/// the Settings UI mangle the entry and Chrome/Edge/Store apps ignore it.
#[cfg(target_os = "windows")]
pub fn enable(addr: &str) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    // Point the bridge's upstream at Aether's SOCKS5 listener.
    crate::httpproxy::set_target(addr);

    let listen = crate::httpproxy::local_addr()
        .ok_or_else(|| "HTTP proxy bridge is not running".to_string())?;

    let internet = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )
        .map_err(|e| format!("Failed to open registry: {e}"))?;

    // Enable proxy
    internet
        .set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("Failed to set ProxyEnable: {e}"))?;

    // Plain HTTP proxy pointing at our loopback bridge. No scheme prefix —
    // that is what Windows Settings renders as "proxy ip address:port" and
    // what every app (Chrome, Edge, Store, WinHTTP) honors.
    let proxy_value = format!("{}:{}", listen.ip(), listen.port());
    internet
        .set_value("ProxyServer", &proxy_value)
        .map_err(|e| format!("Failed to set ProxyServer: {e}"))?;

    // Bypass local addresses
    internet
        .set_value("ProxyOverride", &"<local>;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;localhost")
        .map_err(|e| format!("Failed to set ProxyOverride: {e}"))?;

    PROXY_ENABLED.store(true, Ordering::Relaxed);
    notify_proxy_changed();
    Ok(())
}

/// Disable the Windows system proxy.
#[cfg(target_os = "windows")]
pub fn disable() -> Result<(), String> {
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

    PROXY_ENABLED.store(false, Ordering::Relaxed);
    notify_proxy_changed();
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn enable(_addr: &str) -> Result<(), String> {
    Err("System proxy is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn disable() -> Result<(), String> {
    Err("System proxy is only supported on Windows".into())
}
