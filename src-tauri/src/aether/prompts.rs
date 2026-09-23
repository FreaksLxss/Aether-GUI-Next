use super::profiles::ConnectionProfile;

pub struct PromptRule {
    pub id: &'static str,
    pub header_matches: fn(&str) -> bool,
    pub answer: fn(&ConnectionProfile) -> String,
}

pub static PROMPT_TABLE: &[PromptRule] = &[
    PromptRule {
        id: "protocol",
        header_matches: |l| l.trim_end().ends_with("Protocol:"),
        answer: |p| p.protocol.as_menu_choice().to_string(),
    },
    PromptRule {
        id: "scan_mode",
        header_matches: |l| l.trim_end().ends_with("Scan mode:"),
        answer: |p| p.scan_mode.as_menu_choice().to_string(),
    },
    PromptRule {
        id: "ip_version",
        header_matches: |l| l.trim_end().ends_with("IP version to scan:"),
        answer: |p| p.ip_version.as_menu_choice().to_string(),
    },
    PromptRule {
        id: "masque_transport",
        header_matches: |l| l.trim_end().ends_with("MASQUE transport:"),
        answer: |p| if p.masque_http2 { "2" } else { "1" }.to_string(),
    },
];

pub fn looks_like_choice_prompt(partial_line: &str) -> bool {
    partial_line.trim_end().ends_with(':')
}
