
#[cfg(not(target_os = "windows"))]
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU8, Ordering};

static PROXY_ENABLED: AtomicBool = AtomicBool::new(false);

pub const SOURCE_NONE: u8 = 0;
pub const SOURCE_MAIN: u8 = 1;
pub const SOURCE_IP_CHANGER: u8 = 2;

static PROXY_SOURCE: AtomicU8 = AtomicU8::new(SOURCE_NONE);
static PROXY_SOCKS_PORT: AtomicU16 = AtomicU16::new(0);

pub fn source() -> u8 {
    PROXY_SOURCE.load(Ordering::Relaxed)
}

pub fn socks_port() -> u16 {
    PROXY_SOCKS_PORT.load(Ordering::Relaxed)
}

pub fn is_enabled() -> bool {
    PROXY_ENABLED.load(Ordering::Relaxed)
}

pub fn ensure_free(source: u8) -> Result<(), String> {
    if PROXY_ENABLED.load(Ordering::Relaxed) && PROXY_SOURCE.load(Ordering::Relaxed) != source {
        Err("A system proxy is already set — turn it off first before switching".to_string())
    } else {
        Ok(())
    }
}

pub fn disable_if_main() {
    if PROXY_SOURCE.load(Ordering::Relaxed) == SOURCE_MAIN {
        let _ = disable();
    }
}

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

    let internet = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )
        .map_err(|e| format!("Failed to open registry: {e}"))?;

    internet
        .set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("Failed to set ProxyEnable: {e}"))?;

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
