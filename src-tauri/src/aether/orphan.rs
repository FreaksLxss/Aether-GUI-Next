use std::fs;
use std::path::{Path, PathBuf};

fn pid_file(data_dir: &Path) -> PathBuf {
    data_dir.join("aether.pid")
}

pub fn write_pid(data_dir: &Path, pid: u32) {
    let _ = fs::write(pid_file(data_dir), pid.to_string());
}

pub fn clear_pid(data_dir: &Path) {
    let _ = fs::remove_file(pid_file(data_dir));
}

pub fn reap_orphan(data_dir: &Path) {
    let path = pid_file(data_dir);
    let Ok(contents) = fs::read_to_string(&path) else {
        return;
    };
    if let Ok(pid) = contents.trim().parse::<u32>() {
        if is_alive(pid) {
            kill_pid(pid);
        }
    }
    let _ = fs::remove_file(&path);
}

#[cfg(unix)]
fn is_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(unix)]
fn kill_pid(pid: u32) {
    let _ = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status();
}

#[cfg(windows)]
fn is_alive(pid: u32) -> bool {
    crate::childproc::hidden(&mut std::process::Command::new("tasklist"))
        .args(["/FI", &format!("PID eq {pid}")])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

#[cfg(windows)]
fn kill_pid(pid: u32) {
    let _ = crate::childproc::hidden(&mut std::process::Command::new("taskkill"))
        .args(["/PID", &pid.to_string(), "/F"])
        .status();
}
