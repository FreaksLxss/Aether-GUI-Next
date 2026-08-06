use crate::aether::profiles::ConnectionProfile;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const STORE_FILE: &str = "presets.json";
const STORE_KEY: &str = "saved_presets";
const MAX_PRESETS: usize = 10;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProfilePreset {
    pub name: String,
    pub profile: ConnectionProfile,
    pub created_at: u64,
}

pub fn load_all(app: &AppHandle) -> Vec<ProfilePreset> {
    use tauri_plugin_store::StoreExt;
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(STORE_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub fn save_preset(app: &AppHandle, name: &str, profile: &ConnectionProfile) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let mut presets: Vec<ProfilePreset> = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Replace existing with same name, or add new
    presets.retain(|p| p.name != name);
    presets.insert(
        0,
        ProfilePreset {
            name: name.to_string(),
            profile: profile.clone(),
            created_at: crate::events::now_millis(),
        },
    );
    presets.truncate(MAX_PRESETS);

    let value = serde_json::to_value(&presets).map_err(|e| format!("Failed to serialize: {e}"))?;
    store.set(STORE_KEY, value);
    let _ = store.save();
    Ok(())
}

pub fn delete_preset(app: &AppHandle, name: &str) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store(STORE_FILE) {
        let mut presets: Vec<ProfilePreset> = store
            .get(STORE_KEY)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        presets.retain(|p| p.name != name);
        if let Ok(value) = serde_json::to_value(&presets) {
            store.set(STORE_KEY, value);
            let _ = store.save();
        }
    }
}
