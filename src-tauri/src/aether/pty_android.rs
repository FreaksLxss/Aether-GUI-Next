//! Android backend for running aether: a plain piped subprocess instead of a
//! PTY. Android has no terminal session for the app to own (and portable-pty
//! is not compiled for this target), and aether needs none: the GUI already
//! passes the whole profile as flags/env (see pty.rs's spawn for the desktop
//! equivalent with real terminal semantics).
//!
//! Consequences, by design:
//! - `prompts_done` is instantly true — with piped stdin aether never shows
//!   its interactive menus, so there is nothing to answer; a required
//!   one-time code is still typed by the user through `send_line`.
//! - `send_ctrl_c` is a no-op — the ETX byte only means SIGINT inside a real
//!   terminal. Shutdown always falls through to `kill()` after the grace
//!   period (see status::GRACEFUL_SHUTDOWN_GRACE).

use super::profiles::ConnectionProfile;
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
            .or(Some(0))
    }

    /// No-op on Android: a piped stdin carries no terminal signals. See the
    /// module doc — the monitor's kill() fallback handles shutdown.
    pub fn send_ctrl_c(&self) {}

    /// Writes a user-typed line (e.g. the Zero Trust one-time code, which
    /// Aether ≥1.6.0 reads from stdin) to the child's stdin.
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

/// Spawns Aether as a subprocess with piped stdio and forwards every output
/// line on either stream to the frontend's log panel. `cwd` stays the app's
/// data dir so the provisioned identity persists across launches (same
/// invariant as the desktop PTY spawn).
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
    cmd.env(
        "AETHER_MASQUE_HTTP2",
        if profile.masque_http2 { "1" } else { "0" },
    );
    // Aether ≥1.7.0 opt-outs (see pty.rs's spawn for details).
    if !profile.route_sniff {
        cmd.env("AETHER_ROUTE_SNIFF", "0");
    }
    if let Some(ms) = profile.route_sniff_ms {
        cmd.env("AETHER_ROUTE_SNIFF_MS", ms.to_string());
    }
    if !profile.auto_reprovision {
        cmd.env("AETHER_REPROVISION", "0");
    }

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

    // Flags/env cover every interactive prompt on a piped stdin, so nothing
    // to answer; the monitor thread only needs this to move Launching →
    // Connecting before the SOCKS port goes live.
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
            Ok(0) => break, // EOF: process exited or pipe closed
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
