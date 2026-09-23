use super::profiles::{ConnectionProfile, PROXY_ENV_KEYS};
use super::prompts::{looks_like_choice_prompt, PROMPT_TABLE};
use super::pty_output::{drain_lines, finish_lines, strip_ansi, OutputDiagnostics, StartupFailure};
use crate::error::AetherError;
use crate::events::{now_millis, LogEvent};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

pub struct PtySession {
    child: Box<dyn Child + Send + Sync>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    prompts_done: Arc<AtomicBool>,
    diagnostics: Arc<OutputDiagnostics>,
    _master: Box<dyn MasterPty + Send>,
}

impl PtySession {
    pub fn pid(&self) -> u32 {
        self.child.process_id().unwrap_or(0)
    }

    pub fn prompts_done(&self) -> bool {
        self.prompts_done.load(Ordering::Relaxed)
    }

    pub fn startup_failure_after_exit(&self) -> Option<StartupFailure> {
        self.diagnostics.failure_after_exit()
    }

    pub fn try_wait(&mut self) -> Option<i32> {
        self.child
            .try_wait()
            .ok()
            .flatten()
            .map(|es| es.exit_code() as i32)
    }

    pub fn send_ctrl_c(&self) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(&[0x03]);
            let _ = w.flush();
        }
    }

    pub fn send_line(&self, line: &str) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(line.as_bytes());
            let _ = w.write_all(b"\r\n");
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
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AetherError::SpawnFailed(e.to_string()))?;

    let mut cmd = CommandBuilder::new(binary);
    cmd.cwd(cwd);
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

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AetherError::SpawnFailed(e.to_string()))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AetherError::SpawnFailed(e.to_string()))?;

    let raw_writer = pair
        .master
        .take_writer()
        .map_err(|e| AetherError::SpawnFailed(e.to_string()))?;
    let writer = Arc::new(Mutex::new(raw_writer));
    let writer_for_thread = Arc::clone(&writer);

    let prompts_done = Arc::new(AtomicBool::new(false));
    let prompts_done_for_thread = Arc::clone(&prompts_done);

    let diagnostics = Arc::new(OutputDiagnostics::new(1));
    let reader_diagnostics = Arc::clone(&diagnostics);
    std::thread::spawn(move || {
        read_loop(
            reader.as_mut(),
            writer_for_thread,
            profile,
            log_tx,
            prompts_done_for_thread,
            &reader_diagnostics,
        );
        reader_diagnostics.reader_finished();
    });

    Ok(PtySession {
        child,
        writer,
        prompts_done,
        diagnostics,
        _master: pair.master,
    })
}

fn read_loop(
    reader: &mut dyn Read,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    profile: ConnectionProfile,
    log_tx: Sender<LogEvent>,
    prompts_done: Arc<AtomicBool>,
    diagnostics: &OutputDiagnostics,
) {
    let mut answered: HashSet<&'static str> = HashSet::new();
    let mut current_section: Option<&'static str> = None;
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
            prompts_done.store(true, Ordering::Relaxed);
            for rule in PROMPT_TABLE {
                if (rule.header_matches)(&line) {
                    current_section = Some(rule.id);
                    answered.remove(rule.id);
                }
            }
            if let Some(line) = diagnostics.log_line(line) {
                let _ = log_tx.send(LogEvent {
                    line,
                    timestamp: now_millis(),
                });
            }
        }

        let partial = strip_ansi(&line_buf);
        if looks_like_choice_prompt(&partial)
            && !PROMPT_TABLE.iter().any(|r| (r.header_matches)(&partial))
        {
            if let Some(section) = current_section {
                if !answered.contains(section) {
                    if let Some(rule) = PROMPT_TABLE.iter().find(|r| r.id == section) {
                        let answer = (rule.answer)(&profile);
                        if let Ok(mut w) = writer.lock() {
                            let _ = w.write_all(answer.as_bytes());
                            let _ = w.write_all(b"\r\n");
                            let _ = w.flush();
                        }
                        let _ = log_tx.send(LogEvent {
                            line: format!("[gui] answered {section} \u{2192} {answer}"),
                            timestamp: now_millis(),
                        });
                        answered.insert(section);
                        if answered.len() == PROMPT_TABLE.len() {
                            prompts_done.store(true, Ordering::Relaxed);
                        }
                    }
                }
            }
        }
    }
    for raw_line in finish_lines(&mut line_buf) {
        if let Some(line) = diagnostics.log_line(strip_ansi(&raw_line)) {
            let _ = log_tx.send(LogEvent {
                line,
                timestamp: now_millis(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aether::pty_output::MAX_PARTIAL;

    fn feed(buf: &mut String, chunk: &str) -> Vec<String> {
        buf.push_str(chunk);
        drain_lines(buf)
    }

    #[test]
    fn plain_newlines() {
        let mut buf = String::new();
        assert_eq!(feed(&mut buf, "a\nb\nc"), ["a", "b"]);
        assert_eq!(buf, "c");
    }

    #[test]
    fn crlf_and_onlcr_double_cr() {
        let mut buf = String::new();
        assert_eq!(feed(&mut buf, "a\r\nb\r\r\n"), ["a", "b"]);
        assert_eq!(buf, "");
    }

    #[test]
    fn cr_overwrite_drops_spinner_frames() {
        let mut buf = String::new();
        assert_eq!(
            feed(&mut buf, "scan 1%\rscan 2%\rscan 3%"),
            Vec::<String>::new()
        );
        assert_eq!(buf, "scan 3%");
        assert_eq!(feed(&mut buf, "\rscan done\n"), ["scan done"]);
        assert_eq!(buf, "");
    }

    #[test]
    fn lone_cr_at_end_waits_for_possible_lf() {
        let mut buf = String::new();
        assert_eq!(feed(&mut buf, "abc\r"), Vec::<String>::new());
        assert_eq!(buf, "abc\r");
        assert_eq!(feed(&mut buf, "\n"), ["abc"]);
        assert_eq!(buf, "");
    }

    #[test]
    fn unterminated_tail_is_capped() {
        let mut buf = String::new();
        let big = "é".repeat(MAX_PARTIAL);
        assert_eq!(feed(&mut buf, &big), Vec::<String>::new());
        assert!(buf.len() <= MAX_PARTIAL + 1);
        assert!(buf.chars().all(|c| c == 'é'));
    }
}
