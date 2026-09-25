# Aether-GUI — Project Rundown (working draft assembled by Main)

This file is the in-progress assembly of `PROJECT_RUNDOWN.md`. Sections marked **[VERIFIED-BY-MAIN]** come from direct reads of the source by the orchestrator; **[SLICE-NN]** sections are copied from subagent reports (paths `local://rundown-NN-*.md`) pending final verification.

## 1. What this repo is [VERIFIED-BY-MAIN]

Tauri 2 desktop GUI wrapper for the Aether censorship-circumvention tunnel. GUI-only: all tunnel/protocol logic lives upstream (github.com/CluvexStudio/Aether). Windows-first (Windows-only installers today), AGPL-3.0. GUI version 1.18.0, pinned engine 2.1.0 (separate versions).

Two processes:
1. **Frontend** — React 19 + TypeScript + Tailwind v4 + Zustand + Motion, two HTML entries (`index.html` main window, `log-window.html` log window), Vite dev server pinned `1420` (`strictPort`, watcher ignores `src-tauri/**`).
2. **Backend** — Rust/Tauri 2 (`src-tauri/src/`), drives the real `aether` binary via `portable-pty`, plus subsystems: local HTTP/SOCKS bridge, system-proxy switchboard, Windows TUN mode, independent IP-Changer Tor bundle.

## 2. Repo map (top level) [VERIFIED-BY-MAIN]

| path | role |
|---|---|
| `src/` | Frontend: `App.tsx` (root), `components/` (~85 incl. `ui/` shadcn primitives, `ip-changer/`), `state/` (connectionStore), `stores/` (ipChangerStore), `hooks/`, `lib/`, `types/`, `log-window.ts`, `index.css` |
| `src-tauri/src/` | Backend: `main.rs`→`lib.rs::run()`, `commands.rs`, `state.rs`, `events.rs`, `error.rs`, `tray.rs`, `focus.rs`, `history.rs`, `presets.rs`, `updater.rs`, `httpproxy.rs`, `sysproxy.rs`, `net.rs`, `traffic.rs`, `ip_changer.rs`, `childproc.rs`, `aether/` (mod, profiles, status, engine, pty, pty_output, pty_android, prompts, orphan), `tun/` (mod, route, dns, forwarder, cleanup, adapter) |
| `src-tauri/binaries/` | Engine staging: `fetch-aether.{py,ps1,sh}` + `test_fetch_aether.py`, gitignored `engine/` payload (`aether.exe` + `pt/`), committed `wintun.dll`, Tor expert bundle dirs `tor/<os>/<arch>/`, android assets, sample `aether*.toml` |
| `src-tauri/aether-release.json` | Pin: engine 2.1.0, asset names, SHA-256s |
| `.github/workflows/build.yml` | CI (only workflow) |
| docs | `README.md` + `README_fa.md` (bilingual pair), `PRODUCT.md`, `DESIGN.md`, `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/releases/` |
| Tooling noise (not product) | `.claude/`, `.agents/`, `.impeccable/`, `.mimocode/`, `.github/{agents,skills,hooks}`, `skills-lock.json`, `rel210.json`, `*.log` |

## 3. Startup & shutdown sequence [VERIFIED-BY-MAIN — lib.rs:24-239, main.rs]

`main.rs` → `aether_gui_lib::run()`.

Builder: plugins `store`, `notification`, `shell`, `dialog`, `clipboard_manager`; `autostart` (non-Android) with `MacosLauncher::LaunchAgent`, arg `--minimized`. `.manage(AppState::default())`.

Setup order:
1. `app_data_dir()` created (`create_dir_all`).
2. `aether::orphan::reap_orphan(&data_dir)` — reap crashed engine processes.
3. `#[cfg(windows)] tun::cleanup::reap_orphan_tun(&data_dir)`.
4. `focus::spawn_watcher` — window focus watcher.
5. `tray::init(app)`.
6. `httpproxy::start()` — failure aborts setup (mapped to `tauri::Error::Io`).
7. `ip_changer::spawn_auto_rotate(handle, state.tor_manager.clone())`.
8. Background thread: traffic emitter (1 s tick, emits `aether://traffic` only while `Connected`).
9. Start-minimized gate: reads `settings.json` `minimize_on_startup` AND `close_to_tray` (both must be true) → `window.hide()`.
10. Restore `window_position` `{x,y,width,height}` with sanity bounds (w,h > 100; −10 000 < x,y < 20 000).

Window events: `CloseRequested` → if `tray::get_close_to_tray()` then `prevent_close` + hide. `Moved|Resized` → persist `window_position` to `settings.json` (store saved immediately).

`RunEvent::Exit` → `aether::shutdown_blocking(&state.manager, &data_dir, app_handle)` then `ip_changer::shutdown_blocking(&state.tor_manager)`.

## 4. IPC command registry (53 commands) [VERIFIED-BY-MAIN — lib.rs invoke_handler]

`commands::` (40): `connect`, `disconnect`, `send_input`, `get_status`, `get_default_profile`, `set_default_profile`, `get_close_to_tray`, `set_close_to_tray`, `set_always_on_top`, `get_always_on_top`, `get_history`, `get_history_paginated`, `get_diagnostics`, `clear_history`, `get_minimize_on_startup`, `set_minimize_on_startup`, `set_system_proxy`, `set_system_proxy_addr`, `get_system_proxy`, `get_system_proxy_state`, `set_ip_proxy`, `get_app_version`, `check_update`, `get_presets`, `save_preset`, `delete_preset`, `aether_binary_exists`, `get_engine_info`, `get_engine_tor_status`, `get_engine_psiphon_status`, `download_aether`, `read_file`, `write_file`, `save_window_position`, `get_window_position`, `is_tun_available`, `get_tun_active`, `get_public_ip`, `get_traffic_stats`, `get_active_connections`.

`ip_changer::` (13): `start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `get_tor_status`, `set_auto_rotate`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `set_tor_lan`, `get_tor_lan`, `get_tor_source`, `set_use_system_tor`.

(Per-command semantics → SLICE-06 report; system-proxy/traffic/public-ip semantics → SLICE-07.)

## 5. Events backend → frontend [VERIFIED-BY-MAIN — events.rs]

| const | wire name | payload |
|---|---|---|
| `STATUS_EVENT` | `aether://status` | `ConnectionState` (tagged `"state"`) |
| `LOG_EVENT` | `aether://log` | `LogEvent { line, timestamp }` |
| `TRAFFIC_EVENT` | `aether://traffic` | `TrafficStats {tx_bytes, rx_bytes, tx_rate, rx_rate}` (1 s, only while Connected) |
| `ENGINE_TOR_STATUS_EVENT` | `aether://tor-status` | `EngineTorStatus { enabled, ready, address }` |
| `ENGINE_PSIHON_STATUS_EVENT` | `aether://psiphon-status` | same shape (alias `EnginePsiphonStatus`) |
| `TOR_STATUS_EVENT` | `ip-changer://status` | IP-Changer Tor status |
| `TOR_LOG_EVENT` | `ip-changer://log` | IP-Changer log line |

## 6. Connection state machine [VERIFIED-BY-MAIN — state.rs]

`ConnectionState` (`#[serde(tag = "state")]`): `Idle` → `Launching` → `Connecting` → `Connected { socks_addr, bridge_addr, connected_at_ms }`; `Reconnecting { attempt, max_attempts }`; `Disconnecting`; `Error { message, phase }`.

`AppState { manager: Arc<Mutex<AetherManager>>, tun_manager: Arc<Mutex<TunManager>>, tor_manager: Arc<Mutex<TorManager>> }`.

Frontend gate: `status.state === "Connected"` (App.tsx); `'Connected'` ground truth = TCP connect to primary SOCKS listener (default `127.0.0.1:1819`, `aether/status.rs`).

`AetherError` (error.rs, serialized as string): `AlreadyRunning`, `EngineIncompatible`, `SpawnFailed`, `PortInUse`, `NotConnected`, `ProxyConflict`, `Internal`.

## 7. Ports [cross-checked: AGENTS.md + SLICE-07]

| port | role |
|---|---|
| `127.0.0.1:1819` | primary SOCKS5 = "connected" probe, default chain target |
| `127.0.0.1:1820` | engine Tor secondary listener |
| `127.0.0.1:1821` | engine Psiphon chained listener |
| `9050` / `9051` | IP-Changer Tor SOCKS5 / control (independent bundle) |
| `127.0.0.1:<ephemeral>` | HTTP/SOCKS bridge listen port handed to OS proxy settings |
| ephemeral | private engine/tor/psiphon pin ports (`free_loopback_ports`) |
| `1420` | Vite dev port (strict) |

## 8. Pending cross-check queue (from SLICE-12, resolve during Verification)

27 doc-claims flagged, keyed to slices — see `local://rundown-12-docs-product.md` "Doc-vs-repo claims" (stale `PRODUCT.md` versions 0.17.1/2.0.0 vs actual 1.18.0/2.1.0; connected-probe definition; reconnect cap 3; TUN gated off in UI; fetch-helper validation; bundle formats; etc.).
