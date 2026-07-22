use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const STORE_FILE: &str = "history.json";
const STORE_KEY: &str = "connection_history";
const MAX_ENTRIES: usize = 20;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConnectionEntry {
    pub protocol: String,
    pub scan_mode: String,
    pub timestamp: u64,
    pub duration_secs: u64,
    pub success: bool,
}

pub fn load(app: &AppHandle) -> Vec<ConnectionEntry> {
    use tauri_plugin_store::StoreExt;
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(STORE_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, entry: &ConnectionEntry) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store(STORE_FILE) {
        let mut entries: Vec<ConnectionEntry> = store
            .get(STORE_KEY)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        entries.insert(0, entry.clone());
        entries.truncate(MAX_ENTRIES);
        if let Ok(value) = serde_json::to_value(&entries) {
            store.set(STORE_KEY, value);
            let _ = store.save();
        }
    }
}

pub fn clear(app: &AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store(STORE_FILE) {
        store.delete(STORE_KEY);
        let _ = store.save();
    }
}
