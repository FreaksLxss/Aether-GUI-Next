
use super::profiles::{ConnectionProfile, PROXY_ENV_KEYS};
use super::pty_output::{drain_lines, strip_ansi};
use crate::error::AetherError;
use crate::events::{now_millis, LogEvent};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

pub struct PtySession {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    prompts_done: Arc<AtomicBool>,
}

impl PtySession {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn prompts_done(&self) -> bool {
        self.prompts_done.load(Ordering::Relaxed)
    }

    pub fn try_wait(&mut self) -> Option<i32> {
        self.child
            .try_wait()
            .ok()
            .flatten()
            .and_then(|st| st.code())
    }

    pub fn send_ctrl_c(&self) {}

    pub fn send_line(&self, line: &str) {
        if let Ok(mut w) = self.stdin.lock() {
            let _ = w.write_all(line.as_bytes());
            let _ = w.write_all(b"\n");
            let _ = w.flush();
        }
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }
}

pub fn spawn(
    binary: &Path,
    cwd: &Path,
    profile: ConnectionProfile,
    log_tx: Sender<LogEvent>,
) -> Result<PtySession, AetherError> {
    let mut cmd = Command::new(binary);
    cmd.current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for arg in profile.as_args() {
        cmd.arg(arg);
    }
    for (key, value) in profile.environment() {
        cmd.env(key, value);
    }
    for k in PROXY_ENV_KEYS {
        cmd.env_remove(k);
    }
    cmd.env("NO_PROXY", "localhost,127.0.0.1,::1");
    cmd.env("no_proxy", "localhost,127.0.0.1,::1");

    let mut child = cmd
        .spawn()
        .map_err(|e| AetherError::SpawnFailed(e.to_string()))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AetherError::SpawnFailed("no stdin pipe".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AetherError::SpawnFailed("no stdout pipe".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AetherError::SpawnFailed("no stderr pipe".into()))?;

    let prompts_done = Arc::new(AtomicBool::new(true));

    let log_tx_stdout = log_tx.clone();
    std::thread::spawn(move || pipe_loop(stdout, log_tx_stdout));
    std::thread::spawn(move || pipe_loop(stderr, log_tx));

    Ok(PtySession {
        child,
        stdin: Arc::new(Mutex::new(stdin)),
        prompts_done,
    })
}

fn pipe_loop<R: Read + Send + 'static>(mut reader: R, log_tx: Sender<LogEvent>) {
    let mut line_buf = String::new();
    let mut byte_buf = [0u8; 4096];
    loop {
        let n = match reader.read(&mut byte_buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        line_buf.push_str(&String::from_utf8_lossy(&byte_buf[..n]));
        for raw_line in drain_lines(&mut line_buf) {
            let line = strip_ansi(&raw_line);
            if line.is_empty() {
                continue;
            }
            let _ = log_tx.send(LogEvent {
                line,
                timestamp: now_millis(),
            });
        }
    }
}
