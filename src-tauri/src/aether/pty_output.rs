//! Line-draining + ANSI stripping shared by the desktop PTY reader and the
//! Android pipe reader, so both translate aether's raw bytes into log lines
//! the same way.

/// Longest the unterminated tail may grow before the front is discarded.
/// `strip_ansi` rescans the whole tail on every read, so an unbounded tail
/// (e.g. output that never emits a terminator) would be O(n²) CPU.
pub const MAX_PARTIAL: usize = 16 * 1024;

/// Drains and returns every terminated line in `buf`, leaving the
/// unterminated tail in place. Terminal semantics, not plain `\n`-splitting:
/// a `\r` (or ONLCR-style `\r\r`) run followed by `\n` ends a line, while a
/// `\r` run followed by anything else is a carriage-return overwrite — a
/// spinner/progress frame a terminal would repaint in place — so the
/// overwritten prefix is dead output and is dropped without being emitted.
/// A `\r` run touching the end of the buffer is kept: the `\n` half of a
/// `\r\n` may still be in flight.
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
                break; // "\r" at buffer end: might be a split "\r\n"
            }
            if buf.as_bytes()[run_end] != b'\n' {
                buf.drain(..run_end); // overwritten frame: discard silently
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

/// Aether's output includes ANSI color codes (e.g. `\x1b[32m`) around log
/// level names — stripped so header-line matching and the log panel both see
/// plain text. Minimal hand-rolled CSI-sequence stripper: no regex needed for
/// a single well-known pattern (`ESC [ ... letter`).
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
        assert_eq!(buf, "scan 3%"); // only the live frame survives
        assert_eq!(feed(&mut buf, "\rscan done\n"), ["scan done"]);
        assert_eq!(buf, "");
    }

    #[test]
    fn lone_cr_at_end_waits_for_possible_lf() {
        let mut buf = String::new();
        assert_eq!(feed(&mut buf, "abc\r"), Vec::<String>::new());
        assert_eq!(buf, "abc\r");
        assert_eq!(feed(&mut buf, "\n"), ["abc"]); // the \r\n was split across reads
        assert_eq!(buf, "");
    }

    #[test]
    fn unterminated_tail_is_capped() {
        let mut buf = String::new();
        // Multibyte chars so the cap must respect char boundaries.
        let big = "é".repeat(MAX_PARTIAL); // 2 bytes each → 32 KiB, no terminators
        assert_eq!(feed(&mut buf, &big), Vec::<String>::new());
        assert!(buf.len() <= MAX_PARTIAL + 1);
        assert!(buf.chars().all(|c| c == 'é'));
    }
}
