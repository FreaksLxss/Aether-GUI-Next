# Slice 09 — Profiles & PTY

The config model (`ConnectionProfile`) and everything that turns it into an `aether` child process: CLI args, env vars, PTY spawn, output parsing, log-event emission.

## File inventory

Assigned files (all read in full):

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/aether/profiles.rs` | 57.3 KB / 1721 lines | `ConnectionProfile` struct + all enums, `as_args()` (profile → CLI flags), `environment()` (profile → env vars), `validate()`, `load()`/`save()` (store `profile.json`), 38 unit tests |
| `src-tauri/src/aether/pty.rs` | 8.1 KB / 267 lines | Desktop PTY session via `portable-pty`: spawn, reader thread, interactive prompt auto-answering, `PtySession` API (`send_line`/`send_ctrl_c`/`kill`), 5 tests |
| `src-tauri/src/aether/pty_output.rs` | 10 KB / 320 lines | Line buffering (`drain_lines`/`finish_lines`), `MAX_PARTIAL` cap, `strip_ansi`, `StartupFailure` classifier + `OutputDiagnostics`, 11 tests |
| `src-tauri/src/aether/pty_android.rs` | 3.4 KB / 125 lines | Android replacement for `pty.rs` (plain stdin/stdout pipes, no PTY, no prompt answering), 0 tests |

Cross-cutting files read for this report (not owned by this slice):

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/aether/prompts.rs` | 34 lines | `PROMPT_TABLE`: the 4 interactive aether menu prompts the PTY reader auto-answers from the profile |
| `src-tauri/src/aether/mod.rs` | 681 lines | `start_connect` / `spawn_and_monitor` / `monitor_connect` / `send_input` / `request_disconnect`: glue between profile, PTY and events (read: 95–260, 339–660 + declaration listing) |
| `src-tauri/src/presets.rs` | 66 lines | `ProfilePreset { name, profile, created_at }`, store `presets.json`, `MAX_PRESETS = 10` |
| `src-tauri/src/commands.rs` | 434 lines | Tauri IPC commands; the ones touching profiles listed below |
| `src-tauri/src/events.rs` | ~25 lines | `LogEvent { line, timestamp }` + event-name constants |
| `src-tauri/src/lib.rs` | ~250 lines | `invoke_handler` command registration list (read: handler list only) |
| `src-tauri/Cargo.toml` | — | `portable-pty = "0.8"` is a `cfg(not(target_os = "android"))` dependency (line 34–35) |
| `src/state/connectionStore.ts`, `src/log-window.ts`, `src/components/SettingsIO.tsx`, `src/components/ProfilePresets.tsx`, `src/components/ZeroTrustPanel.tsx` | — | frontend callers/listeners (grep-level, naming only) |

## Architecture / data flow

```
frontend (zod-validated ConnectionProfile)
   │  invoke("set_default_profile") / "connect" {profileOverride}
   ▼
commands.rs ── profiles::validate() ── profiles::save() ── store profile.json
   │            key "last_successful_profile"
   ▼
aether::start_connect()                    (mod.rs:95)
   profile = profile_override.unwrap_or(profiles::load())
   profiles::validate(&profile)            → Err = AetherError::Internal(msg)
   httpproxy::route_connect(...)           → allocates engine listener ports
   ▼
spawn_and_monitor()                        (mod.rs:192)
   engine_profile = profile.clone()
   engine_profile.bind_address     = httpproxy::engine_addr()        // engine gets its own port
   engine_profile.engine_tor_bind    = httpproxy::engine_tor_addr()   // if reverse-tor reserved
   engine_profile.engine_psiphon_bind= httpproxy::engine_psiphon_addr()
   pty::spawn(&binary, &data_dir, engine_profile, log_tx)
   ▼
pty::spawn (pty.rs:63) / pty_android::spawn (pty_android.rs:51)
   args  = profile.as_args()          → CommandBuilder::arg(...)      ← CLI flags
   env   = profile.environment()      → CommandBuilder::env(...)      ← AETHER_* vars
   env_remove(PROXY_ENV_KEYS) ; NO_PROXY/no_proxy = "localhost,127.0.0.1,::1"
   cwd   = data_dir (app_data_dir), binary = engine::resolve()
   reader thread → read_loop → drain_lines → strip_ansi →
       OutputDiagnostics::log_line() → log_tx.send(LogEvent{line, timestamp})
   ▼
spawn_and_monitor forwards:  for log in log_rx { app.emit("aether://log", &log) }   (mod.rs:237-241)
   ▼
frontend listeners:  src/state/connectionStore.ts  listen<LogLine>("aether://log")  (batched, 100 ms flush)
                     src/log-window.ts             await listen<LogLine>("aether://log")  (log window, MAX_LINES cap)
```

Interactive input path (reverse direction): `invoke("send_input", {line})` → `aether::send_input` → `PtySession::send_line` (writes `line + "\r\n"` to PTY master) → emits `LogEvent "[gui] one-time code sent to Aether"`. Disconnect: `request_disconnect` → `session.send_ctrl_c()` (writes byte `0x03`), then a 200 ms poll loop waits `status::GRACEFUL_SHUTDOWN_GRACE` before `session.kill()`.

Menu auto-answer path (desktop only): `read_loop` matches header lines against `prompts.rs::PROMPT_TABLE` (`"Protocol:"`, `"Scan mode:"`, `"IP version to scan:"`, `"MASQUE transport:"`); when a later partial line ends with `:` it writes `(rule.answer)(&profile)` (e.g. `"1"`) to the PTY and logs `"[gui] answered {section} → {answer}"`.

## Key details

### 1. `ConnectionProfile` — the only profile struct

`src-tauri/src/aether/profiles.rs:234-351`, `#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]`. Stored as JSON in Tauri store file **`profile.json`**, key **`last_successful_profile`** (`STORE_FILE`/`STORE_KEY`, lines 796–797). `load()` falls back to `ConnectionProfile::default()` on any error.

Field table — GUI field → type → default → CLI flag / env var emitted by `as_args()` / `environment()`:

| field | type | default (serde default unless marked) | emitted as |
|---|---|---|---|
| `protocol` | `Protocol` (required) | `Auto` | `Auto`→nothing; `Masque`→`--masque`; `Wireguard`→`--wg`; `Gool`→`--gool`. Menu choice (prompts): `1`/`1`/`2`/`3` |
| `scan_mode` | `ScanMode` (required) | `Turbo` | `--turbo` / `--balanced` / `--thorough` / `--verified` / `--ironclad` (menu `1`–`5`) |
| `ip_version` | `IpVersion` (required) | `V4` | `-4` / `-6` / `--dual` (menu `1`/`2`/`3`) |
| `quick_reconnect` | `bool` | `true` (`default_true`) | `--quick-reconnect` or `--no-quick-reconnect` (always one) |
| `masque_http2` | `bool` | `false` | env `AETHER_MASQUE_HTTP2` = `1`/`0` (always); prompt answer `2`/`1`; suppresses `--no-quic-v2` |
| `masque_noize` | `MasqueNoize` | `Firewall` | value of `--noize` when protocol is Auto/Masque: `firewall`/`gfw`/`light`/`off` |
| `wg_noize` | `WgNoize` | `Balanced` | value of `--noize` when protocol is Wireguard/Gool: `balanced`/`aggressive`/`light`/`off` |
| `bind_address` | `String` | `"127.0.0.1:1819"` | `--bind <addr>` **only if** trimmed value ≠ default AND parses as `SocketAddr`. At spawn time `mod.rs:201` overwrites it with `httpproxy::engine_addr()` before `as_args()`, so the engine actually binds the httpproxy-allocated port; the profile value is the GUI-facing bridge |
| `http_proxy_address` | `Option<String>` | `None` | **never** passed to engine (GUI's own `httpproxy` claims it); validated as a listener only |
| `upstream_proxy` | `Option<String>` | `None` | `--upstream <trimmed>` if non-empty |
| `wiw_peers` | `Option<String>` | `None` | `--wiw-peers <a,b>` **only** when `protocol == Gool`, after `peer_list()` validation (normalized, invalid → silently dropped) |
| `log_level` | `Option<LogLevel>` | `None` | `--log-level error\|warn\|info\|debug\|trace` |
| `perf` | `Option<PerfLevel>` | `None` | `--perf low\|medium\|high` |
| `capture_mode` | `CaptureMode` | `Proxy` | no CLI flag; drives TUN activation (`mod.rs:448-469`) and whether `tun_*` fields are validated |
| `dns_mode` | `DnsMode` | `Forward` | no CLI flag; consumed by `tun/forwarder.rs` (`DnsMode::Forward`/`Direct`) |
| `tun_address` | `String` | `"10.0.0.2/24"` | no CLI flag; TUN; validated only when `capture_mode != Proxy` |
| `tun_dns` | `String` | `"8.8.8.8"` | no CLI flag; TUN |
| `dns_servers` | `Option<String>` | `None` | `--dns <trimmed>` if non-empty |
| `route_block` | `Vec<String>` | `[]` | `--route-block a,b` (joined with `,`) if non-empty |
| `route_direct` | `Vec<String>` | `[]` | `--route-direct a,b` if non-empty |
| `route_sniff` | `bool` | `true` | env `AETHER_ROUTE_SNIFF=0` only when `false` |
| `route_sniff_ms` | `Option<u32>` | `None` | env `AETHER_ROUTE_SNIFF_MS=<n>` |
| `auto_reprovision` | `bool` | `true` | env `AETHER_REPROVISION=0` only when `false` |
| `zt_team` | `Option<String>` | `None` | `--team <trimmed>` |
| `zt_access_email` | `Option<String>` | `None` | `--access-email <trimmed>` |
| `zt_access_id` | `Option<String>` | `None` | `--access-id <trimmed>` |
| `zt_access_secret` | `Option<String>` | `None` | `--access-secret <trimmed>` (redacted to `None` in `get_diagnostics`) |
| `zt_access_token` | `Option<String>` | `None` | `--access-token <trimmed>` (redacted in `get_diagnostics`) |
| `zt_gateway` | `bool` | `false` | `--gateway` (valueless) |
| `mim` | `bool` | `false` | `--mim` only when protocol is `Auto`\|`Masque` |
| `mim_peers` | `Option<String>` | `None` | `--mim-peers auto` or `--mim-peers <a,b>` (validated/normalized) when `mim` and protocol Auto/Masque |
| `quic_v2` | `bool` | `true` | env `AETHER_QUIC_V2=0` when `false`; also `--no-quic-v2` when `!quic_v2 && !masque_http2 && protocol∈{Auto,Masque} && engine_tor_mode∉{TorReverse,TorOnly} && engine_psiphon_mode∉{PsiphonReverse,PsiphonOnly}` |
| `fw_mark` | `Option<String>` | `None` | env `AETHER_MARK=<trimmed>` (all platforms); `--mark <validated>` only on `cfg(linux/android)` |
| `engine_tor_mode` | `EngineTorMode` | `Disabled` | `--tor` / `--tor-reverse` / `--tor-only` |
| `engine_tor_bind` | `Option<String>` | `None` | `--tor-bind <addr>` when mode ≠ `TorOnly` and value parses; `validate()` defaults it to `127.0.0.1:1820` for collision checks |
| `engine_tor_dir` | `Option<String>` | `None` | `--tor-dir <trimmed>` |
| `engine_tor_bridges` | `Vec<String>` | `[]` | one `--tor-bridge <line>` per non-empty trimmed entry |
| `engine_tor_force_bridges` | `bool` | `false` | `--tor-bridges` (valueless) |
| `engine_tor_bridges_file` | `Option<String>` | `None` | `--tor-bridge-file <trimmed>` |
| `engine_tor_no_bridges` | `bool` | `false` | `--no-tor-bridges` |
| `engine_tor_pt` | `Option<String>` | `None` | `--tor-pt <trimmed>` |
| `engine_tor_pt_dir` | `Option<String>` | `None` | `--tor-pt-dir <trimmed>` |
| `engine_tor_country` | `Option<String>` | `None` | env `AETHER_TOR_COUNTRY=<trimmed>` when mode ≠ `Disabled`; must be 2 ASCII letters |
| `engine_tor_direct_secs` | `Option<u32>` | `None` | env `AETHER_TOR_DIRECT_SECS=<n>` when mode ≠ `Disabled` |
| `engine_tor_stall_secs` | `Option<u32>` | `None` | env `AETHER_TOR_STALL_SECS=<n>` when mode ≠ `Disabled` |
| `engine_tor_relays` | `Option<String>` | `None` | `--tor-relays auto\|only\|off\|<u32>` (lowercased) |
| `engine_tor_relay_ports` | `Option<String>` | `None` | `--tor-relay-ports web\|any` |
| `engine_psiphon_mode` | `EnginePsiphonMode` | `Disabled` | `--psiphon` / `--psiphon-reverse` / `--psiphon-only` |
| `engine_psiphon_bind` | `Option<String>` | `None` | `--psiphon-bind <addr>` when mode ≠ `PsiphonOnly` and parses; `validate()` defaults it to `127.0.0.1:1821` |
| `psiphon_shape` | `PsiphonShape` | `Auto` | inside psiphon block: `--psiphon-mode cdn\|direct` only when ≠ `Auto` |
| `psiphon_region` | `Option<String>` | `None` | `--psiphon-region <trimmed>`; 2 ASCII letters |
| `exit_loc` | `Option<String>` | `None` | `--exit-loc <trimmed>` only if `exit_loc_tokens_ok` |
| `exit_loc_secs` | `Option<u32>` | `None` | `--exit-loc-secs <n>` (only emitted together with `--exit-loc`) |
| `stats` | `bool` | `false` | `--stats` |
| `stats_secs` | `Option<u32>` | `None` | `--stats-secs <n>` (with `--stats`) |
| `max_clients` | `Option<u32>` | `None` | env `AETHER_MAX_CLIENTS=<n>` |
| `half_close_secs` | `Option<u32>` | `None` | env `AETHER_HALF_CLOSE_SECS=<n>` |
| `tcp_keepalive_secs` | `Option<u32>` | `None` | env `AETHER_TCP_KEEPALIVE_SECS=<n>` |
| `tcp_connect_secs` | `Option<u32>` | `None` | env `AETHER_TCP_CONNECT_SECS=<n>` |

Default helper functions (lines 353–383): `default_true`, `default_masque_noize` → `Firewall`, `default_wg_noize` → `Balanced`, `default_bind_address` → `"127.0.0.1:1819"`, `default_capture_mode` → `Proxy`, `default_dns_mode` → `Forward`, `default_tun_address` → `"10.0.0.2/24"`, `default_tun_dns` → `"8.8.8.8"`.

### 2. Enums (verbatim variant + serde spellings)

| enum (serde rename) | variants → serialized name |
|---|---|
| `CaptureMode` (`snake_case`) | `Proxy`→`"proxy"`, `Tun`→`"tun"`, `Both`→`"both"` |
| `DnsMode` (`snake_case`) | `Forward`→`"forward"`, `Direct`→`"direct"` |
| `Protocol` (`lowercase`) | `Auto`→`"auto"`, `Masque`→`"masque"`, `Wireguard`→`"wireguard"`, `Gool`→`"gool"` |
| `ScanMode` (`lowercase`) | `Turbo`→`"turbo"`, `Balanced`→`"balanced"`, `Thorough`→`"thorough"`, `Verified`→`"verified"` (alias `stealth`), `Ironclad`→`"ironclad"` |
| `IpVersion` (`lowercase`) | `V4`→`"v4"`, `V6`→`"v6"`, `Both`→`"both"` |
| `MasqueNoize` (`lowercase`) | `Firewall`, `Gfw`, `Light`, `Off` |
| `WgNoize` (`lowercase`) | `Balanced`, `Aggressive`, `Light`, `Off` |
| `LogLevel` (`lowercase`) | `Error`, `Warn`, `Info`, `Debug`, `Trace` |
| `PerfLevel` (`lowercase`) | `Low`, `Medium`, `High` |
| `EngineTorMode` (`snake_case`, `Default = Disabled`) | `Disabled`→`"disabled"`, `Tor`→`"tor"`, `TorReverse`→`"tor-reverse"` (alias `tor_reverse`), `TorOnly`→`"tor-only"` (alias `tor_only`) → flags `--tor`, `--tor-reverse`, `--tor-only` |
| `EnginePsiphonMode` (`snake_case`, `Default = Disabled`) | `Disabled`, `Psiphon`→`"psiphon"`, `PsiphonReverse`→`"psiphon-reverse"` (alias `psiphon_reverse`), `PsiphonOnly`→`"psiphon-only"` (alias `psiphon_only`) → flags `--psiphon`, `--psiphon-reverse`, `--psiphon-only` |
| `PsiphonShape` (`lowercase`, `Default = Auto`) | `Auto`→`"auto"`, `Cdn`→`"cdn"`, `Direct`→`"direct"` |

Protocol/mode variants supported (exact spellings the frontend can persist): engine Tor = `disabled` / `tor` / `tor-reverse` / `tor-only`; engine Psiphon = `disabled` / `psiphon` / `psiphon-reverse` / `psiphon-only`.

### 3. Exact aether CLI flags the GUI can pass

`--masque`, `--wg`, `--gool`, `--turbo`, `--balanced`, `--thorough`, `--verified`, `--ironclad`, `-4`, `-6`, `--dual`, `--quick-reconnect`, `--no-quick-reconnect`, `--noize <v>`, `--bind <addr>`, `--upstream <url>`, `--wiw-peers <a,b>`, `--log-level <v>`, `--perf <v>`, `--dns <v>`, `--route-block <a,b>`, `--route-direct <a,b>`, `--team`, `--access-id`, `--access-secret`, `--access-email`, `--access-token`, `--gateway`, `--mim`, `--mim-peers <v>`, `--no-quic-v2`, `--exit-loc <v>`, `--exit-loc-secs <n>`, `--stats`, `--stats-secs <n>`, `--mark <v>` (linux/android only), `--tor`, `--tor-reverse`, `--tor-only`, `--tor-bind`, `--tor-dir`, `--tor-bridge <line>` (repeatable), `--tor-bridges`, `--no-tor-bridges`, `--tor-pt`, `--tor-pt-dir`, `--tor-relays <v>`, `--tor-relay-ports <web|any>`, `--tor-bridge-file`, `--psiphon`, `--psiphon-reverse`, `--psiphon-only`, `--psiphon-bind`, `--psiphon-mode <v>`, `--psiphon-region`.

`--http-proxy` is **never** emitted (tests `http_proxy_never_reaches_engine`, `invalid_http_proxy_is_not_forwarded`); `http_proxy_address` is served by the GUI's own `httpproxy` module.

### 4. Exact env vars the GUI sets (profile → child process)

Set by `environment()` (profiles.rs:657-713), first-wins dedupe:
`AETHER_MASQUE_HTTP2` (`1`/`0`, always), `AETHER_ROUTE_SNIFF` (`0` when disabled), `AETHER_ROUTE_SNIFF_MS`, `AETHER_REPROVISION` (`0` when disabled), `AETHER_QUIC_V2` (`0` when disabled), `AETHER_MARK`, `AETHER_MAX_CLIENTS`, `AETHER_HALF_CLOSE_SECS`, `AETHER_TCP_KEEPALIVE_SECS`, `AETHER_TCP_CONNECT_SECS`, `AETHER_TOR_COUNTRY`, `AETHER_TOR_DIRECT_SECS`, `AETHER_TOR_STALL_SECS` (last three only when `engine_tor_mode != Disabled`).

Plus, unconditionally in both `pty::spawn` and `pty_android::spawn`:
- removed: `PROXY_ENV_KEYS` = `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `FTP_PROXY`, `http_proxy`, `https_proxy`, `all_proxy`, `ftp_proxy` (profiles.rs:3-12)
- set: `NO_PROXY` = `localhost,127.0.0.1,::1` and `no_proxy` = `localhost,127.0.0.1,::1`

No other env vars are passed (no `AETHER_CONFIG`, no `--config` flag anywhere).

### 5. There is NO aether TOML config

The GUI never writes an `aether.toml` (or any TOML). Repo-wide grep for `toml` hits only two test fixtures that assert such a filename must be **rejected** during update-archive extraction: `src-tauri/src/updater.rs:584` and `src-tauri/binaries/test_fetch_aether.py:52`. The profile reaches the engine exclusively as **CLI flags + `AETHER_*` env vars** (table above). The field-mapping table in section 1 is therefore "GUI field → CLI flag / env var", not "→ TOML key". [UNCERTAIN: whether the aether binary itself reads a `aether.toml` from its cwd is outside this repo — the GUI does not create one.]

### 6. Validation (`validate()`, profiles.rs:859-1051) — exact error strings

- `socket_address()` helper: `"use a numeric IP:port (bracket IPv6), port 1–65535"` prefixed by field name; rejects port `0` and zone ids (`%`).
- Listener collision set: `bind_address`, non-empty `http_proxy_address`, and (`engine_tor_mode ∈ {Tor, TorReverse}` → `engine_tor_bind`, default `127.0.0.1:1820`) / (`engine_psiphon_mode ∈ {Psiphon, PsiphonReverse}` → `engine_psiphon_bind`, default `127.0.0.1:1821`). `listeners_collide()` treats same-port + same/unspecified/IPv4-mapped IPs as colliding. Error: `"{name} conflicts with {other_name}; choose separate listener addresses/ports"`.
- `"tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)"` — `TorReverse` + `Protocol ∈ {Wireguard, Gool}`.
- `"psiphon-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)"` — same for `PsiphonReverse`.
- `"psiphon-only cannot be combined with engine Tor — both claim the primary listener"` — `PsiphonOnly` + any Tor mode.
- `"tor-only cannot be combined with engine Psiphon — both claim the primary listener"`.
- `"tor-reverse and psiphon-reverse cannot both run — each needs MASQUE as its sole outer tunnel"`.
- `warp_active = engine_tor_mode != TorOnly && engine_psiphon_mode != PsiphonOnly`; when active: `wiw_peers` (Gool) and non-`auto` `mim_peers` run through `peer_list()` → `"provide at most two distinct numeric IP:port endpoints"`, `"the two hops must use different IP addresses"`.
- TUN (`capture_mode != Proxy`): `tun_address` must be `IP/prefix` (`"tun_address: use IP/prefix"`, `"tun_address: invalid IP"`, `"tun_address: invalid prefix"`, prefix ≤ 32/128), `tun_dns` an IP (`"tun_dns: invalid IP"`).
- `route_sniff_ms > 10_000` while `route_sniff` → `"route_sniff_ms: must be an integer from 0 to 10000"`.
- `fw_mark` (linux/android) → `validate_mark()` accepts decimal or `0x`/`0X` hex (`"invalid fw_mark: …"` / `"invalid fw_mark hex: …"`).
- Tor block: conflict matrix for bridges → `"Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled"`; `engine_tor_country` → `"engine_tor_country: use a two-letter country code"`; `engine_tor_relays` → `"engine_tor_relays: use auto, only, off, or a number"`; `engine_tor_relay_ports` → `"engine_tor_relay_ports: use web or any"`.
- `psiphon_region` → `"psiphon_region: use a two-letter country code"`.
- `exit_loc` → `"exit_loc: comma-separated two-letter country codes, optional leading ! (e.g. \"DE,SE,!IR\")"` (`exit_loc_tokens_ok` allows `!` prefix per token).

Deliberate laxity: invalid values that `validate()` would catch are *also* silently dropped at `as_args()` time (e.g. invalid `--bind`, invalid `mim_peers`/`wiw_peers`), so a stale saved profile can't inject a bad flag. Tests `inactive_transport_controls_preserve_saved_choices` and `peer_validation_...` pin that inactive controls keep their saved value without being validated.

### 7. Ports / paths (verbatim defaults)

- GUI bridge / default SOCKS: **`127.0.0.1:1819`** (`default_bind_address()`, also `status.rs:6 DEFAULT_SOCKS_ADDR`, `httpproxy.rs:19 DEFAULT_SOCKS`, `commands.rs:154` system-proxy enable).
- Engine Tor secondary listener default: **`127.0.0.1:1820`** (validate fallback, profiles.rs:883; status.rs:64).
- Engine Psiphon secondary listener default: **`127.0.0.1:1821`** (profiles.rs:894; status.rs:92).
- `http_proxy_address` in tests uses `127.0.0.1:1818` as the example (never forwarded).
- Store files: `profile.json` (`last_successful_profile`), `presets.json` (`saved_presets`, max 10), `settings.json` (`always_on_top`, `minimize_on_startup`, `window_position {x,y,width,height}`, `close_to_tray`, `ip_changer_use_system_tor`), `history.json` (`connection_history`, max 20).
- PTY cwd = `app_data_dir(&app)` (created with `create_dir_all` in `start_connect`); binary = `engine::resolve(&app)`.

### 8. settings.json ↔ profile interplay

The profile is **not** in `settings.json`. `settings.json` holds only window/tray/system preferences (see §7); profile lives in `profile.json`, presets in `presets.json`. The only bridge is the frontend import/export UI `src/components/SettingsIO.tsx`: it bundles `{version, profile, presets, settings}` into one JSON (default filename `aether-gui-settings.json`) using the generic `read_file`/`write_file` commands, then replays it via `set_default_profile` (which re-validates) and `save_preset`; it shows a diff and an "Undo" toast that calls `set_default_profile` again with the pre-import snapshot. Migration is serde-side only: `#[serde(default)]` fills new fields on old JSON (tests `old_profile_json_gets_defaults`, `old_profile_json_gets_new_defaults`), and aliases (`stealth`→`verified`, `tor_reverse`→`tor-reverse`, `tor_only`→`tor-only`, `psiphon_reverse`→`psiphon-reverse`, `psiphon_only`→`psiphon-only`) upgrade legacy spellings to canonical on next save. There is no versioned migration routine in Rust.

### 9. PTY spawn details

- **desktop (`pty.rs`)** — `portable-pty = "0.8"` (dependency is cfg'd to non-Android in `Cargo.toml:34-35`). `native_pty_system().openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })`; `CommandBuilder::new(binary)`, `cmd.cwd(cwd)`; args = `profile.as_args()`; env = `profile.environment()` + proxy stripping (§4); spawn on **slave**, drop slave, `master.try_clone_reader()` + `master.take_writer()` (writer wrapped `Arc<Mutex<Box<dyn Write>>>`), master kept in `_master`. Spawn errors → `AetherError::SpawnFailed(String)`.
- **`PtySession` API** (desktop): `pid()` (`child.process_id().unwrap_or(0)`), `prompts_done()`, `startup_failure_after_exit()`, `try_wait() -> Option<i32>`, `send_ctrl_c()` (writes `0x03`), `send_line(&str)` (writes bytes + `\r\n`), `kill()`.
- **android (`pty_android.rs`)** — plain `std::process::Command` with `stdin/stdout/stderr(Stdio::piped())`; same args/env handling; two reader threads (one stdout, one stderr) feeding the same `log_tx`; `prompts_done` is initialized **`true`** and never toggled (no menu answering, no `OutputDiagnostics`/`StartupFailure` classification); `send_ctrl_c()` is a no-op; `send_line` appends `"\n"` not `"\r\n"`. Selected via `aether/mod.rs:5-9`: `#[cfg(not(target_os = "android"))] pub mod pty;` else `#[path = "pty_android.rs"] pub mod pty;` — both modules present the same `PtySession`/`spawn` surface.

### 10. Output parsing / chunking / events

- Reader loop (desktop `read_loop`, android `pipe_loop`): 4096-byte reads → `String::from_utf8_lossy` → `drain_lines(&mut line_buf)`.
- `drain_lines` (pty_output.rs:125-155): splits on `\n`; a `\r` run followed by `\n` is one line (`\r\n`, `\r\r\n`); a `\r` run **not** followed by `\n` (spinner overwrite) drains silently unless it is at the buffer end (waits for a possible `\lf`); unterminated tail capped at `MAX_PARTIAL = 16 * 1024` bytes (char-boundary safe). `finish_lines` flushes the trimmed tail at EOF.
- `strip_ansi` removes `ESC [ … <alpha>` CSI sequences only.
- `OutputDiagnostics::log_line()` classifies startup failures (`classify_startup_failure` requires `error`/`fatal` in the line): `UnsupportedOption` (unknown/unrecognized option, unexpected argument), `InvalidConfiguration` (invalid value/argument, requires/missing value, invalid configuration), `MissingTransport` (`lyrebird`/`transport executable` + not found/no such file/permission denied/not executable), `BindInUse` (`address already in use`, `only one usage of each socket address`). The **first** classified line is replaced by a fixed, leak-free message (`StartupFailure::message()`) — the original text (which can contain usage output) is never forwarded. `failure_after_exit()` waits ≤ 250 ms for readers.
- Event emission: every (possibly rewritten) line becomes `LogEvent { line, timestamp: now_millis() }` sent on the `mpsc` channel; `spawn_and_monitor` forwards each to `app.emit(LOG_EVENT, …)` where **`LOG_EVENT = "aether://log"`** (`events.rs:4`). Other relevant names: `STATUS_EVENT = "aether://status"`, `ENGINE_TOR_STATUS_EVENT = "aether://tor-status"`, `ENGINE_PSIHON_STATUS_EVENT = "aether://psiphon-status"`, `TRAFFIC_EVENT = "aether://traffic"`.
- GUI-authored log lines (also through `aether://log`): `"[gui] answered {section} → {answer}"`, `"[gui] one-time code sent to Aether"`, `"[gui] {startup_stage}"` (on Launching→Connecting, gated on `prompts_done()`), `"[tun] Failed to activate TUN: …"`.
- Log window: `src/log-window.ts:148` `await listen<LogLine>("aether://log", …)` with `MAX_LINES` trimming; main UI store `src/state/connectionStore.ts:462` batches payloads and flushes every 100 ms.
- `prompts_done()` semantics: set to `true` on the **first non-empty output line** (pty.rs:163) and again once all four `PROMPT_TABLE` answers were sent; `monitor_connect` uses it to announce `ConnectionState::Connecting` (mod.rs:409-430). On child exit, `startup_failure_after_exit()` (desktop, cfg-gated in `monitor_connect` mod.rs:359) turns a classified failure into `ConnectionState::Error { phase: "configuration" }` instead of the generic "exited before connecting" path.

### 11. Tests present

`profiles.rs` — **38** tests: `default_omits_bind_flag`, `custom_port_emits_bind`, `lan_bind_emits_bind`, `lan_with_custom_port_emits_bind`, `invalid_bind_is_not_forwarded`, `old_profile_json_gets_defaults`, `default_omits_v15_flags`, `v15_flags_emitted_when_set`, `default_emits_noize`, `http_proxy_never_reaches_engine`, `invalid_http_proxy_is_not_forwarded`, `default_omits_upstream`, `empty_upstream_is_not_forwarded`, `socks_upstream_emits_flag_with_credentials`, `default_omits_wiw_peers`, `wiw_peers_only_for_gool`, `gool_wiw_peers_emitted_and_normalized`, `gool_single_wiw_hop_emitted`, `gool_wiw_peer_without_port_is_dropped`, `default_omits_new_flags`, `mim_emits_and_omits_when_not_masque`, `mim_peers_auto_and_list`, `quic_v2_default_omits_flag`, `quic_v2_false_emits_no_quic`, `fw_mark_validate`, `engine_tor_mode_json_round_trip`, `engine_tor_mode_legacy_aliases_serialize_canonically`, `engine_tor_modes_emit_correct_flag`, `tor_reverse_rejects_wg`, `bridge_policies_emit_supported_cli_forms`, `bridge_file_is_forwarded_and_policies_still_conflict`, `psiphon_modes_emit_flags_and_enforce_exclusions`, `relays_and_exit_loc_format`, `active_listeners_require_numeric_distinct_sockets`, `peer_validation_limits_two_distinct_numeric_ips_when_active`, `inactive_transport_controls_preserve_saved_choices`, `numeric_tuning_serde_requires_uint32`, `old_profile_json_gets_new_defaults`. Guardrails: flag emission/omission, listener collision rules, engine-mode mutual exclusions, legacy serde aliases, numeric fields rejecting `-1`/`0.5`/`2^32`.

`pty.rs` — **5** tests (buffer semantics, duplicated from pty_output): `plain_newlines`, `crlf_and_onlcr_double_cr`, `cr_overwrite_drops_spinner_frames`, `lone_cr_at_end_waits_for_possible_lf`, `unterminated_tail_is_capped`.

`pty_output.rs` — **11** tests: the same five plus `eof_flushes_trailing_line`, `eof_flush_keeps_spinner_semantics`, `classify_known_config_failures`, `classify_ignores_plain_output_and_network_noise`, `failure_message_is_fixed_and_leak_free`, `failure_after_exit_waits_only_for_readers`.

`pty_android.rs` — **0** tests.

### 12. IPC commands that call into profiles (exact names)

Registered in `lib.rs:146-186`; the profile-touching ones:

| command | profiles.rs call |
|---|---|
| `get_default_profile` | `profiles::load` |
| `set_default_profile` | `profiles::validate` → `profiles::save` |
| `connect` (`profileOverride: Option<ConnectionProfile>`) | → `aether::start_connect` → `profiles::load` fallback + `profiles::validate`; on successful connect `profiles::save` (mod.rs:446) |
| `get_diagnostics` | `profiles::load` + `redact_profile` (`zt_access_secret`, `zt_access_token` → `None`) |
| `save_preset` | `profiles::validate` → `presets::save_preset` |
| `get_presets` / `delete_preset` | `presets::load_all` / `presets::delete_preset` (wrap `ConnectionProfile`) |
| `get_public_ip` | `profiles::load` (uses `bind_address` as proxy target) |
| `disconnect` | → `request_disconnect` → `profiles::load` (writes history entry with `protocol`/`scan_mode`) |
| `send_input` | → `aether::send_input` → `PtySession::send_line` (PTY input, no profiles.rs) |

Frontend call sites (naming only): `connectionStore.ts` (`connect` with `profileOverride`, debounced `set_default_profile`, `get_default_profile`, `get_public_ip`), `SettingsIO.tsx` (`get_default_profile`, `set_default_profile`, `save_preset`, `read_file`, `write_file`), `ProfilePresets.tsx` (`get_presets`, `save_preset`, `delete_preset`), `ZeroTrustPanel.tsx` (`send_input`).

### 13. Platform quirks

- `--mark` and `validate_mark()` in `validate()` are `#[cfg(any(target_os = "linux", target_os = "android"))]` (and `test`); `AETHER_MARK` env is set unconditionally when `fw_mark` is non-empty.
- Android: `commands.rs` compiles `set_always_on_top`/`get_always_on_top` stubs (`"always-on-top is a desktop-only feature"`); PTY replaced by pipes (§9); `monitor_connect`'s `startup_failure_after_exit()` call is `#[cfg(not(target_os = "android"))]`, so android has no configuration-failure classification.
- `portable-pty` itself is not a dependency on Android (`Cargo.toml` target section).

## Links to other sections

- **Slice 08 (status/engine/orphan)** — `aether/mod.rs` lifecycle (`start_connect`, `monitor_connect`, `handle_unexpected_failure`), `status.rs` (`startup_timeout`, `secondary_tor_address`, `DEFAULT_SOCKS_ADDR`), `engine.rs` (`resolve`, `inspect`), `orphan.rs` (`write_pid`/`clear_pid`).
- **Proxy/Net slice** — `httpproxy.rs` (`engine_addr`, `route_connect`, `claim`) owns the port re-mapping applied to `bind_address`/`engine_tor_bind`/`engine_psiphon_bind` just before spawn, and serves `http_proxy_address`.
- **TUN slice** — `tun/forwarder.rs` consumes `DnsMode`; `tun/mod.rs` `activate(…, &profile, …)` consumes `capture_mode`, `tun_address`, `tun_dns`.
- **IP changer slice** — `ip_changer.rs` reuses `settings.json` key `ip_changer_use_system_tor`; separate event names `ip-changer://status`, `ip-changer://log`.
- **Frontend slices** — `src/types/connection.ts` + `src/lib/validators.ts` (`connectionProfileSchema`, zod mirror of `ConnectionProfile`), `src/log-window.ts` (log window UI), `src/components/SettingsIO.tsx` (import/export).
- **Updater slice** — `updater.rs` rejects `aether.toml` inside update archives (the only TOML mention in the repo).
