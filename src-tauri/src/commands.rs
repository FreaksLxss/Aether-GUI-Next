use crate::aether::{self, profiles::ConnectionProfile};
use crate::error::AetherError;
use crate::history::{self, ConnectionEntry};
use crate::presets::{self, ProfilePreset};
use crate::state::{AppState, ConnectionState};
use crate::sysproxy;
use crate::tray;
use crate::updater;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, State};

static ALWAYS_ON_TOP: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn connect(
    app: AppHandle,
    state: State<AppState>,
    profile_override: Option<ConnectionProfile>,
) -> Result<(), AetherError> {
    aether::start_connect(app, state.manager.clone(), profile_override)
}

#[tauri::command]
pub fn disconnect(app: AppHandle, state: State<AppState>) -> Result<(), AetherError> {
    aether::request_disconnect(&app, &state.manager)
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> ConnectionState {
    state.manager.lock().unwrap().status()
}

#[tauri::command]
pub fn get_default_profile(app: AppHandle) -> ConnectionProfile {
    aether::profiles::load(&app)
}

#[tauri::command]
pub fn set_default_profile(app: AppHandle, profile: ConnectionProfile) -> Result<(), AetherError> {
    aether::profiles::save(&app, &profile);
    Ok(())
}

#[tauri::command]
pub fn get_close_to_tray() -> bool {
    tray::get_close_to_tray()
}

#[tauri::command]
pub fn set_close_to_tray(app: AppHandle, enabled: bool) {
    tray::set_close_to_tray(&app, enabled);
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), AetherError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AetherError::Internal("main window not found".into()))?;
    window
        .set_always_on_top(enabled)
        .map_err(|e| AetherError::Internal(e.to_string()))?;
    ALWAYS_ON_TOP.store(enabled, Ordering::Relaxed);
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set("always_on_top", serde_json::Value::Bool(enabled));
        let _ = store.save();
    }
    Ok(())
}

#[tauri::command]
pub fn get_always_on_top(app: AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    let enabled = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("always_on_top"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    ALWAYS_ON_TOP.store(enabled, Ordering::Relaxed);
    // Apply to window on load
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(enabled);
    }
    enabled
}

#[tauri::command]
pub fn get_history(app: AppHandle) -> Vec<ConnectionEntry> {
    history::load(&app)
}

#[tauri::command]
pub fn clear_history(app: AppHandle) {
    history::clear(&app);
}

#[tauri::command]
pub fn get_minimize_on_startup(app: AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("minimize_on_startup"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_minimize_on_startup(app: AppHandle, enabled: bool) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set("minimize_on_startup", serde_json::Value::Bool(enabled));
        let _ = store.save();
    }
}

#[tauri::command]
pub fn set_system_proxy(enabled: bool) -> Result<(), AetherError> {
    if enabled {
        // Use default SOCKS5 address — the profile's bind_address may not be
        // connected yet, so we read from the last-known profile.
        sysproxy::enable("127.0.0.1:1819").map_err(AetherError::Internal)
    } else {
        sysproxy::disable().map_err(AetherError::Internal)
    }
}

#[tauri::command]
pub fn set_system_proxy_addr(addr: String, enabled: bool) -> Result<(), AetherError> {
    if enabled {
        sysproxy::enable(&addr).map_err(AetherError::Internal)
    } else {
        sysproxy::disable().map_err(AetherError::Internal)
    }
}

#[tauri::command]
pub fn get_system_proxy() -> bool {
    sysproxy::is_enabled()
}

#[tauri::command]
pub async fn check_update(current_version: String) -> Result<updater::UpdateInfo, AetherError> {
    updater::check_for_update(&current_version)
        .await
        .map_err(AetherError::Internal)
}

#[tauri::command]
pub fn get_presets(app: AppHandle) -> Vec<ProfilePreset> {
    presets::load_all(&app)
}

#[tauri::command]
pub fn save_preset(app: AppHandle, name: String, profile: ConnectionProfile) -> Result<(), AetherError> {
    presets::save_preset(&app, &name, &profile).map_err(AetherError::Internal)
}

#[tauri::command]
pub fn delete_preset(app: AppHandle, name: String) {
    presets::delete_preset(&app, &name);
}

#[tauri::command]
pub fn aether_binary_exists(app: AppHandle) -> bool {
    let bin_name = if cfg!(windows) { "aether.exe" } else { "aether" };
    let dir = app
        .path()
        .resource_dir()
        .ok()
        .or_else(|| app.path().app_data_dir().ok());
    dir.map(|d| d.join("binaries").join(bin_name).exists())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn download_aether(app: AppHandle) -> Result<String, AetherError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AetherError::Internal(e.to_string()))?;
    let binaries_dir = dir.join("binaries");
    let path = updater::download_aether_binary(&binaries_dir)
        .await
        .map_err(AetherError::Internal)?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, AetherError> {
    std::fs::read_to_string(&path).map_err(|e| AetherError::Internal(e.to_string()))
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), AetherError> {
    std::fs::write(&path, contents).map_err(|e| AetherError::Internal(e.to_string()))
}

#[tauri::command]
pub fn save_window_position(app: AppHandle, x: f64, y: f64, width: f64, height: f64) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        let pos = serde_json::json!({ "x": x, "y": y, "width": width, "height": height });
        store.set("window_position", pos);
        let _ = store.save();
    }
}

#[tauri::command]
pub fn get_window_position(app: AppHandle) -> Option<(f64, f64, f64, f64)> {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("window_position"))
        .and_then(|v| {
            let x = v.get("x")?.as_f64()?;
            let y = v.get("y")?.as_f64()?;
            let w = v.get("width")?.as_f64()?;
            let h = v.get("height")?.as_f64()?;
            Some((x, y, w, h))
        })
}

#[tauri::command]
pub fn is_tun_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token_handle = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token_handle) == 0 {
                return false;
            }

            let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
            let mut return_length = 0u32;
            let success = GetTokenInformation(
                token_handle,
                TokenElevation,
                &mut elevation as *mut _ as *mut _,
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut return_length,
            );
            CloseHandle(token_handle);

            success != 0 && elevation.TokenIsElevated != 0
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn get_tun_active(state: State<AppState>) -> bool {
    state.tun_manager.lock().unwrap().is_active()
}
