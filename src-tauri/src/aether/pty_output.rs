
use std::sync::{Condvar, Mutex};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupFailure {
    UnsupportedOption,
    InvalidConfiguration,
    MissingTransport,
    BindInUse,
}

impl StartupFailure {
    pub fn message(self) -> &'static str {
        match self {
            Self::UnsupportedOption => "Aether rejected an unsupported option. Install/repair the supported engine before reconnecting.",
            Self::InvalidConfiguration => "Aether rejected a configuration value. Check the active profile before reconnecting.",
            Self::MissingTransport => "Aether could not start its Tor transport. Install/repair the engine and check the transport path.",
            Self::BindInUse => "Aether could not bind its listener because the address is already in use. Change the listener port or stop the other process.",
        }
    }
}

fn classify_startup_failure(line: &str) -> Option<StartupFailure> {
    let lower = line.to_ascii_lowercase();
    let error = lower.contains("error") || lower.contains("fatal");
    if !error {
        return None;
    }
    if [
        "unknown option",
        "unrecognized option",
        "unexpected argument",
    ]
    .iter()
    .any(|s| lower.contains(s))
    {
        Some(StartupFailure::UnsupportedOption)
    } else if [
        "invalid value",
        "invalid argument",
        "requires a value",
        "missing value",
        "invalid configuration",
    ]
    .iter()
    .any(|s| lower.contains(s))
    {
        Some(StartupFailure::InvalidConfiguration)
    } else if (lower.contains("lyrebird") || lower.contains("transport executable"))
        && [
            "not found",
            "no such file",
            "permission denied",
            "not executable",
        ]
        .iter()
        .any(|s| lower.contains(s))
    {
        Some(StartupFailure::MissingTransport)
    } else if lower.contains("address already in use")
        || lower.contains("only one usage of each socket address")
    {
        Some(StartupFailure::BindInUse)
    } else {
        None
    }
}

pub struct OutputDiagnostics {
    state: Mutex<(Option<StartupFailure>, usize)>,
    finished: Condvar,
}

impl OutputDiagnostics {
    pub fn new(readers: usize) -> Self {
        Self {
            state: Mutex::new((None, readers)),
            finished: Condvar::new(),
        }
    }

    pub fn log_line(&self, line: String) -> Option<String> {
        if line.is_empty() {
            return None;
        }
        if let Some(failure) = classify_startup_failure(&line) {
            let mut state = self.state.lock().unwrap();
            if state.0.is_none() {
                state.0 = Some(failure);
            }
            return Some(failure.message().into());
        }
        Some(line)
    }

    pub fn reader_finished(&self) {
        let mut state = self.state.lock().unwrap();
        state.1 = state.1.saturating_sub(1);
        self.finished.notify_all();
    }

    pub fn failure_after_exit(&self) -> Option<StartupFailure> {
        let state = self.state.lock().unwrap();
        let (state, _) = self
            .finished
            .wait_timeout_while(state, Duration::from_millis(250), |s| s.1 != 0)
            .unwrap();
        state.0
    }
}

pub fn finish_lines(buf: &mut String) -> Vec<String> {
    let mut lines = drain_lines(buf);
    let tail = std::mem::take(buf);
    let tail = tail.trim_end_matches(['\r', '\n']);
    if !tail.is_empty() {
        lines.push(tail.to_owned());
    }
    lines
}

pub const MAX_PARTIAL: usize = 16 * 1024;

pub fn drain_lines(buf: &mut String) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buf.find(['\r', '\n']) {
        let end = if buf.as_bytes()[pos] == b'\n' {
            pos
        } else {
            let mut run_end = pos;
            while run_end < buf.len() && buf.as_bytes()[run_end] == b'\r' {
                run_end += 1;
            }
            if run_end == buf.len() {
                break;
            }
            if buf.as_bytes()[run_end] != b'\n' {
                buf.drain(..run_end);
                continue;
            }
            run_end
        };
        let line: String = buf.drain(..=end).collect();
        lines.push(line.trim_end_matches(['\r', '\n']).to_string());
    }
    if buf.len() > MAX_PARTIAL {
        let mut cut = buf.len() - MAX_PARTIAL;
        while !buf.is_char_boundary(cut) {
            cut += 1;
        }
        buf.drain(..cut);
    }
    lines
}

pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for c2 in chars.by_ref() {
                if c2.is_ascii_alphabetic() {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn eof_flushes_trailing_line() {
        let mut buf = String::new();
        assert_eq!(
            feed(&mut buf, "Error: Other(\"unknown option '--mim'"),
            Vec::<String>::new()
        );
        assert_eq!(
            finish_lines(&mut buf),
            ["Error: Other(\"unknown option '--mim'"]
        );
        assert_eq!(buf, "");
        assert_eq!(finish_lines(&mut buf), Vec::<String>::new());
    }

    #[test]
    fn eof_flush_keeps_spinner_semantics() {
        let mut buf = String::new();
        assert_eq!(feed(&mut buf, "scan 40%"), Vec::<String>::new());
        assert_eq!(finish_lines(&mut buf), ["scan 40%"]);
    }

    #[test]
    fn classify_known_config_failures() {
        assert_eq!(
            classify_startup_failure("Error: Other(\"unknown option '--mim'\")"),
            Some(StartupFailure::UnsupportedOption)
        );
        assert_eq!(
            classify_startup_failure("error: invalid value 'abc' for '--validate-secs <n>'"),
            Some(StartupFailure::InvalidConfiguration)
        );
        assert_eq!(
            classify_startup_failure("fatal: transport executable not found: pt/lyrebird"),
            Some(StartupFailure::MissingTransport)
        );
        assert_eq!(
            classify_startup_failure("Error: address already in use: 127.0.0.1:1819"),
            Some(StartupFailure::BindInUse)
        );
        assert_eq!(
            classify_startup_failure(
                "ERROR aether::psiphon: error initializing local SOCKS proxy: listen tcp: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted."
            ),
            Some(StartupFailure::BindInUse)
        );
    }

    #[test]
    fn classify_ignores_plain_output_and_network_noise() {
        assert_eq!(classify_startup_failure("scan 42% complete"), None);
        assert_eq!(classify_startup_failure("resolving gateway list"), None);
        assert_eq!(
            classify_startup_failure("timeout waiting for gateway"),
            None
        );
        assert_eq!(
            classify_startup_failure("unknown option handling improved"),
            None
        );
    }

    #[test]
    fn failure_message_is_fixed_and_leak_free() {
        let leaked = "Error: Other(\"unknown option '--mim'\")\n\nAether — a censorship circumvention client ...";
        let d = OutputDiagnostics::new(1);
        let emitted = d.log_line(leaked.to_string()).unwrap();
        assert_eq!(emitted, StartupFailure::UnsupportedOption.message());
        assert!(!emitted.contains("--mim"));
        assert!(!emitted.contains("Usage"));
        assert_eq!(
            d.log_line("still running, scanning gateways".into())
                .as_deref(),
            Some("still running, scanning gateways")
        );
    }

    #[test]
    fn failure_after_exit_waits_only_for_readers() {
        let d = OutputDiagnostics::new(1);
        d.reader_finished();
        let started = std::time::Instant::now();
        assert_eq!(d.failure_after_exit(), None);
        assert!(started.elapsed() < Duration::from_millis(200));
        let d2 = OutputDiagnostics::new(1);
        d2.log_line("Error: Other(\"unknown option 'x'\")".into());
        d2.reader_finished();
        assert_eq!(
            d2.failure_after_exit(),
            Some(StartupFailure::UnsupportedOption)
        );
    }
}
