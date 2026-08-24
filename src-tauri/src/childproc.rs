//! Shared tweak for spawned console-subprocess children.

use std::process::Command;

/// Suppresses the console window Windows would otherwise pop up for every
/// console-subsystem child (tor.exe, netsh, route, taskkill, …) launched from
/// this GUI app. Piped output is unaffected. No-op on other platforms.
pub fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // dwCreationFlags: CREATE_NO_WINDOW
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
    cmd
}
