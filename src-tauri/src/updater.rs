use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};

const GUI_REPO: &str = "FreaksLxss/Aether-GUI-Next";

#[derive(serde::Deserialize)]
struct EngineRelease {
    version: String,
    repository: String,
    assets: std::collections::BTreeMap<String, EngineAsset>,
}

#[derive(serde::Deserialize, Clone)]
struct EngineAsset {
    name: String,
    sha256: String,
}

fn engine_release() -> &'static EngineRelease {
    static RELEASE: std::sync::OnceLock<EngineRelease> = std::sync::OnceLock::new();
    RELEASE.get_or_init(|| {
        serde_json::from_str(include_str!("../aether-release.json"))
            .expect("checked-in Aether release manifest must be valid")
    })
}

pub fn expected_version() -> &'static str {
    &engine_release().version
}

#[derive(Serialize, Clone, Debug)]
pub struct UpdateInfo {
    pub available: bool,
    pub latest_version: String,
    pub current_version: String,
    pub download_url: String,
}

#[cfg(not(target_os = "android"))]
pub async fn check_for_update(current_version: &str) -> Result<UpdateInfo, String> {
    let url = format!("https://api.github.com/repos/{GUI_REPO}/releases/latest");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Aether-GUI")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let release: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let tag = release["tag_name"]
        .as_str()
        .unwrap_or("v0.0.0")
        .trim_start_matches('v');

    let download_url = find_download_url(&release)
        .unwrap_or_else(|| release["html_url"].as_str().unwrap_or("").to_string());

    let available = is_newer(current_version, tag);

    Ok(UpdateInfo {
        available,
        latest_version: tag.to_string(),
        current_version: current_version.to_string(),
        download_url,
    })
}

#[cfg(target_os = "android")]
pub async fn check_for_update(_current_version: &str) -> Result<UpdateInfo, String> {
    Ok(UpdateInfo {
        available: false,
        latest_version: String::new(),
        current_version: _current_version.to_string(),
        download_url: String::new(),
    })
}

fn find_download_url(release: &serde_json::Value) -> Option<String> {
    let assets = release["assets"].as_array()?;
    for ext in &[".exe", ".msi"] {
        if let Some(asset) = assets.iter().find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.to_lowercase().ends_with(ext))
                .unwrap_or(false)
        }) {
            return asset["browser_download_url"].as_str().map(String::from);
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
pub async fn download_aether_binary(dest_dir: &Path) -> Result<PathBuf, String> {
    use std::time::Duration;
    let target = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let release = engine_release();
    let asset = release
        .assets
        .get(&target)
        .ok_or_else(|| format!("No supported Aether asset for {target}"))?
        .clone();
    let url = format!(
        "https://github.com/{}/releases/download/v{}/{}",
        release.repository, release.version, asset.name
    );
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(180))
        .user_agent("Aether-GUI")
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Engine download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Engine download HTTP error: {e}"))?;
    const MAX_ARCHIVE: usize = 64 * 1024 * 1024;
    if response
        .content_length()
        .is_some_and(|len| len > MAX_ARCHIVE as u64)
    {
        return Err("Engine archive is too large".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > MAX_ARCHIVE {
            return Err("Engine archive exceeds download size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let dest = dest_dir.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || install_archive(&bytes, &asset, &target, &dest))
        .await
        .map_err(|e| format!("Engine installation task failed: {e}"))?
}

fn verify_checksum(bytes: &[u8], expected: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual != expected {
        return Err(format!("Engine SHA256 mismatch: {actual} != {expected}"));
    }
    Ok(())
}

fn payload_names(target: &str) -> (&'static str, &'static str, &'static str) {
    if target.starts_with("windows-") {
        (
            "aether.exe",
            "pt/lyrebird.exe",
            "pt/psiphon-tunnel-core.exe",
        )
    } else {
        ("aether", "pt/lyrebird", "pt/psiphon-tunnel-core")
    }
}

fn check_architecture(bytes: &[u8], target: &str) -> Result<(), String> {
    let valid = match target {
        "windows-x86_64" => {
            bytes.get(..2) == Some(b"MZ")
                && bytes
                    .get(60..64)
                    .and_then(|b| b.try_into().ok())
                    .map(u32::from_le_bytes)
                    .is_some_and(|offset| {
                        bytes.get(offset as usize..offset as usize + 6) == Some(b"PE\0\0\x64\x86")
                    })
        }
        "linux-x86_64" | "linux-aarch64" => {
            let machine: &[u8] = if target.ends_with("x86_64") {
                &[62, 0]
            } else {
                &[183, 0]
            };
            bytes.get(..6) == Some(b"\x7fELF\x02\x01") && bytes.get(18..20) == Some(machine)
        }
        "macos-x86_64" | "macos-aarch64" => {
            let cpu: &[u8] = if target.ends_with("x86_64") {
                &[7, 0, 0, 1]
            } else {
                &[12, 0, 0, 1]
            };
            bytes.get(..4) == Some(b"\xcf\xfa\xed\xfe") && bytes.get(4..8) == Some(cpu)
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(format!("Executable does not match {target}"))
    }
}

struct PayloadWriter<'a> {
    dest: &'a std::path::Path,
    target: &'a str,
    seen: std::collections::HashSet<String>,
    total: u64,
}

impl PayloadWriter<'_> {
    fn entry(
        &mut self,
        raw: &str,
        directory: bool,
        regular: bool,
        size: u64,
        reader: &mut impl Read,
    ) -> Result<(), String> {
        let name = if directory {
            raw.strip_suffix('/').unwrap_or(raw)
        } else {
            raw
        };
        let (engine, pt, psiphon) = payload_names(self.target);
        let allowed = name == engine
            || name == pt
            || name == psiphon
            || name == "pt"
            || (self.target.starts_with("windows-") && name == "run-aether.bat");
        if !allowed
            || directory != (name == "pt")
            || !regular
            || name.starts_with('/')
            || name.contains('\\')
            || name
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
            || !self.seen.insert(name.into())
        {
            return Err(format!(
                "Unsafe, duplicate or unexpected archive member: {raw:?}"
            ));
        }
        const MAX_FILE: u64 = 128 * 1024 * 1024;
        self.total = self
            .total
            .checked_add(size)
            .ok_or("Archive size overflow")?;
        if size > MAX_FILE || self.total > MAX_FILE * 2 {
            return Err("Oversized archive payload".into());
        }
        if directory {
            return Ok(());
        }
        let mut bytes = Vec::new();
        reader
            .take(MAX_FILE + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 != size {
            return Err("Truncated archive member".into());
        }
        if name != engine && name != pt && name != psiphon {
            return Ok(());
        }
        check_architecture(&bytes, self.target)?;
        let path = self.dest.join(name);
        std::fs::create_dir_all(path.parent().ok_or("Payload has no parent")?)
            .map_err(|e| e.to_string())?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn reject_duplicate_zip_entries(bytes: &[u8], indexed_count: usize) -> Result<(), String> {
    let start = bytes.len().saturating_sub(65_557);
    let footer = (start..bytes.len().saturating_sub(21))
        .rev()
        .find(|&i| {
            bytes.get(i..i + 4) == Some(b"PK\x05\x06")
                && i + 22 + u16::from_le_bytes([bytes[i + 20], bytes[i + 21]]) as usize
                    == bytes.len()
        })
        .ok_or("Missing ZIP end record")?;
    let word =
        |offset: usize| u16::from_le_bytes([bytes[footer + offset], bytes[footer + offset + 1]]);
    let count = word(10);
    if word(4) != 0
        || word(6) != 0
        || word(8) != count
        || count == u16::MAX
        || usize::from(count) != indexed_count
    {
        return Err("Duplicate ZIP names or unsupported multi-disk/ZIP64 archive".into());
    }
    Ok(())
}

fn extract_payload(bytes: &[u8], target: &str, dest: &std::path::Path) -> Result<(), String> {
    let mut writer = PayloadWriter {
        dest,
        target,
        seen: Default::default(),
        total: 0,
    };
    if target.starts_with("windows-") {
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
        reject_duplicate_zip_entries(bytes, archive.len())?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
            let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
            let directory = entry.is_dir();
            let regular = if directory {
                mode == 0 || mode == 0o040000
            } else {
                mode == 0 || mode == 0o100000
            };
            writer.entry(
                &String::from_utf8(entry.name_raw().to_vec()).map_err(|e| e.to_string())?,
                directory,
                regular,
                entry.size(),
                &mut entry,
            )?;
        }
    } else {
        let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
        let mut archive = tar::Archive::new(gz);
        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            let name = String::from_utf8(entry.path_bytes().to_vec()).map_err(|e| e.to_string())?;
            let kind = entry.header().entry_type();
            writer.entry(
                &name,
                kind.is_dir(),
                kind.is_file() || kind.is_dir(),
                entry.size(),
                &mut entry,
            )?;
        }
        archive
            .into_inner()
            .read_to_end(&mut Vec::new())
            .map_err(|e| e.to_string())?;
    }
    let (engine, pt, psiphon) = payload_names(target);
    if !writer.seen.contains(engine) || !writer.seen.contains(pt) || !writer.seen.contains(psiphon)
    {
        return Err("Incomplete archive: engine, PT and psiphon binaries are required".into());
    }
    Ok(())
}

fn install_archive(
    bytes: &[u8],
    asset: &EngineAsset,
    target: &str,
    dest: &std::path::Path,
) -> Result<PathBuf, String> {
    verify_checksum(bytes, &asset.sha256)?;
    let parent = dest.parent().ok_or("Engine destination has no parent")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = dest
        .file_name()
        .ok_or("Engine destination has no name")?
        .to_string_lossy();
    let lock_path = parent.join(format!(".{name}.install-lock"));
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|e| format!("Engine repair already running or lock unavailable: {e}"))?;
    struct Lock {
        file: Option<std::fs::File>,
        path: PathBuf,
    }
    impl Drop for Lock {
        fn drop(&mut self) {
            drop(self.file.take());
            let _ = std::fs::remove_file(&self.path);
        }
    }
    let _lock = Lock {
        file: Some(lock),
        path: lock_path,
    };
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let stage = parent.join(format!(".{name}.stage-{}-{nonce}", std::process::id()));
    std::fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let result = (|| {
        extract_payload(bytes, target, &stage)?;
        let backup = parent.join(format!(".{name}.backup-{}-{nonce}", std::process::id()));
        let previous = match std::fs::symlink_metadata(dest) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => true,
            Ok(_) => return Err("Engine destination must be a real directory".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(e) => return Err(e.to_string()),
        };
        if previous {
            std::fs::rename(dest, &backup).map_err(|e| {
                format!("Cannot preserve existing engine (stop it before repair): {e}")
            })?;
        }
        if let Err(error) = std::fs::rename(&stage, dest) {
            if previous {
                std::fs::rename(&backup, dest).map_err(|rollback| {
                    format!(
                        "Engine activation failed: {error}; rollback failed: {rollback}; old engine preserved at {}",
                        backup.display()
                    )
                })?;
            }
            return Err(format!("Engine activation failed: {error}"));
        }
        Ok(dest.join(payload_names(target).0))
    })();
    if stage.exists() {
        let _ = std::fs::remove_dir_all(&stage);
    }
    result
}

#[cfg(target_os = "android")]
pub async fn download_aether_binary(_dest_dir: &Path) -> Result<PathBuf, String> {
    Err("Aether is bundled in the APK on Android".into())
}

fn is_newer(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> { v.split('.').filter_map(|s| s.parse().ok()).collect() };
    let cur = parse(current);
    let lat = parse(latest);
    lat > cur
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!(
                "aether-archive-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn pe() -> Vec<u8> {
        let mut bytes = vec![0; 80];
        bytes[..2].copy_from_slice(b"MZ");
        bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
        bytes[64..70].copy_from_slice(b"PE\0\0\x64\x86");
        bytes
    }

    fn zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn asset(bytes: &[u8]) -> EngineAsset {
        use sha2::{Digest, Sha256};
        EngineAsset {
            name: "fixture.zip".into(),
            sha256: format!("{:x}", Sha256::digest(bytes)),
        }
    }

    #[test]
    fn pinned_manifest_and_platforms() {
        assert_eq!(expected_version(), "2.1.0");
        assert_eq!(engine_release().assets.len(), 5);
        assert!(engine_release().assets["linux-x86_64"]
            .name
            .contains("musl"));
    }

    #[test]
    fn complete_zip_preserves_pt_and_omits_launcher() {
        let temp = Temp::new();
        let bytes = pe();
        let archive = zip(&[
            ("aether.exe", &bytes),
            ("pt/lyrebird.exe", &bytes),
            ("pt/psiphon-tunnel-core.exe", &bytes),
            ("run-aether.bat", b"upstream launcher"),
        ]);
        let dest = temp.0.join("engine-2.1.0");
        assert_eq!(
            install_archive(&archive, &asset(&archive), "windows-x86_64", &dest).unwrap(),
            dest.join("aether.exe")
        );
        assert_eq!(std::fs::read(dest.join("pt/lyrebird.exe")).unwrap(), bytes);
        assert_eq!(
            std::fs::read(dest.join("pt/psiphon-tunnel-core.exe")).unwrap(),
            bytes
        );
        assert!(!dest.join("run-aether.bat").exists());
    }

    #[test]
    fn checksum_failure_does_not_touch_old_install() {
        let temp = Temp::new();
        let dest = temp.0.join("engine");
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(dest.join("aether.exe"), b"old").unwrap();
        let bad = EngineAsset {
            name: "fixture.zip".into(),
            sha256: "0".repeat(64),
        };
        assert!(install_archive(b"corrupt", &bad, "windows-x86_64", &dest).is_err());
        assert_eq!(std::fs::read(dest.join("aether.exe")).unwrap(), b"old");
    }

    #[test]
    fn partial_archive_does_not_touch_old_install() {
        let temp = Temp::new();
        let dest = temp.0.join("engine");
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(dest.join("aether.exe"), b"old").unwrap();
        let archive = zip(&[("aether.exe", &pe())]);
        assert!(install_archive(&archive, &asset(&archive), "windows-x86_64", &dest).is_err());
        assert_eq!(std::fs::read(dest.join("aether.exe")).unwrap(), b"old");
        assert_eq!(std::fs::read_dir(&temp.0).unwrap().count(), 1);
    }

    #[test]
    fn rejects_unsafe_duplicate_conflicting_and_link_members() {
        let temp = Temp::new();
        let mut writer = PayloadWriter {
            dest: &temp.0,
            target: "windows-x86_64",
            seen: Default::default(),
            total: 0,
        };
        for name in [
            "../aether.exe",
            "/aether.exe",
            "C:/aether.exe",
            "evil/aether.exe",
            "pt\\lyrebird.exe",
            "aether.toml",
            "./aether.exe",
        ] {
            assert!(
                writer
                    .entry(name, false, true, 0, &mut std::io::empty())
                    .is_err(),
                "{name}"
            );
        }
        assert!(writer
            .entry("aether.exe", false, false, 0, &mut std::io::empty())
            .is_err());
        assert!(writer
            .entry("pt", false, true, 0, &mut std::io::empty())
            .is_err());
        let bytes = pe();
        writer
            .entry(
                "aether.exe",
                false,
                true,
                bytes.len() as u64,
                &mut std::io::Cursor::new(bytes.as_slice()),
            )
            .unwrap();
        assert!(writer
            .entry(
                "aether.exe",
                false,
                true,
                bytes.len() as u64,
                &mut std::io::Cursor::new(bytes.as_slice())
            )
            .is_err());
    }

    #[test]
    fn rejects_tar_symlinks_and_hardlinks() {
        for kind in [tar::EntryType::Symlink, tar::EntryType::Link] {
            let temp = Temp::new();
            let gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            let mut archive = tar::Builder::new(gz);
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(kind);
            header.set_size(0);
            header.set_mode(0o777);
            header.set_link_name("../target").unwrap();
            header.set_cksum();
            archive
                .append_data(&mut header, "aether", std::io::empty())
                .unwrap();
            let bytes = archive.into_inner().unwrap().finish().unwrap();
            assert!(extract_payload(&bytes, "linux-x86_64", &temp.0).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_names_hidden_by_zip_index() {
        let temp = Temp::new();
        let pe = pe();
        let mut bytes = zip(&[("aether.exe", &pe), ("bother.exe", &pe)]);
        for index in 0..bytes.len() - 10 {
            if &bytes[index..index + 10] == b"bother.exe" {
                bytes[index..index + 10].copy_from_slice(b"aether.exe");
            }
        }
        assert!(extract_payload(&bytes, "windows-x86_64", &temp.0)
            .unwrap_err()
            .contains("Duplicate"));
    }

    #[test]
    fn complete_tar_preserves_pt() {
        let temp = Temp::new();
        let mut elf = vec![0; 64];
        elf[..6].copy_from_slice(b"\x7fELF\x02\x01");
        elf[18] = 62;
        let gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        let mut archive = tar::Builder::new(gz);
        for name in ["aether", "pt/lyrebird", "pt/psiphon-tunnel-core"] {
            let mut header = tar::Header::new_gnu();
            header.set_size(elf.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            archive
                .append_data(&mut header, name, std::io::Cursor::new(elf.as_slice()))
                .unwrap();
        }
        let bytes = archive.into_inner().unwrap().finish().unwrap();
        extract_payload(&bytes, "linux-x86_64", &temp.0).unwrap();
        assert_eq!(std::fs::read(temp.0.join("pt/lyrebird")).unwrap(), elf);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(temp.0.join("pt/lyrebird"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o755);
        }
    }

    #[test]
    fn repair_preserves_previous_directory() {
        let temp = Temp::new();
        let dest = temp.0.join("engine");
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(dest.join("aether.exe"), b"old").unwrap();
        let bytes = pe();
        let archive = zip(&[
            ("aether.exe", &bytes),
            ("pt/lyrebird.exe", &bytes),
            ("pt/psiphon-tunnel-core.exe", &bytes),
        ]);
        install_archive(&archive, &asset(&archive), "windows-x86_64", &dest).unwrap();
        let backup = std::fs::read_dir(&temp.0)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .contains(".backup-")
            })
            .unwrap();
        assert_eq!(std::fs::read(backup.join("aether.exe")).unwrap(), b"old");
    }

    #[test]
    fn rejects_mismatched_architecture() {
        assert!(check_architecture(&pe(), "linux-x86_64").is_err());
        assert!(check_architecture(b"MZ", "windows-x86_64").is_err());
    }
}
