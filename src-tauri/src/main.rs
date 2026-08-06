#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod aether;
mod commands;
mod error;
mod events;
mod focus;
mod history;
mod presets;
mod state;
mod sysproxy;
mod tray;
mod tun;
mod updater;

use state::AppState;
use tauri::{Manager, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .setup(|app| {
            let data_dir = app.handle().path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            // Reap any Aether process left running from a prior crash before
            // the user can click Connect and spawn a second one onto the
            // same port.
            aether::orphan::reap_orphan(&data_dir);
            tun::cleanup::reap_orphan_tun(&data_dir);
            focus::spawn_watcher(app.handle().clone());
            tray::init(app)?;
            // Start minimized if the user opted in (paired with close-to-tray
            // and launch-at-startup so the app quietly sits in the tray).
            // Only applies when close_to_tray is also enabled — otherwise
            // there would be no way to bring the window back.
            {
                use tauri_plugin_store::StoreExt;
                let start_minimized = app
                    .handle()
                    .store("settings.json")
                    .ok()
                    .and_then(|s| {
                        let minimize = s
                            .get("minimize_on_startup")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let close_to_tray = s
                            .get("close_to_tray")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        Some(minimize && close_to_tray)
                    })
                    .unwrap_or(false);
                if start_minimized {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
            // Restore window position from last session
            {
                use tauri_plugin_store::StoreExt;
                if let Some((x, y, w, h)) = app
                    .handle()
                    .store("settings.json")
                    .ok()
                    .and_then(|s| s.get("window_position"))
                    .and_then(|v| {
                        let x = v.get("x")?.as_f64()?;
                        let y = v.get("y")?.as_f64()?;
                        let w = v.get("width")?.as_f64()?;
                        let h = v.get("height")?.as_f64()?;
                        Some((x, y, w, h))
                    })
                {
                    // Ignore obviously invalid positions (off-screen, zero-size)
                    let valid = w > 100.0
                        && h > 100.0
                        && x > -10_000.0
                        && y > -10_000.0
                        && x < 20_000.0
                        && y < 20_000.0;
                    if valid {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(x as i32, y as i32),
                            ));
                            let _ = window.set_size(tauri::Size::Physical(
                                tauri::PhysicalSize::new(w as u32, h as u32),
                            ));
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::get_status,
            commands::get_default_profile,
            commands::set_default_profile,
            commands::get_close_to_tray,
            commands::set_close_to_tray,
            commands::set_always_on_top,
            commands::get_always_on_top,
            commands::get_history,
            commands::clear_history,
            commands::get_minimize_on_startup,
            commands::set_minimize_on_startup,
            commands::set_system_proxy,
            commands::set_system_proxy_addr,
            commands::get_system_proxy,
            commands::check_update,
            commands::get_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::aether_binary_exists,
            commands::download_aether,
            commands::read_file,
            commands::write_file,
            commands::save_window_position,
            commands::get_window_position,
            commands::is_tun_available,
            commands::get_tun_active,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if tray::get_close_to_tray() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // Save window position on move/resize
            if let WindowEvent::Moved(_) | WindowEvent::Resized(_) = event {
                if let Ok(pos) = window.outer_position() {
                    if let Ok(size) = window.outer_size() {
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = window.clone().app_handle().store("settings.json") {
                            let pos = serde_json::json!({
                                "x": pos.x,
                                "y": pos.y,
                                "width": size.width,
                                "height": size.height,
                            });
                            store.set("window_position", pos);
                            let _ = store.save();
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                let data_dir = app_handle
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::env::temp_dir());
                aether::shutdown_blocking(&state.manager, &data_dir, app_handle);
            }
        });
}
