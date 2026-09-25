# Backend lifecycle & IPC surface (slice 06)

Covers `src-tauri/src/{main,lib,commands,state,events,error,tray,focus,childproc,history,presets,updater}.rs` plus `src-tauri/Cargo.toml` and the store/manifest files they touch (`src-tauri/aether-release.json`, `src-tauri/tauri.conf.json` window block).

## File inventory

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/main.rs` | 113 B / 5 lines | Binary entry point: `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` then `fn main() { aether_gui_lib::run() }`. No logic. |
| `src-tauri/src/lib.rs` | 9.6 KB / 239 lines | `pub fn run()` — the whole app lifecycle: plugin registration, `manage(AppState)`, `.setup()` startup sequence, the 53-command `invoke_handler` list, `on_window_event` (close-to-tray + window geometry persistence), and the `RunEvent::Exit` shutdown hook. |
| `src-tauri/src/commands.rs` | 13.4 KB / 434 lines | 40 `#[tauri::command]` fns: connection control, settings store reads/writes, sysproxy toggles, presets, diagnostics, engine info/repair, file I/O, window position, TUN/public-IP/traffic queries. |
| `src-tauri/src/state.rs` | 1.0 KB / 43 lines | `AppState` (three `Arc<Mutex<…>>` managers) and the `ConnectionState` enum serialized to the frontend. |
| `src-tauri/src/events.rs` | 945 B / 32 lines | All event-name string constants (`aether://…`, `ip-changer://…`), `EngineTorStatus` payload type, `LogEvent`, `now_millis()`. |
| `src-tauri/src/error.rs` | 827 B / 28 lines | `AetherError` (thiserror) + hand-written `serde::Serialize` that flattens it to the Display string. |
| `src-tauri/src/tray.rs` | 2.9 KB / 102 lines | Tray icon + `Show`/`Quit` menu, `CLOSE_TO_TRAY` atomic backed by `settings.json`, `show_window()`, one unit test. |
| `src-tauri/src/focus.rs` | 1.0 KB / 32 lines | Windows-only foreground-window poller thread emitting `app://focused` (bool) on change. |
| `src-tauri/src/childproc.rs` | 243 B / 12 lines | `hidden(&mut Command)` — applies `CREATE_NO_WINDOW` (0x0800_0000) on Windows so spawned children never flash a console. |
| `src-tauri/src/history.rs` | 1.6 KB / 55 lines | Connection history CRUD in store file `history.json`, key `connection_history`, newest-first, capped at 20. |
| `src-tauri/src/presets.rs` | 2.1 KB / 66 lines | Named profile presets in store file `presets.json`, key `saved_presets`, capped at 10, replace-by-name. |
| `src-tauri/src/updater.rs` | 25.1 KB / 718 lines | Two flows: (a) GUI self-update *check* against GitHub releases (no install), (b) engine binary *download + hardened archive install* with SHA-256, arch, zip-slip, duplicate-entry and staging/rollback checks. 9 unit tests. |
| `src-tauri/Cargo.toml` | 1.2 KB | deps: `tauri` (feature `tray-icon`), `tauri-plugin-{store,notification,autostart,shell,dialog,clipboard-manager}`, `reqwest` (json+socks+rustls, no default features), `zip 2`, `tar`, `flate2`, `sha2`, `base64`, `thiserror 1`; `portable-pty` under `cfg(not(target_os = "android"))`; `windows-sys/winreg/wintun/pnet_packet/parking_lot` under `cfg(windows)`. Package `aether-gui` **version 1.18.0**, lib name `aether_gui_lib`, rust-version 1.98. |
| `src-tauri/aether-release.json` | 875 B | Checked-in engine release manifest consumed by `updater::engine_release()` (`include_str!`): `"version": "2.1.0"`, `"repository": "CluvexStudio/Aether"`, 5 platform assets each with `name` + `sha256`. |

## Architecture / data flow

### Startup sequence (`lib.rs::run`)

1. **`main.rs`** → `aether_gui_lib::run()`.
2. **Builder + plugins** (`lib.rs:24-34`), in registration order:
   - `tauri_plugin_store::Builder::default().build()`
   - `tauri_plugin_notification::init()`
   - `tauri_plugin_shell::init()`
   - `tauri_plugin_dialog::init()`
   - `tauri_plugin_clipboard_manager::init()`
   - `#[cfg(not(target_os = "android"))] tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"]))`
   - `#[cfg_attr(mobile, tauri::mobile_entry_point)]` decorates `run()`.
3. **`.manage(AppState::default())`** — injects the single managed state (3 mutexes).
4. **`.setup(|app| …)`** (`lib.rs:37-144`), in exact order:
   1. `data_dir = app.handle().path().app_data_dir()` + `fs::create_dir_all` (failure aborts setup).
   2. `aether::orphan::reap_orphan(&data_dir)` — reap leftover engine processes.
   3. `#[cfg(target_os = "windows")] tun::cleanup::reap_orphan_tun(&data_dir)`.
   4. `focus::spawn_watcher(app.handle().clone())` (no-op off Windows).
   5. `tray::init(app)?` (loads `close_to_tray` preference; builds the tray menu on desktop).
   6. `httpproxy::start()` — failure is logged **and** propagated as `tauri::Error::Io`, aborting startup.
   7. `ip_changer::spawn_auto_rotate(app.handle(), state.tor_manager.clone())`.
   8. Background thread: every **1000 ms**, if `manager.status()` is `Connected { .. }`, emit `events::TRAFFIC_EVENT` (`"aether://traffic"`) with `traffic::snapshot()`.
   9. Read store `settings.json` key **`ip_changer_use_system_tor`** (default `false`) → `tor_manager.set_use_system_tor(…)`.
   10. Read **`minimize_on_startup`** and **`close_to_tray`** (both default `false`); if *both* true → `app.get_webview_window("main").hide()`.
   11. Read **`window_position`** `{x,y,width,height}`; sanity gate `w>100 && h>100 && x>-10000 && y>-10000 && x<20000 && y<20000`, then `set_position`/`set_size` on window `main` (physical px).
5. **`.invoke_handler(tauri::generate_handler![ … ])`** — 53 commands (table below).
6. **`.on_window_event`** (`lib.rs:201-225`):
   - `CloseRequested` → if `tray::get_close_to_tray()` then `api.prevent_close()` + `window.hide()`.
   - `Moved`/`Resized` → immediately write `window_position` to `settings.json` and `store.save()` (no debounce).
7. **`.build(tauri::generate_context!())`** then **`.run(…)`**: only `tauri::RunEvent::Exit` is handled →
   `aether::shutdown_blocking(&state.manager, &data_dir, app_handle)` (data_dir falls back to `std::env::temp_dir()` if path resolution fails) and `ip_changer::shutdown_blocking(&state.tor_manager)`.

### Window creation

No `WebviewWindowBuilder` anywhere in Rust: the single window comes from `src-tauri/tauri.conf.json` → `app.windows[0]` (no `label`, so the default label **`main`**; title `Aether-GUI`, 420×640, `minWidth` 320, `minHeight` 400, `center: true`, `decorations: false`, `transparent: true`, `shadow: false`, `resizable: true`). Everything Rust-side addresses it as `get_webview_window("main")`.

### IPC round-trip shape

- Args: JS sends camelCase keys, Rust fn params are snake_case (Tauri's default rename): e.g. `connect` → `{ profileOverride }`, `set_auto_rotate` → `{ intervalSecs, enabled }`, `set_use_system_tor` → `{ useSystem }`.
- Success: command return value serializes straight into the promise result.
- Error: `Result<T, AetherError>` rejects with **the plain Display string** (`error.rs` serializes `self.to_string()`), e.g. `"Aether is already running"`, `"a system proxy is already set — turn it off first before switching"`.

### Connection lifecycle as seen from this slice

`connect` → `aether::start_connect(app, manager, profile_override)` on a blocking task (state machine and process supervision live in `aether/`) → state changes flow back over `aether://status`; `get_status` is a synchronous snapshot; `disconnect` → `aether::request_disconnect`; `send_input` writes one line into the engine PTY. History rows are appended by the aether layer (`history::save`), read back by `get_history`/`get_history_paginated`, wiped by `clear_history`.

### Engine repair flow (`download_aether`)

Guarded by global `aether::engine::INSTALLING` mutex (returns `"Engine repair is already running"` if already set) *and* requires status `Idle | Error { .. }` (else `AetherError::AlreadyRunning`); `InstallationGuard` resets the flag on any exit path → `updater::download_aether_binary(install_dir)` → re-inspect with `get_engine_info`; if `!info.compatible` → `AetherError::EngineIncompatible(problem)`; else returns the installed path as `String`.

### GUI update flow (`check_update`)

Pure *check*: GitHub API `GET https://api.github.com/repos/FreaksLxss/Aether-GUI-Next/releases/latest` (UA `Aether-GUI`) → compare `tag_name` (leading `v` stripped) to `env!("CARGO_PKG_VERSION")` via `is_newer` (numeric dot-segment compare) → return `UpdateInfo { available, latest_version, current_version, download_url }`. `download_url` = first release asset whose name ends `.exe` else `.msi`, else `html_url`. **No install, no event emitted**; the frontend opens `download_url` with `@tauri-apps/plugin-shell` `open()` (`src/components/UpdateChecker.tsx:74`).

## Key details

### Full `invoke_handler` registration list (lib.rs:146-200, exact names)

53 total = 40 from `commands.rs` + 13 from `ip_changer.rs`.

#### `commands.rs` — 40 commands

| command | args (Rust / JS) | what it does | state/module touched |
|---|---|---|---|
| `connect` | `profile_override: Option<ConnectionProfile>` / `profileOverride` (async) | `spawn_blocking(aether::start_connect(…))`; join error → `AetherError::Internal` | `state.manager` (clone), `aether` |
| `disconnect` | — | `aether::request_disconnect(&app, &state.manager)` | `state.manager`, `aether` |
| `send_input` | `line: String` | writes one line to the engine PTY session | `aether::send_input` |
| `get_status` | — | returns `state.manager.lock().status()` (no Result) | `state.manager` |
| `get_default_profile` | — | `aether::profiles::load(&app)` (store-backed) | `aether::profiles` |
| `set_default_profile` | `profile: ConnectionProfile` | `profiles::validate` first (error → `Internal(msg)`), then `profiles::save` | `aether::profiles` |
| `get_close_to_tray` | — | `tray::get_close_to_tray()` (atomic read) | `tray::CLOSE_TO_TRAY` |
| `set_close_to_tray` | `enabled: bool` | atomic + persist to `settings.json` (`close_to_tray`) | `tray` |
| `set_always_on_top` | `enabled: bool` | `window("main").set_always_on_top`, atomic `ALWAYS_ON_TOP`, key `always_on_top` | window, store |
| `get_always_on_top` | — | reads key (default `false`), re-applies to window, returns it | window, store |
| `get_history` | — | `history::load(&app)` → all rows | `history` |
| `get_history_paginated` | `offset: Option<usize>` (=0), `limit: Option<usize>` (=20) | `history::load_paginated` — limit clamped 1..=50 | `history` |
| `get_diagnostics` | — | `Diagnostics { profile, history, status }` with `redact_profile` nulling `zt_access_secret` + `zt_access_token` | profiles, history, manager |
| `clear_history` | — | deletes key `connection_history` from `history.json` | `history` |
| `get_minimize_on_startup` | — | store key `minimize_on_startup`, default `false` | store |
| `set_minimize_on_startup` | `enabled: bool` | writes that key | store |
| `set_system_proxy` | `enable: bool` | enable → conflict check vs non-`SOURCE_MAIN` owner, else `sysproxy::enable("127.0.0.1:1819", SOURCE_MAIN)`; disable → `sysproxy::disable()` | `sysproxy` |
| `set_system_proxy_addr` | `addr: String`, `enabled: bool` | same but caller-supplied addr, still owner `SOURCE_MAIN` | `sysproxy` |
| `get_system_proxy` | — | `sysproxy::is_enabled()` | `sysproxy` |
| `get_system_proxy_state` | — | `SystemProxyState { enabled, owner, port }`, owner mapped `SOURCE_MAIN`→`"main"`, `SOURCE_IP_CHANGER`→`"ip_changer"`, else `"none"`; `port = sysproxy::socks_port()` | `sysproxy` |
| `set_ip_proxy` | `enabled: bool` | `sysproxy::ensure_free(SOURCE_IP_CHANGER)` (else `ProxyConflict`), then enable `127.0.0.1:{tor socks_port}` as `SOURCE_IP_CHANGER`; disable → `sysproxy::disable()` | `state.tor_manager`, `sysproxy` |
| `get_app_version` | — | `env!("CARGO_PKG_VERSION")` → `"1.18.0"` | compile-time |
| `check_update` | (async) | `updater::check_for_update(env!("CARGO_PKG_VERSION"))` | `updater` (network) |
| `get_presets` | — | `presets::load_all(&app)` | `presets` |
| `save_preset` | `name: String`, `profile: ConnectionProfile` | `profiles::validate` then `presets::save_preset` (error → `Internal`) | `presets`, `aether::profiles` |
| `delete_preset` | `name: String` | `presets::delete_preset` (no Result) | `presets` |
| `aether_binary_exists` | (async) | `get_engine_info(app).await.map(|i| i.compatible).unwrap_or(false)` | `aether::engine` |
| `get_engine_info` | (async) | `spawn_blocking(aether::engine::inspect)` → `EngineInfo` | `aether::engine` |
| `get_engine_tor_status` | — | `state.manager.lock().tor_status()` → `events::EngineTorStatus` | `state.manager` |
| `get_engine_psiphon_status` | — | `state.manager.lock().psiphon_status()` (same type) | `state.manager` |
| `download_aether` | (async) | engine repair (flow above): `INSTALLING` guard + status gate + `updater::download_aether_binary` + re-inspect | `aether::engine`, `updater`, `state.manager` |
| `read_file` | `path: String` | `fs::read_to_string(path)` — **arbitrary path read, no sandbox** | filesystem |
| `write_file` | `path: String`, `contents: String` | `fs::write` — **arbitrary path write, no sandbox** | filesystem |
| `save_window_position` | `x, y, width, height: f64` | writes `window_position` `{x,y,width,height}` to `settings.json` | store |
| `get_window_position` | — | `Option<(f64,f64,f64,f64)>` = `(x,y,w,h)` | store |
| `is_tun_available` | — | Windows: `OpenProcessToken` + `GetTokenInformation(TokenElevation)` → `TokenIsElevated != 0`; non-Windows: `false` | Win32 API |
| `get_tun_active` | — | `state.tun_manager.lock().is_active()` | `state.tun_manager` |
| `get_public_ip` | `through_tunnel: bool` (async) | `net::fetch_public_info(through_tunnel, &profile.bind_address)` | `net`, profiles |
| `get_traffic_stats` | — | `traffic::snapshot()` | `traffic` |
| `get_active_connections` | — | `traffic::active_connections()` → `Vec<ActiveConn>` | `traffic` |

#### `ip_changer.rs` — 13 registered commands (documented in the TUN/IP-changer slice)

`start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `get_tor_status`, `set_auto_rotate`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `set_tor_lan`, `get_tor_lan`, `get_tor_source`, `set_use_system_tor`.

#### Frontend usage of the 53 (literal `invoke("<name>")` in `src/**/*.{ts,tsx}`)

**Registered but never invoked from the frontend (6):** `get_history_paginated`, `get_diagnostics`, `set_system_proxy`, `get_system_proxy`, `aether_binary_exists`, `is_tun_available` — for each there is a sibling the UI does call: `get_history`, (none for diagnostics), `set_system_proxy_addr`, `get_system_proxy_state`, `get_engine_info`, [TUN availability is never surfaced; `get_tun_active` is].

**Where the used ones land (main callers):** `connect`/`disconnect`/`get_status`/`clear_history`/`get_history`/`get_traffic_stats`/`get_active_connections`/`get_public_ip`/`get_engine_{tor,psiphon}_status` → `src/state/connectionStore.ts`; `start_tor`/`stop_tor`/`rotate_ip`/`get_current_ip`/`get_tor_*`/`get_socks_addr`/`set_auto_rotate`/`get_auto_rotate`/`set_ip_proxy`/`set_tor_lan`/`set_use_system_tor`/`tor_binary_exists` → `src/stores/ipChangerStore.ts`; settings toggles → `src/components/{AlwaysOnTopToggle,CloseToTrayToggle,MinimizeOnStartupToggle,SystemProxyToggle,ProxyIndicator,TunIndicator}.tsx`; presets → `src/components/ProfilePresets.tsx`; `check_update` → `src/components/UpdateChecker.tsx`; `get_app_version` + `get_engine_info` → `src/components/AboutDialog.tsx`; `download_aether` → `src/components/SidecarErrorScreen.tsx`; `read_file`/`write_file`/`save_preset` + settings getters/setters → `src/components/SettingsIO.tsx`; `send_input` → `src/components/ZeroTrustPanel.tsx`; `save_window_position`/`get_window_position` → `src/hooks/useWindowPersist.ts`; `write_file` also from `ConnectionHistoryContent.tsx` and `VirtualLogList.tsx` (log/history export); `set_close_to_tray` also from `src/lib/close.ts`.

### Structs / enums

**`state.rs`**
- `ConnectionState` — `#[derive(Serialize, Clone, Debug)]`, `#[serde(tag = "state")]` (internally tagged), variants:
  - `Idle`, `Launching`, `Connected { socks_addr: String, bridge_addr: String, connected_at_ms: u64 }`, `Reconnecting { attempt: u32, max_attempts: u32 }`, `Disconnecting`, `Error { message: String, phase: String }`.
- `AppState { manager: Arc<Mutex<aether::AetherManager>>, tun_manager: Arc<Mutex<tun::TunManager>>, tor_manager: Arc<Mutex<ip_changer::TorManager>> }`; `Default::default()` builds all three.

**`events.rs`**
- Payloads: `EngineTorStatus { enabled: bool, ready: bool, address: Option<String> }` (`Default, PartialEq, Eq`), `pub type EnginePsiphonStatus = EngineTorStatus;`, `LogEvent { line: String, timestamp: u64 }`.
- `now_millis()` = ms since UNIX epoch, `unwrap_or(0)`.

**`commands.rs` return types:** `SystemProxyState { enabled: bool, owner: String, port: u16 }`; `Diagnostics { profile: ConnectionProfile, history: Vec<ConnectionEntry>, status: ConnectionState }`.

**`updater.rs`:** `UpdateInfo { available: bool, latest_version: String, current_version: String, download_url: String }`; private `EngineRelease { version, repository, assets: BTreeMap<String, EngineAsset> }` and `EngineAsset { name, sha256 }`.

**`history.rs`:** `ConnectionEntry { protocol: String, scan_mode: String, timestamp: u64, duration_secs: u64, success: bool }` (Serialize+Deserialize).

**`presets.rs`:** `ProfilePreset { name: String, profile: ConnectionProfile, created_at: u64 }` (Serialize+Deserialize, `created_at = events::now_millis()`).

**`error.rs`:** `AetherError` variants + Display text (verbatim):
`AlreadyRunning` → "Aether is already running"; `EngineIncompatible(String)` → "Aether engine incompatible: {0}"; `SpawnFailed(String)` → "failed to launch Aether: {0}"; `PortInUse(u16)` → "port {0} is already in use by another process"; `NotConnected` → "no active connection"; `ProxyConflict` → "a system proxy is already set — turn it off first before switching"; `Internal(String)` → "internal error: {0}". Custom `impl serde::Serialize` emits `serializer.serialize_str(&self.to_string())`.

### Events — exact name strings

| constant (`events.rs`) | literal | payload | emitted from |
|---|---|---|---|
| `STATUS_EVENT` | `aether://status` | `ConnectionState` | `aether::set_state_and_emit` + direct `emit` calls in `aether/mod.rs` |
| `LOG_EVENT` | `aether://log` | `LogEvent` | `aether/mod.rs` (engine log lines) |
| `ENGINE_TOR_STATUS_EVENT` | `aether://tor-status` | `EngineTorStatus` | `aether::AetherManager::set_tor_status` |
| `ENGINE_PSIHON_STATUS_EVENT` | `aether://psiphon-status` | `EngineTorStatus` (alias) | `aether::AetherManager::set_psiphon_status` |
| `TRAFFIC_EVENT` | `aether://traffic` | `traffic::TrafficStats` | `lib.rs` 1 s poller (only while `Connected`) |
| `TOR_STATUS_EVENT` | `ip-changer://status` | `ip_changer::TorStatus` | `ip_changer.rs` |
| `TOR_LOG_EVENT` | `ip-changer://log` | `LogEvent` | `ip_changer.rs` |
| *(inline, not a constant)* | `app://focused` | `bool` | `focus.rs::spawn_watcher` |

`updater.rs` emits **no events**. Frontend listeners confirmed: `aether://{status,log,traffic,tor-status,psiphon-status}` in `src/state/connectionStore.ts` and `src/log-window.ts`; `ip-changer://{status,log}` in `src/stores/ipChangerStore.ts`; `app://focused` in `src/state/windowFocus.ts`.

### Storage locations, keys, defaults, ports, paths

- All persistence goes through **`tauri-plugin-store`**; `resolve_store_path` resolves against **`BaseDirectory::AppData`** (plugin v2.4.3 `store.rs:30`), i.e. next to the `app_data_dir()` used in `setup`.
- Store files / keys:
  - `settings.json` — `close_to_tray` (bool, default `false`), `minimize_on_startup` (bool, default `false`), `always_on_top` (bool, default `false`), `window_position` (`{x,y,width,height}` px), `ip_changer_use_system_tor` (bool, default `false`).
  - `history.json` — key `connection_history`, `Vec<ConnectionEntry>`, `MAX_ENTRIES = 20`, inserted at index 0.
  - `presets.json` — key `saved_presets`, `Vec<ProfilePreset>`, `MAX_PRESETS = 10`, replace-by-name then insert at 0.
- Constants: `GUI_REPO = "FreaksLxss/Aether-GUI-Next"` (GUI update check); engine manifest repo `CluvexStudio/Aether`, pinned version **`2.1.0`**, 5 assets (`windows-x86_64`, `linux-x86_64`, `linux-aarch64`, `macos-x86_64`, `macos-aarch64`).
- Ports/URLs: system-proxy main address hard-coded **`127.0.0.1:1819`** in `set_system_proxy`; IP-changer system proxy uses `127.0.0.1:{tor_manager.socks_port()}`; update API `https://api.github.com/repos/FreaksLxss/Aether-GUI-Next/releases/latest`; engine asset URL `https://github.com/{repository}/releases/download/v{version}/{asset.name}`.
- Engine download limits: connect timeout 20 s, total 180 s, `MAX_ARCHIVE = 64 MiB`, `MAX_FILE = 128 MiB`, aggregate `MAX_FILE * 2`.
- Payload allow-list per target (`payload_names`): Windows → `aether.exe`, `pt/lyrebird.exe`, `pt/psiphon-tunnel-core.exe`, dir `pt`, plus `run-aether.bat` (accepted but *not* written — `name != engine/pt/psiphon` → skipped after validation); others → `aether`, `pt/lyrebird`, `pt/psiphon-tunnel-core`.
- Install lock file: `.{dest_name}.install-lock` (created `create_new`, removed on drop); staging dir `.{dest_name}.stage-{pid}-{nonce}`; backup `.{dest_name}.backup-{pid}-{nonce}`; rename-into-place with rollback of the backup on failure.
- Engine install returns path `dest.join(aether binary)`.

### Platform quirks / `#[cfg(...)]` gates in this slice

- `main.rs:1` — `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` (no console in release).
- `lib.rs:22` — `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `run()`.
- `lib.rs:30` — `#[cfg(not(target_os = "android"))]` autostart plugin (`--minimized` arg).
- `lib.rs:41` — `#[cfg(target_os = "windows")]` `tun::cleanup::reap_orphan_tun`.
- `commands.rs:10/14` — `ALWAYS_ON_TOP: AtomicBool` and its `use` only on non-Android.
- `commands.rs:70 / 88`, `96 / 113` — `set_always_on_top` / `get_always_on_top` have desktop and Android variants; Android `set_…` returns `Internal("always-on-top is a desktop-only feature")`, Android `get_…` returns `false`.
- `commands.rs:380 / 409` — `is_tun_available`: Win32 token-elevation query vs `false`.
- `tray.rs:4 / 40 / 76 / 82` — non-Android: real tray builder; Android: `init` only loads the preference; `show_window` desktop-only.
- `focus.rs:4 / 30` — watcher thread only `#[cfg(windows)]`; other OSes just drop the handle.
- `childproc.rs:5` — `#[cfg(windows)]` `creation_flags(0x0800_0000)` (`CREATE_NO_WINDOW`).
- `updater.rs:40 / 78` — `check_for_update` real vs Android stub returning `available: false` and empty strings.
- `updater.rs:103 / 444` — `download_aether_binary` real vs Android stub `Err("Aether is bundled in the APK on Android")`.
- `updater.rs:282 / 676` — `#[cfg(unix)]` chmod `0o755` on extracted binaries (and its test assertion).
- `Cargo.toml` — `[target.'cfg(not(target_os = "android"))'.dependencies] portable-pty`, `[target.'cfg(windows)'.dependencies] windows-sys/winreg/wintun/pnet_packet/parking_lot`.

### Security-relevant notes (as-is, not changes)

- `read_file` / `write_file` take an arbitrary filesystem path with no allow-list; the frontend uses them for settings/history export-import (JSON/CSV). Frontend-reachable arbitrary read/write by design. [INFERENCE] mitigated only by Tauri's capability model for the command surface itself.
- Engine install path is hardened: SHA-256 check (`verify_checksum`), binary header/arch check (`check_architecture` — PE `MZ`+`PE\0\0\x64\x86` for windows-x86_64, ELF `\x7fELF\x02\x01` + e_machine 62/183 for linux, `0xfeedfacf` + cputype 7/12 for macOS), zip-slip/duplicate/`..` rejection (`PayloadWriter::entry`), `reject_duplicate_zip_entries` (CD/footer consistency, no ZIP64/multi-disk), no symlinks/hardlinks (tar entry types rejected; unix_mode masked `0o170000` must be `0` or `0o040000`/`0o100000`), size caps, `create_new` writes + `sync_all`, lockfile, stage→backup→rename with rollback.
- GUI updater only *reads* GitHub; it never downloads or applies the app update.

### Tests present (in-slice)

- `tray.rs` `mod tests` (1): `atomic_flag_round_trips` — `CLOSE_TO_TRAY` store/load.
- `updater.rs` `mod tests` (9): `pinned_manifest_and_platforms` (asserts `expected_version() == "2.1.0"`, 5 assets, linux x86_64 asset name contains `musl`), `complete_zip_preserves_pt_and_omits_launcher`, `checksum_failure_does_not_touch_old_install`, `partial_archive_does_not_touch_old_install`, `rejects_unsafe_duplicate_conflicting_and_link_members`, `rejects_tar_symlinks_and_hardlinks`, `rejects_duplicate_names_hidden_by_zip_index`, `complete_tar_preserves_pt` (incl. 0o755 mode check), `repair_preserves_previous_directory`, `rejects_mismatched_architecture`.
- No `#[cfg(test)]` in `commands.rs`, `state.rs`, `events.rs`, `error.rs`, `focus.rs`, `childproc.rs`, `history.rs`, `presets.rs`, `lib.rs`, `main.rs`.

## Links to other sections

- **aether/ (engine, profiles, PTY, orphan reap)** — `commands::{connect,disconnect,send_input,get_status,get_default_profile,set_default_profile,get_diagnostics,get_engine_*}`, `state.manager`, `aether::orphan::reap_orphan`, `aether::shutdown_blocking`, `aether::profiles::{load,save,validate}`, `aether::engine::{inspect,install_dir,INSTALLING}`.
- **tun/ (TUN manager + Windows cleanup)** — `state.tun_manager`, `commands::{is_tun_available,get_tun_active}`, `tun::cleanup::reap_orphan_tun`.
- **ip_changer/ (Tor IP rotation)** — `state.tor_manager`, the 13 registered `ip_changer::*` commands, `ip_changer::{spawn_auto_rotate,shutdown_blocking}`, `set_ip_proxy`'s use of `tor_manager.socks_port()`.
- **httpproxy / sysproxy / net / traffic** — `httpproxy::start()` in setup; `commands::{set_system_proxy,set_system_proxy_addr,get_system_proxy,get_system_proxy_state,set_ip_proxy}` → `sysproxy::{enable,disable,is_enabled,source,socks_port,ensure_free,SOURCE_MAIN,SOURCE_IP_CHANGER}`; `get_public_ip` → `net::fetch_public_info`; `get_traffic_stats`/`get_active_connections` + the 1 s `traffic::snapshot()` emitter.
- **frontend** — every command in the table is the IPC contract; `src/state/connectionStore.ts`, `src/stores/ipChangerStore.ts`, `src/hooks/useWindowPersist.ts`, toggles under `src/components/`; event constants in `events.rs` are the `listen()` names.
- **build/packaging** — `Cargo.toml` deps/features and version `1.18.0` (feeds `get_app_version`), `tauri.conf.json` window block (label `main`), `src-tauri/aether-release.json` (engine version pin, asserted by `updater` test).
