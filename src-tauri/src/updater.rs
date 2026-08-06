use serde::Serialize;
use std::path::PathBuf;

const GUI_REPO: &str = "FreaksLxss/Aether-GUI-Remake";
const AETHER_REPO: &str = "CluvexStudio/Aether";

#[derive(Serialize, Clone, Debug)]
pub struct UpdateInfo {
    pub available: bool,
    pub latest_version: String,
    pub current_version: String,
    pub download_url: String,
}

/// Check GitHub releases for a newer version of Aether-GUI itself.
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

    // Find download URL — prefer .exe, then .msi, then fall back to release page
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

/// Search release assets for an .exe or .msi installer.
fn find_download_url(release: &serde_json::Value) -> Option<String> {
    let assets = release["assets"].as_array()?;
    // Prefer .exe, then .msi
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

/// Download the Aether binary for the current platform into `dest_dir`.
/// Extracts both the executable and run-aether.bat (if present).
pub async fn download_aether_binary(dest_dir: &PathBuf) -> Result<PathBuf, String> {
    let client = reqwest::Client::new();

    // Get latest release from CluvexStudio/Aether
    let url = format!("https://api.github.com/repos/{AETHER_REPO}/releases/latest");
    let release: serde_json::Value = client
        .get(&url)
        .header("User-Agent", "Aether-GUI")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse release: {e}"))?;

    let tag = release["tag_name"]
        .as_str()
        .unwrap_or("unknown")
        .trim_start_matches('v');

    // Find the asset for our platform
    let assets = release["assets"].as_array().ok_or("No assets in release")?;

    let asset_name = if cfg!(target_os = "windows") {
        "aether-windows-x86_64.zip"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aether-macos-arm64.tar.gz"
        } else {
            "aether-macos-x86_64.tar.gz"
        }
    } else {
        if cfg!(target_arch = "aarch64") {
            "aether-linux-arm64.tar.gz"
        } else {
            "aether-linux-x86_64.tar.gz"
        }
    };

    let asset = assets
        .iter()
        .find(|a| a["name"].as_str() == Some(asset_name))
        .ok_or_else(|| format!("Asset {asset_name} not found in release v{tag}"))?;

    let download_url = asset["browser_download_url"]
        .as_str()
        .ok_or("Missing download URL")?;

    // Download the archive
    let bytes = client
        .get(download_url)
        .header("User-Agent", "Aether-GUI")
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {e}"))?;

    std::fs::create_dir_all(dest_dir).map_err(|e| format!("Failed to create directory: {e}"))?;

    // Extract
    if asset_name.ends_with(".zip") {
        extract_zip_all(&bytes, dest_dir)?;
    } else {
        extract_tar_gz_all(&bytes, dest_dir)?;
    }

    // Return the main binary path
    let bin_name = if cfg!(target_os = "windows") {
        "aether.exe"
    } else {
        "aether"
    };
    let binary_path = dest_dir.join(bin_name);
    if !binary_path.exists() {
        return Err("Binary not found after extraction".into());
    }

    Ok(binary_path)
}

/// Extract ALL files from a zip archive into dest_dir.
#[cfg(target_os = "windows")]
fn extract_zip_all(bytes: &[u8], dest: &PathBuf) -> Result<(), String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip: {e}"))?;

    let mut found_binary = false;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {e}"))?;
        let name = entry.name().to_string();

        // Extract aether binary and run-aether.bat
        let is_binary = name.ends_with("aether.exe") || name.ends_with("aether");
        let is_bat = name.to_lowercase().ends_with("run-aether.bat");

        if is_binary || is_bat {
            let file_name = if is_binary {
                if cfg!(target_os = "windows") {
                    "aether.exe"
                } else {
                    "aether"
                }
            } else {
                "run-aether.bat"
            };
            let out_path = dest.join(file_name);
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create {file_name}: {e}"))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("Failed to extract {file_name}: {e}"))?;
            if is_binary {
                found_binary = true;
            }
        }
    }

    if !found_binary {
        return Err("aether binary not found inside zip".into());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn extract_zip_all(_bytes: &[u8], _dest: &PathBuf) -> Result<(), String> {
    Err("zip extraction not supported on this platform".into())
}

/// Extract ALL matching files from a tar.gz archive into dest_dir.
fn extract_tar_gz_all(bytes: &[u8], dest: &PathBuf) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let cursor = std::io::Cursor::new(bytes);
    let gz = GzDecoder::new(cursor);
    let mut archive = Archive::new(gz);

    let mut found_binary = false;
    for entry in archive
        .entries()
        .map_err(|e| format!("Failed to read tar: {e}"))?
    {
        let mut entry = entry.map_err(|e| format!("Failed to read tar entry: {e}"))?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = path.to_string_lossy();

        let is_binary = name.ends_with("aether") || name.ends_with("aether.exe");
        let is_bat = name.to_lowercase().ends_with("run-aether.bat");

        if is_binary || is_bat {
            let file_name = if is_binary {
                if cfg!(target_os = "windows") {
                    "aether.exe"
                } else {
                    "aether"
                }
            } else {
                "run-aether.bat"
            };
            let out_path = dest.join(file_name);
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create {file_name}: {e}"))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("Failed to extract {file_name}: {e}"))?;
            #[cfg(unix)]
            if is_binary {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(0o755));
            }
            if is_binary {
                found_binary = true;
            }
        }
    }

    if !found_binary {
        return Err("aether binary not found inside tar.gz".into());
    }
    Ok(())
}

fn is_newer(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> { v.split('.').filter_map(|s| s.parse().ok()).collect() };
    let cur = parse(current);
    let lat = parse(latest);
    lat > cur
}
