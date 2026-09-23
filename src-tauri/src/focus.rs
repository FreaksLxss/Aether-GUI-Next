use tauri::{AppHandle, Emitter};

pub fn spawn_watcher(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };
        let own_pid = std::process::id();
        let mut last: Option<bool> = None;
        loop {
            let focused = unsafe {
                let hwnd = GetForegroundWindow();
                if hwnd.is_null() {
                    false
                } else {
                    let mut pid: u32 = 0;
                    GetWindowThreadProcessId(hwnd, &mut pid);
                    pid == own_pid
                }
            };
            if last != Some(focused) {
                last = Some(focused);
                let _ = app.emit("app://focused", focused);
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    });

    #[cfg(not(windows))]
    let _ = app;
}
