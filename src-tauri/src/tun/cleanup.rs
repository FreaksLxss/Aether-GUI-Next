use std::path::Path;

const TUN_STATE_FILE: &str = "tun_state.json";

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct TunState {
    adapter_name: String,
    original_gateway: String,
    pid: u32,
}

pub fn write_tun_state(data_dir: &Path, adapter_name: &str, original_gateway: &str) {
    let state = TunState {
        adapter_name: adapter_name.to_string(),
        original_gateway: original_gateway.to_string(),
        pid: std::process::id(),
    };

    let path = data_dir.join(TUN_STATE_FILE);
    if let Ok(json) = serde_json::to_string(&state) {
        let _ = std::fs::write(&path, json);
    }
}

pub fn clear_tun_state(data_dir: &Path) {
    let path = data_dir.join(TUN_STATE_FILE);
    let _ = std::fs::remove_file(&path);
}

pub fn reap_orphan_tun(data_dir: &Path) {
    let path = data_dir.join(TUN_STATE_FILE);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let state: TunState = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            return;
        }
    };

    if is_process_alive(state.pid) {
        return;
    }

    log::info!(
        "[tun] Cleaning up orphaned TUN adapter '{}' (PID {} is dead)",
        state.adapter_name,
        state.pid
    );

    destroy_adapter(&state.adapter_name);

    if !state.original_gateway.is_empty() {
        restore_routes(&state.original_gateway);
    }

    let _ = std::process::Command::new("ipconfig")
        .arg("/flushdns")
        .output();

    let _ = std::fs::remove_file(&path);
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut exit_code = 0u32;
            let success = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            success != 0 && exit_code == 259 // STILL_ACTIVE
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn destroy_adapter(name: &str) {
    let _ = std::process::Command::new("netsh")
        .args(["interface", "delete", "interface", name])
        .output();
}

fn restore_routes(gateway: &str) {
    let _ = std::process::Command::new("route")
        .args([
            "change", "0.0.0.0", "mask", "0.0.0.0", gateway, "metric", "1",
        ])
        .output();
}
