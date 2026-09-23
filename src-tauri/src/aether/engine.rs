use crate::error::AetherError;
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub static INSTALLING: Mutex<bool> = Mutex::new(false);

pub fn expected_version() -> &'static str {
    crate::updater::expected_version()
}

#[derive(Clone, Debug, Serialize)]
pub struct EngineInfo {
    pub version: Option<String>,
    pub expected_version: String,
    pub path: Option<String>,
    pub source: Option<String>,
    pub compatible: bool,
    pub transports_available: bool,
    pub problem: Option<String>,
}

pub fn install_dir(app: &AppHandle) -> Result<PathBuf, AetherError> {
    app.path()
        .app_data_dir()
        .map(|p| {
            p.join("binaries")
                .join(format!("engine-{}", expected_version()))
        })
        .map_err(|e| AetherError::Internal(e.to_string()))
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "aether.exe"
    } else {
        "aether"
    }
}

fn transport_path(binary: &Path) -> PathBuf {
    binary
        .parent()
        .unwrap_or(Path::new("."))
        .join("pt")
        .join(if cfg!(windows) {
            "lyrebird.exe"
        } else {
            "lyrebird"
        })
}

fn executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn parse_version(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut words = line.split_whitespace();
        if !words.next()?.eq_ignore_ascii_case("aether") {
            return None;
        }
        let version = words.next()?.trim_start_matches('v');
        let parts: Vec<_> = version.split('.').collect();
        if parts.len() == 3
            && parts
                .iter()
                .all(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        {
            Some(version.to_owned())
        } else {
            None
        }
    })
}

pub fn probe_version(path: &Path) -> Result<String, String> {
    let mut command = Command::new(path);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot inspect engine: {e}"))?;
    let stdout = child.stdout.take().ok_or("Engine stdout unavailable")?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(4096).read_to_end(&mut bytes);
        let _ = tx.send(result.map(|_| bytes));
    });
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match result {
                    Err(e) => format!("Cannot inspect engine: {e}"),
                    _ => "Engine version check timed out".into(),
                });
            }
        }
    };
    if !status.success() {
        return Err(format!("Engine version check exited with {status}"));
    }
    let bytes = rx
        .recv_timeout(Duration::from_millis(250))
        .map_err(|_| "Engine version output timed out")?
        .map_err(|e| format!("Cannot read engine version: {e}"))?;
    parse_version(&String::from_utf8_lossy(&bytes))
        .ok_or_else(|| "Engine returned an unrecognized version".into())
}

fn inspect_candidates(candidates: Vec<(PathBuf, &'static str)>) -> EngineInfo {
    let mut failure = None;
    for (path, source) in candidates {
        if !path.is_file() {
            continue;
        }
        let version = probe_version(&path);
        let transports_available = executable_file(&transport_path(&path));
        let problem = match &version {
            Ok(v) if v != expected_version() => Some(format!(
                "Found Aether {v}; this GUI requires Aether {}",
                expected_version()
            )),
            Err(e) => Some(e.clone()),
            _ if !transports_available => {
                Some("The bundled Tor transport (pt/lyrebird) is missing or not executable".into())
            }
            _ => None,
        };
        let info = EngineInfo {
            compatible: problem.is_none(),
            version: version.ok(),
            expected_version: expected_version().into(),
            path: Some(path.display().to_string()),
            source: Some(source.into()),
            transports_available,
            problem,
        };
        if info.compatible {
            return info;
        }
        if failure.is_none() {
            failure = Some(info);
        }
    }
    failure.unwrap_or(EngineInfo {
        version: None,
        expected_version: expected_version().into(),
        path: None,
        source: None,
        compatible: false,
        transports_available: false,
        problem: Some("Aether binary not found".into()),
    })
}

pub fn inspect(app: &AppHandle) -> EngineInfo {
    let mut candidates = Vec::new();
    #[cfg(not(target_os = "android"))]
    {
        if let Ok(dir) = install_dir(app) {
            candidates.push((dir.join(binary_name()), "downloaded"));
        }
        if let Ok(dir) = app.path().resource_dir() {
            candidates.push((dir.join("binaries/engine").join(binary_name()), "bundled"));
            candidates.push((dir.join("binaries").join(binary_name()), "legacy bundle"));
        }
        #[cfg(debug_assertions)]
        candidates.push((
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/engine")
                .join(binary_name()),
            "development",
        ));
        if let Ok(dir) = app.path().app_data_dir() {
            candidates.push((dir.join("binaries").join(binary_name()), "legacy download"));
        }
    }
    #[cfg(target_os = "android")]
    {
        let relative = match std::env::consts::ARCH {
            "aarch64" => "binaries/android",
            "x86_64" => "binaries/android/x86_64",
            "arm" => "binaries/android/armv7",
            _ => "binaries/unsupported",
        };
        if let Ok(dir) = app.path().resource_dir() {
            candidates.push((dir.join(relative).join(binary_name()), "bundled"));
        }
    }
    inspect_candidates(candidates)
}

pub fn resolve(app: &AppHandle) -> Result<PathBuf, AetherError> {
    let info = inspect(app);
    if info.compatible {
        return info
            .path
            .map(PathBuf::from)
            .ok_or_else(|| AetherError::EngineIncompatible("Engine path unavailable".into()));
    }
    Err(AetherError::EngineIncompatible(format!(
        "{}. Install/repair Aether {}.",
        info.problem.unwrap_or_default(),
        expected_version()
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_parser_requires_engine_and_complete_version() {
        assert_eq!(parse_version("aether 2.0.0\r\n"), Some("2.0.0".into()));
        assert_eq!(parse_version("Aether v1.9.0"), Some("1.9.0".into()));
        for bad in ["2.0.0", "aether 2", "other 2.0.0", "aether 2.x.0"] {
            assert_eq!(parse_version(bad), None);
        }
    }

    #[test]
    #[ignore = "requires fetched Windows engine payload"]
    #[cfg(windows)]
    fn fetched_engine_is_selected_over_legacy_bundle() {
        let binaries = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
        let current = binaries.join("engine/aether.exe");
        assert!(
            current.is_file(),
            "fetch the pinned engine before this smoke test"
        );
        let info = inspect_candidates(vec![
            (current.clone(), "downloaded"),
            (binaries.join("aether.exe"), "legacy bundle"),
        ]);
        assert!(info.compatible, "{:?}", info.problem);
        assert_eq!(info.version.as_deref(), Some(expected_version()));
        assert_eq!(info.path, Some(current.display().to_string()));
        assert_eq!(info.source.as_deref(), Some("downloaded"));
        assert!(info.transports_available);
        let fallback = inspect_candidates(vec![
            (binaries.join("aether.exe"), "legacy bundle"),
            (current, "bundled"),
        ]);
        assert!(fallback.compatible, "{:?}", fallback.problem);
        assert_eq!(fallback.version.as_deref(), Some(expected_version()));
    }

    #[test]
    fn missing_candidates_are_incompatible() {
        let info = inspect_candidates(Vec::new());
        assert!(!info.compatible);
        assert_eq!(info.version, None);
        assert_eq!(info.problem.as_deref(), Some("Aether binary not found"));
    }
}
