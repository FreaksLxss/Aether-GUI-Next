# Slice 08 — Aether engine core (`src-tauri/src/aether/{mod,status,engine,orphan,prompts}.rs`)

The controller layer between Tauri commands and the `aether` engine binary: it owns the
`AetherManager` state machine, spawns/monitors the engine PTY process, decides when the
connection counts as *connected* (TCP probe), resolves which engine binary to run, reaps
orphaned engine processes at startup, and auto-answers the engine's interactive prompts.

## File inventory

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/aether/mod.rs` | 23.0 KB (681 lines) | `AetherManager` + the whole connect/disconnect/retry state machine: `start_connect`, `spawn_and_monitor`, `monitor_connect`, `monitor_connected`, `handle_unexpected_failure`, `send_input`, `request_disconnect`, `shutdown_blocking`; bridges PTY log channel → `aether://log` events. |
| `src-tauri/src/aether/status.rs` | 12.0 KB (332 lines) | Ground-truth "is it live" helpers: `port_is_live` TCP probe (300 ms), bind-address parsing/fallbacks, per-scan-mode `connect_timeout`, mode-aware `startup_timeout`, secondary Tor/Psiphon listener discovery (`127.0.0.1:1820`/`1821`), retry constants, startup stage strings; hosts 11 unit tests. |
| `src-tauri/src/aether/engine.rs` | 9.6 KB (288 lines) | Engine binary resolution: versioned install dir `binaries/engine-<pinned>`, candidate probing (`--version`), PT (`pt/lyrebird`) validation, `EngineInfo` report, `resolve()` gate, `INSTALLING` repair mutex; 3 tests. |
| `src-tauri/src/aether/orphan.rs` | 1.5 KB (59 lines) | PID-file based orphan reaping: `write_pid`/`clear_pid`/`reap_orphan` over `<app-data>/aether.pid` with platform `is_alive`/`kill_pid` (unix `kill -0`/`kill -9`, Windows `tasklist`/`taskkill`). |
| `src-tauri/src/aether/prompts.rs` | 1.1 KB (34 lines) | `PROMPT_TABLE`: four interactive menu prompts the engine prints (`Protocol:`, `Scan mode:`, `IP version to scan:`, `MASQUE transport:`) mapped to profile-derived answers; `looks_like_choice_prompt`. |

Cross-referenced but owned by other slices (not covered in depth here): `profiles.rs`,
`pty.rs`, `pty_output.rs`, `pty_android.rs` (slice 09), `tun/`, `ip_changer.rs`,
`httpproxy.rs`, `updater.rs`, `commands.rs`, `lib.rs`.

## Architecture / data flow

### Module wiring (`mod.rs:1-11`)

```rust
pub mod engine; pub mod orphan; pub mod profiles; pub mod prompts;
#[cfg(not(target_os = "android"))] pub mod pty;
#[cfg(target_os = "android")] #[path = "pty_android.rs"] pub mod pty;
pub mod pty_output; pub mod status;
```
So on Android the PTY implementation is `pty_android.rs`, everywhere else `pty.rs`.

### Startup (in `src-tauri/src/lib.rs`, `setup` closure)

1. `data_dir = app.handle().path().app_data_dir()?` → `create_dir_all` (`lib.rs:38-39`).
2. `aether::orphan::reap_orphan(&data_dir)` (`lib.rs:40`) — kills any engine left over
   from a previous run; then, Windows-only, `tun::cleanup::reap_orphan_tun(&data_dir)`
   (`lib.rs:42`) — TUN state lives in the *same* `data_dir`.
3. `httpproxy::start()` (`lib.rs:45`) — the GUI-side HTTP proxy bridge must be up before
   any connect (module `crate::httpproxy`, slice BackendProxyNet).
4. A 1000 ms thread (`lib.rs:57-69`) emits `aether://traffic` with `traffic::snapshot()`
   only while state is `ConnectionState::Connected { .. }`.

### GUI connect click → events (end-to-end)

1. Frontend invokes command **`connect`** (`commands.rs:17-29`) →
   `tauri::async_runtime::spawn_blocking(|| aether::start_connect(app, manager, profile_override))`.
2. **`start_connect`** (`mod.rs:95-190`):
   - Rejects while `engine::INSTALLING` is held → `AetherError::Internal("Engine repair is in progress")`.
   - `profile = profile_override.unwrap_or_else(|| profiles::load(&app))`; `profiles::validate(&profile)` → `Internal(msg)` on failure.
   - `binary = engine::resolve(&app)?` (fails `EngineIncompatible` when no compatible engine).
   - `data_dir = app_data_dir(&app)` (`app.path().app_data_dir()`, fallback `std::env::temp_dir()`), `create_dir_all`.
   - State must be `Idle` or `Error { .. }`, else `AetherError::AlreadyRunning`.
   - Computes secondary doors: `tor_door` only for `EngineTorMode::Tor` (via `status::secondary_tor_address`, default `127.0.0.1:1820`) or the parsed `engine_tor_bind` for `TorReverse`; `psiphon_door` only for `EnginePsiphonMode::Psiphon` (default `127.0.0.1:1821`) or parsed `engine_psiphon_bind` for `PsiphonReverse`.
   - Proxy reservations, each failure → `AetherError::PortInUse(port)`: `httpproxy::route_connect(&profile.bind_address, tor_door)`, optional `httpproxy::claim(http, engine)` for `http_proxy_address`, `httpproxy::claim_psiphon_door(door)`, and for reverse modes `httpproxy::reserve_engine_psiphon()` / `reserve_engine_tor()` (failures → `Internal`).
   - Sets `state = Launching`, `retry_count = 0`, `crate::traffic::reset()`, emits `STATUS_EVENT` with `Launching`.
3. **`spawn_and_monitor`** (`mod.rs:192-253`):
   - Creates `mpsc::channel::<LogEvent>()`.
   - **Engine-side profile remap** (the engine never sees the public bind address):
     `engine_profile.bind_address = httpproxy::engine_addr()`,
     `engine_profile.engine_tor_bind = httpproxy::engine_tor_addr()`,
     `engine_profile.engine_psiphon_bind = httpproxy::engine_psiphon_addr()`.
   - `pty::spawn(&binary, &data_dir, engine_profile, log_tx)` — spawn is `portable-pty`
     (`pty.rs` `pty.pair()` → `spawn_command`), **cwd = `data_dir`**, argv = `profile.as_args()`,
     env = `profile.environment()` (see mapping below). No config file is written for the engine.
   - Spawn error → `sysproxy::disable_if_main()` + `Error { message, phase: "launching" }` + `Err(e)`.
   - `orphan::write_pid(&data_dir, session.pid())`.
   - Stores `session`, `user_requested_stop = false`, `epoch += 1`, refreshes secondary
     Tor/Psiphon statuses (un-probed) → may emit `aether://tor-status` / `aether://psiphon-status`.
   - Drains `log_rx` on a dedicated thread → `app.emit(LOG_EVENT, &log)` for every `LogEvent` (`mod.rs:235-242`).
   - Spawns `monitor_connect` thread (`mod.rs:244-250`).
4. **`monitor_connect`** (`mod.rs:339-493`) — poll loop every **400 ms** until
   `status::startup_timeout(&profile)` deadline; exits early if `user_requested_stop` or `epoch` changed:
   - `session.try_wait()` → engine died:
     - If `session.startup_failure_after_exit()` (classified by `pty_output::OutputDiagnostics`) matches → `Error { message, phase: "configuration" }`, clears pid, disables sysproxy, resets traffic, emits status and **returns without retry**.
     - Else → `handle_unexpected_failure(..., "Aether exited before connecting ({exit})", "connecting")`.
   - Re-probes secondary listeners via `status::secondary_tor_status(&profile, true)` /
     `secondary_psiphon_status(&profile, true)` unless already `enabled && ready` → emits `aether://tor-status` / `aether://psiphon-status` on change.
   - First time `session.prompts_done()` is true → state `Connecting`, emits status, and emits a log line `[gui] <startup_stage(profile)>`.
   - **Connected test**: `status::port_is_live(&httpproxy::engine_addr())` (defaults `127.0.0.1:1819`) →
     `httpproxy::set_target(&engine)`, state `Connected { socks_addr: engine, bridge_addr: profile.bind_address, connected_at_ms: now }`,
     `retry_count = 0`, emit `STATUS_EVENT`, **`profiles::save(&app, &profile)`** (persists last successful profile),
     and — when `capture_mode` is `Tun` or `Both` — `tun.activate(&engine, &profile, resource_dir)` (failure only logged `[tun] Failed to activate TUN: {e}`); then calls `monitor_connected` (same thread, no return).
   - Deadline exceeded → `session.kill()` → `handle_unexpected_failure(..., "Timed out waiting for Aether to find a working route", "connecting")`.
5. **`monitor_connected`** (`mod.rs:495-538`) — poll loop every **500 ms**:
   - Keeps refreshing secondary Tor/Psiphon statuses (emit-on-change).
   - `session.try_wait()` → `handle_unexpected_failure(..., "Lost connection unexpectedly ({exit})", "connected")`.
6. **`handle_unexpected_failure`** (`mod.rs:255-337`), the auto-retry engine:
   - Returns immediately if `user_requested_stop`.
   - If `connected_at` was set → `history::save(... success: false, duration_secs = (now-connected_at)/1000)` (protocol/scan_mode recorded lower-cased `Debug`).
   - Clears session, resets secondary statuses (emit), `retry_count += 1`, `orphan::clear_pid`.
   - Emits log `[gui] {failure_message}`.
   - `attempt > status::MAX_AUTO_RETRIES` (3) → `sysproxy::disable_if_main()`, `traffic::reset()`,
     `Error { message: "{failure_message} (gave up after 3 retries)", phase }` and stops.
   - Else emits `Reconnecting { attempt, max_attempts: 3 }`, sleeps `status::RETRY_BACKOFF[attempt-1]`
     (`2 s / 5 s / 10 s`) on a thread, re-checks `user_requested_stop`, `traffic::reset()`, emits `Launching`, and re-runs `spawn_and_monitor`.

### Disconnect

**`disconnect` command** (`commands.rs:31-34`) → `aether::request_disconnect` (`mod.rs:568-657`):
1. Deactivates TUN if active (failure logged `[tun] Failed to deactivate TUN: {e}`).
2. If state is `Idle`/`Error` and there is no session → `AetherError::NotConnected`.
3. If `connected_at` set → `history::save(... success: true, duration)`.
4. `user_requested_stop = true`, `retry_count = 0`, `session.send_ctrl_c()` (raw `0x03` to PTY).
5. No session → `traffic::reset()` + state `Idle`, return.
6. Else state `Disconnecting`; thread polls every **200 ms** until the child exits or
   `status::GRACEFUL_SHUTDOWN_GRACE` (3 s) elapses → `session.kill()`, clears session,
   resets secondary statuses, `orphan::clear_pid`, `sysproxy::disable_if_main()`,
   `traffic::reset()`, state `Idle`.

**App exit** (`lib.rs:228-237`, `RunEvent::Exit`) → `aether::shutdown_blocking(manager, data_dir, app)` (`mod.rs:659-681`): TUN deactivate (ignored error), `send_ctrl_c()`, `sleep(500 ms)`, `kill()`, clear session, `orphan::clear_pid`, `crate::sysproxy::disable()`.

### Log capture pipeline (PTY output → frontend events)

```
aether stdout/stderr ──pty master──▶ pty::read_loop (thread)
    read_loop: UTF-8 decode → drain_lines → strip_ansi
      • diagnostics.log_line(line) → mpsc::Sender<LogEvent {line, timestamp}>   (pty.rs:170-175)
      • prompt handling: PROMPT_TABLE header match → write answer + "\r\n"
        log line "[gui] answered {section} → {answer}"                          (pty.rs:164-202)
      • prompts_done AtomicBool set true on first non-empty line (pty.rs:163)
        and again when all PROMPT_TABLE entries answered (pty.rs:196-198)
      • trailing partial line flushed on EOF                                     (pty.rs:204-211)
mod.rs:235-242  for log in log_rx { app.emit("aether://log", log) }   (one drain thread)
```
Additionally mod.rs itself emits synthetic `LogEvent`s: `[gui] {failure_message}`,
`[gui] {startup_stage}`, `[gui] one-time code sent to Aether`, `[tun] Failed to …`.

### No config file for the engine

The engine receives **command-line arguments + environment variables only**
(`pty.rs:80-86`: `cmd.cwd(data_dir)`, `cmd.arg` for each `profile.as_args()`, `cmd.env` for
each `profile.environment()`). `mod.rs` never writes an engine config file. The only files
this layer touches under `<app-data>`:
- `<app-data>/aether.pid` (`orphan::write_pid` / `clear_pid`),
- the profile store file `profile.json` (tauri-plugin-store; key `last_successful_profile`)
  written by `profiles::save` on connect success and by the `set_default_profile` command —
  store files resolve under the app data dir (plugin default) [UNCERTAIN — plugin default path not verified in source],
- the engine binary tree `<app-data>/binaries/engine-2.1.0/` (owned by `engine`/`updater`).

## Key details

### Command table (how `commands.rs` calls into this module)

| Tauri command (`#[tauri::command]` fn) | what it does | args |
|---|---|---|
| `connect` (`commands.rs:18`) | async, `spawn_blocking` → `aether::start_connect` | `app`, `state`, `profile_override: Option<ConnectionProfile>` |
| `disconnect` (`commands.rs:32`) | `aether::request_disconnect(&app, &state.manager)` | `app`, `state` |
| `send_input` (`commands.rs:37`) | `aether::send_input` (one-time code line to engine PTY) | `app`, `state`, `line: String` |
| `get_status` (`commands.rs:42`) | `manager.status()` → `ConnectionState` | `state` |
| `get_default_profile` / `set_default_profile` (`commands.rs:47`, `:52`) | `aether::profiles::load` / `validate` + save | `app`, (`profile`) |
| `get_engine_info` (`commands.rs:289`) | `spawn_blocking(aether::engine::inspect)` → `EngineInfo` | `app` |
| `aether_binary_exists` (`commands.rs:281`) | `get_engine_info(...).map(compatible)` | `app` |
| `get_engine_tor_status` / `get_engine_psiphon_status` (`commands.rs:296`, `:301`) | `manager.tor_status()` / `psiphon_status()` | `state` |
| `download_aether` (`commands.rs:306`) | repair/install: guards `engine::INSTALLING` + requires `Idle`/`Error`, then `updater::download_aether_binary(&engine::install_dir(&app)?)`, then re-`inspect` | `app` |
| `get_diagnostics` (`commands.rs:224`) | reads redacted profile, history, `manager.status()` | `app`, `state` |

### Public API of `mod.rs`

```rust
pub struct AetherManager {            // mod.rs:28-37
    session: Option<PtySession>,       // portable-pty child + writer + prompts_done + diagnostics
    state: ConnectionState,
    user_requested_stop: bool,
    retry_count: u32,
    connected_at: Option<u64>,         // epoch millis
    tor_status: EngineTorStatus,
    psiphon_status: EnginePsiphonStatus,
    epoch: u64,                        // bumped per spawn; invalidates stale monitor threads
}
impl AetherManager { new(), status(), tor_status(), psiphon_status(),
                     update_tor_status(app,..) /* emit-on-change */,
                     update_psiphon_status(app,..) }

pub fn start_connect(app, manager, profile_override: Option<ConnectionProfile>) -> Result<(), AetherError>
pub fn send_input(app, manager, line: String) -> Result<(), AetherError>       // Err(NotConnected) if no session
pub fn request_disconnect(app, manager) -> Result<(), AetherError>             // Err(NotConnected) when Idle/Error + no session
pub fn shutdown_blocking(manager, data_dir: &Path, app)                         // called from RunEvent::Exit
// private: app_data_dir, set_state_and_emit, spawn_and_monitor,
//          handle_unexpected_failure, monitor_connect, monitor_connected
```
`mod.rs` has **no `#[cfg(test)]` block** (verified by grep) — zero tests of its own.

### `ConnectionState` (from `src-tauri/src/state.rs:9-26`, serde `tag = "state"`)

`Idle`, `Launching`, `Connecting`,
`Connected { socks_addr: String, bridge_addr: String, connected_at_ms: u64 }`,
`Reconnecting { attempt: u32, max_attempts: u32 }`, `Disconnecting`,
`Error { message: String, phase: String }`.

`AetherError` (`src-tauri/src/error.rs:4-19`, serializes to its display string):
`AlreadyRunning`, `EngineIncompatible(String)`, `SpawnFailed(String)`, `PortInUse(u16)`,
`NotConnected`, `ProxyConflict`, `Internal(String)`.

### Event names (verbatim, `src-tauri/src/events.rs:3-19`)

| constant | string | payload |
|---|---|---|
| `STATUS_EVENT` | `aether://status` | `ConnectionState` |
| `LOG_EVENT` | `aether://log` | `LogEvent { line: String, timestamp: u64 }` |
| `ENGINE_TOR_STATUS_EVENT` | `aether://tor-status` | `EngineTorStatus { enabled, ready, address: Option<String> }` |
| `ENGINE_PSIHON_STATUS_EVENT` | `aether://psiphon-status` | same shape (`type EnginePsiphonStatus = EngineTorStatus`) |
| `TRAFFIC_EVENT` | `aether://traffic` | traffic snapshot — emitted from `lib.rs` 1 s thread, not from this module |

Other constants for reference: `TOR_STATUS_EVENT = "ip-changer://status"`, `TOR_LOG_EVENT = "ip-changer://log"` (ip_changer slice).

### `status.rs` — the ground-truth "connected" check

- `pub const DEFAULT_SOCKS_ADDR: &str = "127.0.0.1:1819";`
- `parse_bind_address(addr)` → `addr.parse()`, any parse failure falls back to `DEFAULT_SOCKS_ADDR`.
- `probe_addr(listen)` → if the IP is unspecified (`0.0.0.0`/`::`) probe `127.0.0.1:<port>` instead.
- **`port_is_live(addr) -> bool`**: `TcpStream::connect_timeout(&probe_addr(addr), Duration::from_millis(300)).is_ok()`.
- `connect_timeout(scan_mode)`: Turbo 90 s, Balanced 150 s, Thorough 330 s, Verified 210 s, Ironclad 240 s.
- `startup_timeout(profile)`: `max(scan, tor_budget, psiphon_budget)` where
  `tor_budget = 600 + engine_tor_direct_secs.unwrap_or(60) + engine_tor_stall_secs.unwrap_or(120)` s
  (added to `scan` for `TorReverse`, used alone for `TorOnly`, `ZERO` for `Tor`/`Disabled`);
  `psiphon_budget = 300 s` (+ `scan` for `PsiphonReverse`, alone for `PsiphonOnly`, `ZERO` otherwise).
- **Listener discovery for secondary listeners** (only for *chained* modes):
  - `secondary_tor_address` — `Some` only when `engine_tor_mode == EngineTorMode::Tor`;
    value = trimmed non-empty `engine_tor_bind` else default **`127.0.0.1:1820`**.
  - `secondary_psiphon_address` — `Some` only when `engine_psiphon_mode == EnginePsiphonMode::Psiphon`;
    value = trimmed non-empty `engine_psiphon_bind` else default **`127.0.0.1:1821`**.
  - `secondary_tor_status` / `secondary_psiphon_status(profile, probe)` →
    `EngineTorStatus { enabled: true, ready: probe && port_is_live(live_addr), address: Some(probe_addr(addr)) }`,
    where `live_addr = httpproxy::engine_tor_addr()/engine_psiphon_addr().unwrap_or(addr)`; otherwise `Default` (`enabled: false`).
    Reverse modes get their door address from `httpproxy` in `start_connect` instead (`mod.rs:120-139`).
- `startup_stage(profile)` returns one of five exact UI strings, e.g.
  `"Waiting for Psiphon to hand a working route (can take a few minutes)"`,
  `"Waiting for native Tor bootstrap and the primary SOCKS listener (bridge fallback can take several minutes)"`,
  `"Waiting for Aether's primary SOCKS listener"`, … (see `status.rs:111-132`).
- Constants: `GRACEFUL_SHUTDOWN_GRACE = 3 s`, `MAX_AUTO_RETRIES = 3`,
  `RETRY_BACKOFF = [2 s, 5 s, 10 s]`.

**Polling cadence**: 400 ms while `Launching/Connecting` (`monitor_connect`), 500 ms while
`Connected` (`monitor_connected`), 200 ms while `Disconnecting` (thread in `request_disconnect`),
1000 ms for the traffic event thread (`lib.rs`). Plus one-shot 300 ms TCP probes inside each tick.

**What `port_is_live` does NOT verify (precisely):**
- It is a bare TCP connect; no SOCKS5/HTTP handshake, no request is sent — any process
  accepting TCP on that port counts as "connected" (including an unrelated local server).
- It proves only that *a listener* exists — not that traffic can reach the internet, not
  that the upstream/proxy chain works, not that the engine is still the process listening.
- It probes the address actually checked by `monitor_connect`, `httpproxy::engine_addr()`
  (GUI→engine listener, static default `127.0.0.1:1819`, `httpproxy.rs:19,41-46`) — **not**
  `profile.bind_address` directly; `profile.bind_address` (default `127.0.0.1:1819`,
  `profiles.rs:365-367`) is the publicly advertised bridge and is only used for
  `route_connect` reservation and the `Connected.bridge_addr` field.
- Failures are indistinguishable: connection refused, filtered port, and timeout all yield `false`.
- Secondary status (`ready`) has the same limitation; it also never checks that the secondary
  listener belongs to the engine.

### `engine.rs` — engine resolution

**Constants / paths**
- Pinned version: `engine::expected_version()` → `crate::updater::expected_version()` →
  `updater::engine_release().version` parsed at runtime from `include_str!("../aether-release.json")`
  → **`"2.1.0"`** (`src-tauri/aether-release.json`, repo `CluvexStudio/Aether`, 5 assets
  `windows-x86_64`, `linux-x86_64`, `linux-aarch64`, `macos-x86_64`, `macos-aarch64`, each with `name` + `sha256`).
- `install_dir(app)` = `<app-data>/binaries/engine-<expected_version>` →
  `<app-data>/binaries/engine-2.1.0` (`engine.rs:27-35`).
- `binary_name()` = `aether.exe` (Windows) / `aether`.
- `transport_path(binary)` = `<engine-dir>/pt/lyrebird.exe|lyrebird` (Tor pluggable transport companion).
- `INSTALLING: Mutex<bool>` — global repair guard checked by `start_connect` and set by
  the `download_aether` command (with a `Drop` guard that resets it, `commands.rs:324-330`).

**Candidate priority** (`inspect`, `engine.rs:189-224`; first *compatible* wins):
1. `downloaded` — `<install_dir>/<binary>` = `<app-data>/binaries/engine-2.1.0/aether[.exe]`
2. `bundled` — `<resource_dir>/binaries/engine/aether[.exe]`
3. `legacy bundle` — `<resource_dir>/binaries/aether[.exe]`
4. `development` — `$CARGO_MANIFEST_DIR/binaries/engine/aether[.exe]` (debug builds only, `#[cfg(debug_assertions)]`)
5. `legacy download` — `<app-data>/binaries/aether[.exe]`
   Android only: `bundled` from `<resource_dir>/binaries/android[/x86_64|/armv7|/unsupported]/aether` by `std::env::consts::ARCH`.

**Version check (`probe_version`, `engine.rs:95-141`)**: spawns `<path> --version` with
stdin null, stdout piped, stderr null, Windows `creation_flags(0x08000000)`
(`CREATE_NO_WINDOW`); reads up to 4096 bytes on a thread; 3 s deadline polling `try_wait`
every 25 ms (kills on timeout); requires exit success; result parsed by `parse_version`,
which needs a line whose first word is `aether` (case-insensitive) followed by a
`major.minor.patch` of exactly 3 all-digit components, `v` prefix stripped →
`"aether 2.0.0" → "2.0.0"`, `"Aether v1.9.0" → "1.9.0"`, anything else → `None`.

**`inspect_candidates` verdict**: for each existing file, `version` + `transports_available`
(`executable_file`: regular file; on unix also `mode & 0o111 != 0`) → `problem` is
`"Found Aether {v}; this GUI requires Aether {expected}"` | probe error |
`"The bundled Tor transport (pt/lyrebird) is missing or not executable"` | `None`.
Returns the first compatible candidate, else the *first* failure, else
`{ version: None, path: None, source: None, problem: "Aether binary not found" }`.

`EngineInfo` (`engine.rs:16-25`): `version: Option<String>`, `expected_version: String`,
`path: Option<String>`, `source: Option<String>` (`downloaded|bundled|legacy bundle|development|legacy download`),
`compatible: bool`, `transports_available: bool`, `problem: Option<String>`.

`resolve(app)` → `Ok(path)` if `compatible`, else `AetherError::EngineIncompatible("{problem}. Install/repair Aether {expected}.")`.

**Repair / backup behavior** (implemented in `src-tauri/src/updater.rs`, gated by this
module's `INSTALLING` and entered through the `download_aether` command):
`download_aether_binary(dest_dir = engine::install_dir())` picks the asset for
`{os}-{arch}`, downloads, `verify_checksum` (sha256), `check_architecture` (e.g. `MZ`),
then `install_archive` (`updater.rs:372-442`):
- lock file `<engine-dir>/.aether[.exe].install-lock` created with `create_new(true)`
  (second repair → `"Engine repair already running or lock unavailable: …"`),
- payload extracted into stage dir `.<name>.stage-<pid>-<nonce>`,
- existing real directory renamed to `.<name>.backup-<pid>-<nonce>`
  (`"Cannot preserve existing engine (stop it before repair): …"`),
- stage renamed onto `dest`; on failure the backup is rolled back (else reported with its path),
- lock/stage removed on drop. The `download_aether` command then re-runs `get_engine_info`
  and errors `EngineIncompatible` if still incompatible.

### `orphan.rs` — startup reaping

- PID file: `<app-data>/aether.pid` (`pid_file`, `orphan.rs:4-6`) — written on every spawn
  (`mod.rs:224`) and removed on disconnect/failure (`clear_pid`).
- `reap_orphan(data_dir)`: read file → parse `u32` → if `is_alive(pid)` then `kill_pid(pid)` →
  always delete the pid file. No process-name/image verification: it trusts the recorded PID
  (a recycled PID belonging to another process could be killed) — PID-reuse risk exists as written.
- Unix: `is_alive` = `kill -0 <pid>` success; `kill_pid` = `kill -9 <pid>` (spawns `/bin/kill`).
- Windows: `is_alive` = hidden `tasklist /FI "PID eq <pid>"` output contains the PID string;
  `kill_pid` = hidden `taskkill /PID <pid> /F` (`crate::childproc::hidden` suppresses the console window).
- Called from `lib.rs:40` during `setup`; the TUN adapter's equivalent is
  `tun::cleanup::reap_orphan_tun(&data_dir)` (`lib.rs:42`, Windows only) reading
  `TUN_STATE_FILE` in the **same** app-data dir — i.e. both reapers share `data_dir`.
- `orphan.rs` has **no tests**.

### `prompts.rs` — interactive prompts

`PromptRule { id: &'static str, header_matches: fn(&str) -> bool, answer: fn(&ConnectionProfile) -> String }`;
`PROMPT_TABLE` (static, `prompts.rs:9-30`):

| id | header matched (line `trim_end().ends_with`) | answer |
|---|---|---|
| `protocol` | `Protocol:` | `profile.protocol.as_menu_choice()` → `Auto`/`Masque`→`"1"`, `Wireguard`→`"2"`, `Gool`→`"3"` |
| `scan_mode` | `Scan mode:` | `scan_mode.as_menu_choice()` → Turbo`"1"`, Balanced`"2"`, Thorough`"3"`, Verified`"4"`, Ironclad`"5"` |
| `ip_version` | `IP version to scan:` | `ip_version.as_menu_choice()` → V4`"1"`, V6`"2"`, Both`"3"` |
| `masque_transport` | `MASQUE transport:` | `if p.masque_http2 { "2" } else { "1" }` |

`looks_like_choice_prompt(line)` = `line.trim_end().ends_with(':')` (used by `pty::read_loop`
to detect the numeric sub-prompt line).

Answering mechanics (`pty.rs:137-212`, slice 09 owns the file): a header line selects
`current_section`; the next line ending in `:` that is *not* another header triggers
writing `answer + "\r\n"` to the PTY (once per section, tracked in `answered`), logging
`[gui] answered {section} → {answer}`. `prompts_done` flips true on the **first non-empty
output line** and again when all four rules are answered — `monitor_connect` uses it only
to move `Launching → Connecting` early and to print `startup_stage`. The **one-time code**
prompt is *not* in the table: it is answered manually by the user via the `send_input`
command (`aether::send_input`), which logs `[gui] one-time code sent to Aether`.
`prompts.rs` has **no tests**.

### Protocol/mode → CLI args and env (the "config" handed to the binary)

Built by `ConnectionProfile::as_args()` (`profiles.rs:386-655`) and
`ConnectionProfile::environment()` (`profiles.rs:657-713`); consumed in `pty.rs:80-86`.
Detail lives in slice 09 (`profiles.rs`); the mapping as seen from this module:

- Protocol: `Auto` → no flag, `Masque` → `--masque`, `Wireguard` → `--wg`, `Gool` → `--gool`.
- Scan mode: `--turbo` / `--balanced` / `--thorough` / `--verified` / `--ironclad`.
- IP version: `-4` / `-6` / `--dual`; quick reconnect: `--quick-reconnect` / `--no-quick-reconnect`;
  always `--noize` plus `--<noize>` (`masque_noize` for Auto/Masque, `wg_noize` for WG/Gool).
- Listeners/proxy: `--bind <addr>` (only when ≠ default `127.0.0.1:1819` and parseable),
  `--upstream <url>`, `--dns`, `--route-block`, `--route-direct`.
- Engine Tor mode flag: `Disabled`→none, `Tor`→`--tor`, `TorReverse`→`--tor-reverse`, `TorOnly`→`--tor-only`
  (+ `--tor-bind`, `--tor-dir`, repeated `--tor-bridge`, `--tor-bridges`, `--no-tor-bridges`,
  `--tor-pt`, `--tor-pt-dir`, `--tor-relays`, `--tor-relay-ports`, `--tor-bridge-file`).
- Engine Psiphon mode flag: `Disabled`→none, `Psiphon`→`--psiphon`, `PsiphonReverse`→`--psiphon-reverse`,
  `PsiphonOnly`→`--psiphon-only` (+ `--psiphon-bind`, `--psiphon-mode`, `--psiphon-region`).
- Others: `--wiw-peers` (Gool only), `--log-level`, `--perf`, `--team`, `--access-id/-secret/-email/-token`,
  `--gateway`, `--mim` + `--mim-peers` (Auto/Masque), conditional `--no-quic-v2`, `--exit-loc`,
  `--exit-loc-secs`, `--stats`, `--stats-secs`, `--mark` (Linux/Android only).
- Env: `AETHER_MASQUE_HTTP2`, `AETHER_ROUTE_SNIFF`, `AETHER_ROUTE_SNIFF_MS`, `AETHER_REPROVISION`,
  `AETHER_QUIC_V2`, `AETHER_MARK`, `AETHER_MAX_CLIENTS`, `AETHER_HALF_CLOSE_SECS`,
  `AETHER_TCP_KEEPALIVE_SECS`, `AETHER_TCP_CONNECT_SECS`, `AETHER_TOR_COUNTRY`,
  `AETHER_TOR_DIRECT_SECS`, `AETHER_TOR_STALL_SECS`.

### Tests present in this slice

`mod.rs`, `orphan.rs`, `prompts.rs`: **none**.

`status.rs` (`mod tests`, 11 tests):
- `parse_valid_and_invalid` — `parse_bind_address` accepts `127.0.0.1:1919` / `0.0.0.0:1819` / `0.0.0.0:9999`, falls back to `DEFAULT_SOCKS_ADDR` for `"127.0.0.1:"` and `"not-an-addr"`.
- `probe_addr_rewrites_unspecified` — `0.0.0.0:1919` → `127.0.0.1:1919`; loopback unchanged.
- `port_is_live_detects_listener` — live for a real `TcpListener`, false for `127.0.0.1:0`.
- `port_is_live_probes_loopback_when_bound_any` — probing `0.0.0.0:<port>` hits `127.0.0.1:<port>`.
- `connect_timeout_exceeds_upstream_scan_deadlines` — Turbo >45 s, Balanced >120 s, Thorough >300 s, Verified >180 s, Ironclad >180 s.
- `startup_timeout_is_mode_aware` — `Disabled`/`Tor` == scan base; `TorOnly` > base; `TorReverse` > `TorOnly`; same shape for Psiphon modes.
- `secondary_psiphon_is_chain_only` — address only for `Psiphon` mode, default `127.0.0.1:1821`.
- `tor_tuning_extends_budget` — raising `engine_tor_direct_secs`/`stall_secs` grows `startup_timeout`.
- `secondary_endpoint_is_chain_only` — Tor address only for `Tor` mode, default `127.0.0.1:1820`.
- `secondary_endpoint_honors_bind_and_disables` — custom `127.0.0.1:1830` honored, whitespace falls back to `1820`, `Disabled` → default status.
- `secondary_status_reports_live_listener` — live listener → `enabled && ready`, `address` is `host:port`; `probe=false` → `enabled && !ready`.

`engine.rs` (`mod tests`, 3 tests):
- `version_parser_requires_engine_and_complete_version` — `parse_version` accepts `"aether 2.0.0\r\n"`/`"Aether v1.9.0"`, rejects `"2.0.0"`, `"aether 2"`, `"other 2.0.0"`, `"aether 2.x.0"`.
- `fetched_engine_is_selected_over_legacy_bundle` — `#[ignore]`, `#[cfg(windows)]`: fetched engine preferred over legacy bundle in both orders; asserts `compatible`, `version == expected_version()`, `source == "downloaded"`, `transports_available`.
- `missing_candidates_are_incompatible` — empty candidate list → `!compatible`, `problem == "Aether binary not found"`.

(Related but outside this slice: `updater.rs` `pinned_manifest_and_platforms` asserts
`expected_version() == "2.1.0"` and 5 assets; `repair_preserves_previous_directory`;
`pty.rs` line-splitting tests — slice 09.)

### Platform quirks

- Android: `pty` module is swapped to `pty_android.rs` (`mod.rs:5-9`); `monitor_connect`'s
  `startup_failure_after_exit` branch is `#[cfg(not(target_os = "android"))]` (`mod.rs:359`);
  `engine::inspect` has a separate Android candidate list and `download_aether_binary`
  returns `"Aether is bundled in the APK on Android"`.
- Windows: `CREATE_NO_WINDOW` (`0x08000000`) for `--version` probes; orphan reaping via
  `tasklist`/`taskkill` through `childproc::hidden`; TUN reap only on Windows;
  binary `aether.exe`, transport `pt\lyrebird.exe`.
- Unix: `is_alive`/`kill_pid` shell out to `kill -0` / `kill -9`; executable check honors
  `mode & 0o111`.
- `app_data_dir()` silently falls back to `std::env::temp_dir()` if the Tauri path API fails
  (`mod.rs:80-84`) — pid files etc. would then land in temp.

## Links to other sections

- **Slice 09 (profiles / pty)** — `profiles::{ConnectionProfile, load, save, validate,
  as_args, environment, EngineTorMode, EnginePsiphonMode, CaptureMode, ScanMode}`,
  `pty::{spawn, PtySession}` (`pid`, `try_wait`, `kill`, `send_line`, `send_ctrl_c`,
  `prompts_done`, `startup_failure_after_exit`), `pty_output::StartupFailure`
  (classification strings surfaced as `Error { phase: "configuration" }`). This module is
  their only consumer for connect/disconnect.
- **BackendProxyNet (`httpproxy.rs`)** — `route_connect`, `claim`, `claim_psiphon_door`,
  `reserve_engine_psiphon/tor`, `engine_addr` (default `127.0.0.1:1819`), `set_target`.
  `start_connect` fails with `PortInUse` whenever these reject; `monitor_connect` probes
  `engine_addr()`, so proxy-bridge lifecycle directly defines "connected".
- **BackendTunIpChanger (`tun/`, `ip_changer.rs`)** — `tun.activate/deactivate` called from
  `monitor_connect` (on `CaptureMode::Tun|Both`) and `request_disconnect`/`shutdown_blocking`;
  `tun::cleanup::reap_orphan_tun` runs next to `orphan::reap_orphan` at startup;
  `ip_changer::shutdown_blocking` runs beside `aether::shutdown_blocking` on exit.
- **BuildPackaging / updater (`updater.rs`, `aether-release.json`)** — pinned version
  `2.1.0`, download+sha256+backup/rollback repair, entered via `download_aether` command
  and guarded by `engine::INSTALLING`.
- **Frontend sections** — consume `aether://status`, `aether://log`, `aether://tor-status`,
  `aether://psiphon-status`, `aether://traffic`; invoke `connect`, `disconnect`,
  `send_input`, `get_status`, `get_engine_info`, `get_engine_tor_status`,
  `get_engine_psiphon_status`, `download_aether`.
- **Lifecycle (`lib.rs`)** — startup reap + `httpproxy::start`; `RunEvent::Exit` →
  `aether::shutdown_blocking`; 1 s traffic emitter keyed off `ConnectionState::Connected`.
- **History/diagnostics (`history.rs`, `commands.rs::get_diagnostics`)** — connection
  entries written on failure/disconnect from `handle_unexpected_failure` / `request_disconnect`.
