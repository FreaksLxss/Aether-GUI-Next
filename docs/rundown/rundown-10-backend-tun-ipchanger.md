# Slice 10 — TUN mode (wintun) + IP Changer (independent Tor bundle)

## File inventory

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/tun/mod.rs` | 4.7 KB | Declares Windows-only submodules (`adapter`, `cleanup`, `dns`, `forwarder`, `route`), defines `TunError`, and the `TunManager` facade (Windows impl + non-Windows no-op stub). |
| `src-tauri/src/tun/adapter.rs` | 4.9 KB | `TunAdapter`: loads `wintun.dll`, opens/creates the adapter, sets IPv4 address + MTU, starts the wintun session; `parse_cidr` + its 4 unit tests. |
| `src-tauri/src/tun/route.rs` | 5.8 KB | `RouteManager`: captures the current default gateway/iface, adds bypass routes (RFC1918, loopback, gateway host route, Cloudflare ranges), points `0.0.0.0/0` at the TUN IP, restores on `restore()`/`Drop`. |
| `src-tauri/src/tun/dns.rs` | 3.4 KB | Two DNS transports: `forward_dns_tcp` (TCP DNS to `8.8.8.8:53` through the SOCKS5 upstream) and `resolve_direct` (plain UDP). Responses are read and **discarded** — never injected back into the TUN. |
| `src-tauri/src/tun/forwarder.rs` | 18.0 KB | User-space TCP stack over the wintun session: reads IPv4 packets, completes a synthetic 3-way handshake, opens one SOCKS5 `CONNECT` per flow, relays bytes both ways, crafts IPv4/TCP replies with `pnet_packet`, accounts bytes via `traffic::record_tx/record_rx`. |
| `src-tauri/src/tun/cleanup.rs` | 2.4 KB | Startup orphan reaping: reads `tun_state.json` from the app data dir; if the recorded PID is dead, deletes the adapter, restores the default route, flushes DNS, removes the file. **Nothing in this repo writes `tun_state.json`** (only `cleanup.rs` references the name). |
| `src-tauri/src/ip_changer.rs` | 26.0 KB | Self-contained Tor expert bundle: `TorManager` (child process lifecycle), bundled/system Tor binary discovery, control-port cookie auth (`AUTHENTICATE`, `SIGNAL NEWNYM`, `SIGNAL SHUTDOWN`), auto-rotate thread, exit-IP lookup over SOCKS5h, and all 13 `#[tauri::command]`s. |
| `src-tauri/binaries/wintun.dll` | 427 552 B | Vendored Wintun driver DLL. Never parsed by app code — loaded at runtime through `wintun::load_from_path`/`wintun::load` in `adapter.rs::load_wintun`. Bundled as a Tauri resource (see config rows below). |
| `src-tauri/tauri.conf.json` (bundle.resources) | — | `"resources": [..., "binaries/tor", "binaries/wintun.dll"]` — ships both `wintun.dll` and the Tor bundle next to the app. |
| `src-tauri/tauri.macos.conf.json`, `src-tauri/tauri.linux.conf.json` | — | Also list `"binaries/wintun.dll"` in `bundle.resources` (harmless: TUN code is `#[cfg(target_os = "windows")]`). |
| `src-tauri/Cargo.toml` (`[target.'cfg(windows)'.dependencies]`) | — | `wintun = "0.5"`, `pnet_packet = "0.35"`, `parking_lot = "0.12"`, `windows-sys = "0.59"` (with `Win32_Security`, `Win32_System_Threading`, … — needed by `is_tun_available` and `cleanup::is_process_alive`). |
| `src-tauri/binaries/tor/<os-arch>/` | — | Independent Tor bundle: `tor`/`tor.exe` + `data/{geoip,geoip6,torrc-defaults}` per platform (`windows/x86_64`, `linux/{x86_64,i686}`, `macos/{aarch64,x86_64}`). Only `geoip`/`geoip6` are consumed (via `--GeoIPFile`/`--GeoIPv6File`); `torrc-defaults` is never referenced by any code in `src-tauri/src` (grep for `torrc` → no matches) and the process runs with `--DataDirectory <app_data>/tor-run`, so it is inert for this subsystem. |

## Architecture / data flow

### TUN session start (there is **no** dedicated "start TUN" command)

1. User picks `capture_mode` = `"tun"` or `"both"` in the profile (`profiles.rs::CaptureMode`; default `CaptureMode::Proxy`, serialized `snake_case`). Persisted by the profile store via `connectionStore.setCaptureMode` (frontend, slice 05/09).
2. `aether::mod.rs::start_connect` → `spawn_and_monitor` → `monitor_connect` polls until `status::port_is_live(&socks)` (aether mod.rs:432).
3. When the engine is live, `monitor_connect` (aether/mod.rs:448-469) checks `profile.capture_mode` against `CaptureMode::Tun | CaptureMode::Both` and calls `tun.activate(&httpproxy::engine_addr().to_string(), &profile, resource_dir)` on `AppState.tun_manager`.
   - The SOCKS target passed in is **`httpproxy::engine_addr()`** (the app's internal loopback bridge upstream, see slice `BackendProxyNet`), not the engine's own SOCKS port.
   - Any `TunError` is only logged to `LOG_EVENT` (`aether://log`, line `"[tun] Failed to activate TUN: {e}"`); the connection continues **without** a tunnel.
4. `TunManager::activate` (tun/mod.rs:63-106), in order:
   - Reject with `TunError::NotActive` if an adapter already exists (misnomer: this is the "already active" guard).
   - `TunAdapter::create("Aether", profile.tun_address, resource_dir)`.
   - `RouteManager::save_current_state()` then `redirect_default_through_tun(&adapter)`.
   - Spawn thread `"tun-forwarder"` running `forwarder::run_forwarder(adapter, socks_addr, profile.dns_mode)`.
5. Teardown paths:
   - `aether::request_disconnect` (aether/mod.rs:572-587): `tun.deactivate()` **first**, then tears down the engine; errors go to `LOG_EVENT` (`"[tun] Failed to deactivate TUN: {e}"`).
   - `aether::shutdown_blocking` (aether/mod.rs:664-669): `let _ = tun.deactivate()` before Ctrl-C/killing the engine session.
   - **Not** torn down by the unexpected-engine-exit path: `handle_unexpected_failure` contains no `tun` reference; TUN stays up until an explicit disconnect or app shutdown.
   - `TunManager::deactivate` (tun/mod.rs:108-123): `adapter.shutdown()` (wintun `session.shutdown()`) → join `forwarder_handle` → `route_manager.restore()` → drop adapter.
   - `RouteManager::drop` also calls `restore()` (belt-and-braces; `restore()` is idempotent via `routes_changed`).

### Adapter creation (Windows-only details, `adapter.rs`)

1. `load_wintun(resource_dir)` probe order: `<resource_dir>/binaries/wintun.dll` → `<resource_dir>/wintun.dll` → `<exe_dir>/wintun.dll` → `<exe_dir>/binaries/wintun.dll` → `wintun::load()` (bundled/OS search). Each hit uses `unsafe { wintun::load_from_path(&path) }`.
2. `wintun::Adapter::open(&wintun, "Aether")`, falling back to `wintun::Adapter::create(&wintun, "Aether", "Aether", None)` — **device name `"Aether"`, driver/description string `"Aether"`, GUID = `None`** (wintun generates/derives it; app never passes a GUID).
3. Address: `parse_cidr(profile.tun_address)` → `adapter.set_address(ip)` — only the IP is applied, **the prefix length parsed from the CIDR is discarded** (`_prefix_len`). Default `tun_address = "10.0.0.2/24"` → address `10.0.0.2`. Parsing to `Ipv4Addr` means an IPv6 `tun_address` fails at create time.
4. `let _ = adapter.set_mtu(1500);` — best effort, return value ignored.
5. `adapter.start_session(wintun::MAX_RING_CAPACITY)`; kept as `Arc<Session>`.
6. `receive_packet` = `session.receive_blocking()`; `send_packet` = `allocate_send_packet(len)` + copy + `send_packet`. `shutdown()` = `session.shutdown()` (also run on `Drop`).
7. `interface_index()` = `adapter.get_adapter_index().unwrap_or(0)`; `name()` = `adapter.get_name().unwrap_or_default()`.

### Route manipulation / leak-protection semantics (`route.rs`)

1. `save_current_state()` runs `route print 0.0.0.0`, takes the **first** `0.0.0.0` line that is not `On-link`, parses column 3 as the gateway `Ipv4Addr` and the last column as the interface index.
2. `redirect_default_through_tun()` (all commands via `run_cmd` → `childproc::hidden(Command)`):
   - Adds **bypass** routes pointing at the **original** gateway, metric 5, *before* the default route moves:
     - `10.0.0.0/8` (mask `255.0.0.0`), `172.16.0.0/12` (`255.240.0.0`), `192.168.0.0/16` (`255.255.0.0`)
     - `127.0.0.0` mask `255.0.0.0` via `127.0.0.1`
     - host route `<orig_gateway> <orig_gateway> metric 5` (keeps the gateway reachable on-link)
     - Cloudflare/WARP ranges: `162.159.192.0/20` (`255.255.240.0`), `162.159.198.0/24` (`255.255.255.0`), `172.64.0.0/13` (`255.248.0.0`), `104.16.0.0/13` (`255.248.0.0`)
   - Reads the adapter's IP with `netsh interface ip show addresses <name>` (first `IP Address:` line), fallback hard-coded `"10.0.0.2"` (`get_tun_gateway`).
   - `route change 0.0.0.0 mask 0.0.0.0 <tun_ip> metric 1` (the one call whose failure propagates — but see caveat).
   - Caveat: `run_cmd` only fails if the process cannot be spawned; **exit status and stderr are never checked**, so a rejected `route add`/`route change` still returns `Ok`.
3. `restore()`: `route change 0.0.0.0 mask 0.0.0.0 <orig_gw> metric 1 [if <iface_idx>]`, then `ipconfig /flushdns`. Guarded by `routes_changed`.

### Traffic forwarding (`forwarder.rs`)

Packet path (single loop, thread `tun-forwarder`):
1. `adapter.receive_packet()`; on error (session shut down) → break, then all flows are marked `Closed` and `shutdown(Both)`.
2. Frames < 20 bytes, non-IPv4 (`get_version() != 4`) → dropped.
3. **TCP** → `handle_tcp_packet` keyed by `FlowKey { src_ip, dst_ip, src_port, dst_port }`:
   - `RST` → remove flow, shutdown socket.
   - `SYN` (no ACK) → spawn `handle_syn`: `TcpStream::connect_timeout(socks_addr, 5s)` → SOCKS5 handshake (`05 01 00`, then `05 01 00 01 <dst_ip> <dst_port>` CONNECT). On any failure → inject `RST` to the client. On success → inject `SYN-ACK` with **hard-coded `server_seq = 1000`**, insert `Flow { stream, state: SynReceived, client_seq, server_seq: 1001 }`.
   - `ACK` in `SynReceived` → `Established`, spawn `relay_socks_to_tun` (SOCKS → TUN direction).
   - `Established` + payload → `stream.write_all(payload)` + `flush`, then `traffic::record_tx(len)` (client→upstream accounting).
   - `FIN` → `CloseWait`, inject pure `ACK` (flags `0x10`), shutdown socket.
4. **UDP** → only `dst port == 53` or `src port == 53` is handled; payload is copied and `handle_dns_packet` runs on a fresh thread. **All other UDP (and all ICMP/other protocols) is silently dropped** — no ICMP unreachable is ever generated.
5. `relay_socks_to_tun`: 16 KiB buffer, `read_timeout(30s)`; `Ok(0)` → inject `FIN+ACK` (`0x11`); read error → inject `RST`; otherwise `traffic::record_rx(n)` and inject a `PSH+ACK` (`0x18`) data segment built by `send_tcp_data`.
6. Packet crafting: `send_tcp_packet`/`send_tcp_data` build a 20-byte IPv4 header + 20-byte TCP header (data offset 5, window 65535, TTL 64, `pnet_packet::tcp::ipv4_checksum` + `ipv4::checksum`). `tcp_flags()` reads raw byte 13 of the TCP header.
7. `ForwarderState.tun_ip` comes from `parse_tun_ip()` = **hard-coded `[10, 0, 0, 2]`** (forwarder.rs:615-617) — independent of `profile.tun_address`; a non-default `tun_address` makes synthesized replies use the wrong source IP. [INFERENCE: flows to non-`10.0.0.2` setups break]

### DNS handling (`dns.rs`)

- There is **no DNS server listening in the app and no resolver written to the adapter**: nothing calls `netsh … set dnsservers`, and `profile.tun_dns` (default `"8.8.8.8"`) is validated in `profiles.rs::validate` and stored/serialized but **never read by any TUN code**.
- `DnsMode::Forward` → `dns::forward_dns_tcp(payload, socks_addr)`: TCP connect to the upstream SOCKS5 (3 s timeout), SOCKS5 handshake, CONNECT to `8.8.8.8:53` (**hard-coded** `Ipv4Addr::new(8,8,8,8)`, port 53), write 2-byte length + query, read 2-byte length + response (reject > 4096 bytes), log `"DNS response received: N bytes"` — then **return without sending the answer anywhere**.
- `DnsMode::Direct` → `dns::resolve_direct(payload, dst)`: UDP socket with 3 s read timeout; if `dst` is unspecified or starts with `"10."` it re-targets `8.8.8.8:53`; reads a 4096-byte response and likewise **discards it**.
- Net effect per code: DNS queries leave the host, but the reply never re-enters the TUN, so name resolution *through the TUN adapter* cannot complete; only the `10.0.0.2` / bypass-route plumbing is exercised. [INFERENCE from the absence of any adapter write in `handle_dns_packet` and both `dns.rs` functions]

### Startup orphan cleanup (`cleanup.rs`)

`lib.rs` (line 41-42, `#[cfg(target_os = "windows")]`) calls `tun::cleanup::reap_orphan_tun(&data_dir)` right after `aether::orphan::reap_orphan`:
1. Read `<data_dir>/tun_state.json` (const `TUN_STATE_FILE = "tun_state.json"`) → `{ adapter_name, original_gateway, pid }`. Missing file → return; unparsable → delete file, return.
2. `is_process_alive(pid)`: `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess` → alive only if exit code `== 259` (`STILL_ACTIVE`); null handle → dead.
3. Dead → log `"[tun] Cleaning up orphaned TUN adapter '<name>' (PID <pid> is dead)"`, `netsh interface delete interface <name>`, `route change 0.0.0.0 mask 0.0.0.0 <original_gateway> metric 1`, `ipconfig /flushdns`, remove the file.
4. **Caveat:** a repo-wide search shows `tun_state.json`/`TunState` appear only in `cleanup.rs` — no writer exists in current code, so this path is inert unless an older/external build wrote the file. [UNCERTAIN: possibly a leftover from a previous design]

### IP Changer (independent Tor expert bundle) lifecycle

- **Independent of engine Tor**: engine-side Tor status is `ENGINE_TOR_STATUS_EVENT = "aether://tor-status"` (emitted by the aether engine, slice `BackendAetherCore`); this bundle has its own process, own ports, own events `ip-changer://status` / `ip-changer://log`, own data dir.
- **Start** (`start_tor` → `start` → `do_start`):
  1. Reject if status ∈ {`Starting`,`Running`,`Stopping`} → `"Tor is already running"`; set `Starting`, log `"[tor] starting Tor…"`.
  2. Engine choice `TorEngine::{Bundled,System}` from `use_system_tor`: bundled path = `tor_binary_path(app)` probing `binaries/tor/<rel>/<tor|tor.exe>` under `resource_dir`, `app_data_dir`, `CARGO_MANIFEST_DIR` (unix exec bit fixed to `0o755`); system path = `system_tor_binary()` (PATH, then `/usr/bin`, `/usr/local/bin`, `/bin` on Linux). Platform rel dirs (`bundled_rel_dir`): `windows/x86_64`, `linux/x86_64`, `linux/i686`, `macos/aarch64`, `macos/x86_64`, else error `"no bundled Tor for {os}/{arch}"`.
  3. Preflight: for `[socks_port, control_port]` if `aether::status::port_is_live(127.0.0.1:port)` **and not** `httpproxy::is_claimed(addr)` → `AetherError::PortInUse(port)`.
  4. `run_dir = app_data_dir/tor-run` (fallback `temp_dir`), created; stale `control_auth_cookie` removed.
  5. `tor_upstream = httpproxy::free_loopback_ports(1)` (ephemeral `127.0.0.1:0`); `httpproxy::claim("<socks_host>:<socks_port>", tor_upstream)` binds the **advertised** endpoint and relays it to Tor's real port. `socks_host = "0.0.0.0"` when `lan_bind`, else `"127.0.0.1"`.
  6. Spawn hidden (`childproc::hidden`) Tor with exactly: `--SocksPort <tor_upstream>` `--ControlPort 127.0.0.1:<control_port>` `--CookieAuthentication 1` `--DataDirectory <run_dir>` `--ClientOnly 1` `--Log notice stdout` (+ `--GeoIPFile`/`--GeoIPv6File` if `<binary_parent>/data/geoip{,6}` exist). stdout/stderr piped → two `spawn_log_reader` threads → `TOR_LOG_EVENT`.
  7. Readiness poll every 1500 ms up to `BOOTSTRAP_TIMEOUT = 120s`: control port live **and** cookie file present **and** `control_exchange(port, cookie, "GETINFO version")` OK → store cookie, status `Running`, emit `ip-changer://status`, log `"[tor] control port ready — Tor is running"`. Child exited → `Err("Tor exited during startup (status {code})")`; deadline → kill + `"Timed out waiting for Tor to open its control port"`.
  8. `spawn_monitor` (500 ms loop) reports unexpected exits: `TorStatus::Error { message: "Tor exited unexpectedly (status {code})" }` + log `"[tor] process exited unexpectedly — see log above"`; a `user_stop` exit → `Stopped`.
- **Stop** (`stop_tor` → `stop`): no child → `Ok` if status is `Stopped`/`Error`, else `Err("Tor is not running")`. Otherwise `Stopping`, `SIGNAL SHUTDOWN` over the control port (if cookie), wait `SHUTDOWN_GRACE = 10s`, then `kill()`, plus `KILL_GRACE = 3s` after kill. Clears child/cookie/`user_stop`; disables system proxy if `sysproxy::source() == SOURCE_IP_CHANGER`; status `Stopped`, log `"[tor] stopped"`.
- **Rotation**: `rotate_ip` → `rotate` → `control_exchange(control_port, cookie, "SIGNAL NEWNYM")` (cookie required, else `Err("Tor is not running")`), resets `auto_last_ms`, logs `"[tor] new identity (NEWNYM) requested — exit IP will change within a few seconds"`.
- **Auto-rotate**: `spawn_auto_rotate` (started in `lib.rs` setup) ticks every 1 s; fires `SIGNAL NEWNYM` when `auto_enabled && running && now - auto_last_ms >= interval*1000`, then logs `"[tor] auto-rotate: new identity requested (every <interval>s)"` (failure → `"[tor] auto-rotate failed: {e}"`). `set_auto_rotate` validates `60..=86400` s (`MIN_AUTO_INTERVAL_SECS`/`MAX_AUTO_INTERVAL_SECS`) only when `enabled`.
- **Exit-IP probe**: `get_current_ip` → `current_ip` (requires `Running`) → `fetch_tor_ip(socks_port)` builds `reqwest` client with `socks5h://127.0.0.1:<socks_port>` (i.e. through the claimed bridge port), timeout `IP_REQUEST_TIMEOUT = 8s`, UA `aether-gui/<CARGO_PKG_VERSION> ip-changer`; tries `https://ipwho.is/` then `https://ipapi.co/json/`.
- **Shutdown at app exit**: `lib.rs` setup registers `ip_changer::shutdown_blocking(&state.tor_manager)` (hard `kill()` + up to 3 s wait).
- **Error handling style**: all fallible commands return `Result<_, AetherError>` (variants used: `Internal`, `PortInUse`, `SpawnFailed`, `ProxyConflict`); `set_status` always emits even on failure paths; log lines are emitted as `LogEvent { line, timestamp: now_millis() }`.

## Key details

### TUN — command table (IPC)

| command | what it does | args |
|---|---|---|
| `is_tun_available` | Windows: `OpenProcessToken` + `GetTokenInformation(TokenElevation)` → `TokenIsElevated != 0` (i.e. "is elevated"); non-Windows: `false` | none |
| `get_tun_active` | `state.tun_manager.lock().is_active()` (adapter present?) | none |

Notes: `is_tun_available` is registered in `lib.rs` invoke list but **no frontend call site exists** (grep of `src/` finds only `get_tun_active`). TUN activation itself has **no command** — it is side-effect of connect (see flow above). Frontend `TunIndicator.tsx` polls `get_tun_active` every 3000 ms.

### TUN — structs/enums

- `TunError` (thiserror, manual `Serialize` to string): `AdapterCreate(String)` `"failed to create TUN adapter: {0}"`, `RouteError(String)` `"failed to manipulate routes: {0}"`, `ForwarderError(String)` `"failed to start forwarder: {0}"`, `NotActive` `"TUN adapter not active"`, `Internal(String)` `"internal error: {0}"`.
- `TunManager` (Windows): `adapter: Option<Arc<TunAdapter>>`, `route_manager: Option<RouteManager>`, `forwarder_handle: Option<JoinHandle<()>>`; methods `new/activate/deactivate/is_active` + `Default`. Non-Windows twin is a `_private: ()` stub whose `activate`/`deactivate` return `Ok(())` and `is_active` is `false`.
- `TunAdapter`: `_wintun: wintun::Wintun`, `adapter: Arc<wintun::Adapter>`, `session: Arc<wintun::Session>`.
- `RouteManager`: `original_default_gateway: Option<Ipv4Addr>`, `original_interface_index: Option<u32>`, `tun_interface_index: u32`, `routes_changed: bool`; `impl Drop → restore()`.
- `ForwarderState`: `flows: HashMap<FlowKey, Arc<Mutex<Flow>>>`, `socks_addr: SocketAddr`, `dns_mode: DnsMode`, `tun_ip: [u8; 4]`. `FlowKey { src_ip: [u8;4], dst_ip: [u8;4], src_port: u16, dst_port: u16 }`. `Flow { stream: TcpStream, state: TcpState, client_seq: u32, server_seq: u32 }`. `TcpState = SynReceived | Established | CloseWait | Closed`.
- `TunState` (cleanup.rs, private): `adapter_name: String`, `original_gateway: String`, `pid: u32`.
- Profile fields consumed (see slice `BackendProfilesPty`): `capture_mode: CaptureMode { Proxy, Tun, Both }` (default `Proxy`), `dns_mode: DnsMode { Forward, Direct }` (default `Forward`), `tun_address` default `"10.0.0.2/24"`, `tun_dns` default `"8.8.8.8"` (**unused by TUN code**).

### TUN — defaults / paths / magic numbers

- Adapter name `"Aether"`, wintun description `"Aether"`, GUID `None`.
- Default adapter IP `10.0.0.2` (from `tun_address`), forwarder source IP hard-coded `10.0.0.2`, fallback TUN gateway string `"10.0.0.2"`, MTU `1500`, ring `wintun::MAX_RING_CAPACITY`.
- DNS targets: `8.8.8.8:53` (both modes hard-code it), response cap `4096` bytes, timeouts: SOCKS connect 3 s (DNS) / 5 s (TCP flows), UDP DNS read 3 s, SOCKS read 30 s (relay loop).
- Bypass route metric `5`, default-route metric `1`; bypass prefixes: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, gateway host route, `162.159.192.0/20`, `162.159.198.0/24`, `172.64.0.0/13`, `104.16.0.0/13`.
- wintun.dll search: `<resource>/binaries/wintun.dll`, `<resource>/wintun.dll`, `<exe_dir>/wintun.dll`, `<exe_dir>/binaries/wintun.dll`, `wintun::load()`.
- State file `tun_state.json` in app `data_dir` (written by nobody in this repo).

### TUN — what it guarantees / does NOT guarantee (per code)

Guarantees (Windows + elevated only in practice):
1. An IPv4 wintun adapter named `Aether` exists with the profile IP while connected; default route points at it (`route change … metric 1`).
2. Private/loopback/gateway/Cloudflare prefixes keep going via the **original** gateway (deliberate exclusions from the tunnel).
3. Every accepted TCP flow is carried over exactly one SOCKS5 `CONNECT` to the app's engine bridge (`httpproxy::engine_addr()`), so TCP traffic is proxied through the configured engine.
4. TCP data is byte-accounted in both directions (`traffic::record_tx` / `record_rx`, surfaced by `get_traffic_stats`).
5. Best-effort restore: default route + `ipconfig /flushdns` on deactivate/drop, plus orphan reap at next startup *if* a state file exists.

Does NOT guarantee:
1. **IPv6** — forwarder drops non-v4; `tun_address` must parse as `Ipv4Addr`.
2. **Non-TCP/port-53-UDP protocols** — silently dropped; ICMP/ping never answered.
3. **DNS works through the TUN** — responses are read then discarded; no resolver is configured on the adapter; `tun_dns` is unused.
4. **Correct behavior with non-default `tun_address`** — synthesized packets always use `10.0.0.2`.
5. **Route-command success** — `run_cmd` ignores exit codes, so a failed `route change/add` still reports success; only `TunError::RouteError` from spawn failure surfaces.
6. **Tunnel is mandatory in tun/both mode** — activation failure is merely logged and the connection proceeds (traffic then flows outside the tunnel). [INFERENCE from aether/mod.rs:459-469]
7. **Teardown on engine crash** — `handle_unexpected_failure` does not deactivate TUN.
8. **Full TCP stack fidelity** — hard-coded `server_seq = 1000`, no window scaling/SACK/MSS options, no retransmission, no out-of-order handling, fixed data offset 5, no IP fragmentation handling; 16 KiB relay reads can be split arbitrarily across injected segments.
9. **Prefix length is applied** — only the IP is set on the adapter (`_prefix_len` discarded).
10. **Non-Windows** — everything is a no-op (`TunManager` stub, `is_tun_available = false`).

### IP Changer — command table (IPC, all registered in `lib.rs`)

| command | what it does | args |
|---|---|---|
| `start_tor` | `ip_changer::start` — spawn bundled/system Tor, wait for control port | none |
| `stop_tor` | `ip_changer::stop` — `SIGNAL SHUTDOWN` → grace → `kill` | none |
| `rotate_ip` | `SIGNAL NEWNYM` (manual rotation) | none |
| `get_current_ip` | async; exit IP via `socks5h://127.0.0.1:<socks_port>` → `ipwho.is` then `ipapi.co` | none (returns `Option<PublicInfo>`) |
| `get_tor_status` | current `TorStatus` clone | none |
| `set_auto_rotate` | validate + store auto-rotate settings (in-memory only) | `interval_secs: u64`, `enabled: bool` (camelCase from JS: `{ intervalSecs, enabled }`) |
| `get_auto_rotate` | `AutoRotateConfig { enabled, interval_secs }` | none |
| `tor_binary_exists` | `tor_binary_path(app).is_ok()` | none |
| `get_socks_addr` | `TorSocksAddr { host: "127.0.0.1"\|"0.0.0.0", port: 9050 }` | none |
| `set_tor_lan` | sets `lan_bind` in memory (takes effect on next start) | `enabled: bool` |
| `get_tor_lan` | reads `lan_bind` | none |
| `get_tor_source` | `TorSourceInfo { using_system, bundled_available, system_available, system_path }` | none |
| `set_use_system_tor` | switch engine **and persist** `ip_changer_use_system_tor` in `settings.json` | `use_system: bool` (JS `{ useSystem }`) |

Related, defined elsewhere: `set_ip_proxy` (`commands.rs:198`) — `sysproxy::ensure_free(SOURCE_IP_CHANGER)` then `sysproxy::enable("127.0.0.1:<socks_port>", SOURCE_IP_CHANGER)` / disable; `get_system_proxy_state` returns `owner` = `"ip_changer"` when this bundle owns the system proxy.

### IP Changer — state machine, events, config

- `TorStatus` (`#[serde(tag = "state")]`, JS sees `{state: "Stopped"|"Starting"|"Running"|"Stopping"|"Error", message?}`): `Stopped`, `Starting`, `Running`, `Stopping`, `Error { message }`; helper `is_running()`. Transitions: `Stopped → Starting` (start), `→ Running` (control-port ready), `→ Error` (any start failure / unexpected exit), `Starting|Running → Stopping → Stopped` (stop).
- Events emitted (verbatim, from `events.rs`): `TOR_STATUS_EVENT = "ip-changer://status"` (payload `TorStatus`), `TOR_LOG_EVENT = "ip-changer://log"` (payload `LogEvent { line: String, timestamp: u64 }`). Engine Tor uses the separate `ENGINE_TOR_STATUS_EVENT = "aether://tor-status"` — do not confuse them.
- Constants: `DEFAULT_SOCKS_PORT: u16 = 9050`, `DEFAULT_CONTROL_PORT: u16 = 9051`, `BOOTSTRAP_TIMEOUT = 120s`, `SHUTDOWN_GRACE = 10s`, `KILL_GRACE = 3s`, `MIN_AUTO_INTERVAL_SECS = 60`, `MAX_AUTO_INTERVAL_SECS = 86_400`, `IP_REQUEST_TIMEOUT = 8s`, `IP_USER_AGENT = "aether-gui/<version> ip-changer"`.
- Persistence: **only** `settings.json` key `ip_changer_use_system_tor` (bool) is persisted (`set_use_system_tor` writes + `store.save()`; `lib.rs:72-86` reads at startup, default `false`). Auto-rotate, `lan_bind`, ports (fixed 9050/9051, no setter exists) and everything else are in-memory per run.
- Control protocol: `control_exchange(port, cookie, cmd)` → TCP `127.0.0.1:<port>`, 3 s connect / 5 s read timeout, `AUTHENTICATE <hex cookie>\r\n` then `<cmd>\r\n`; `read_reply` accepts only lines starting with `250`, else `Err("control rejected: <line>")`.
- `TorManager` fields: `child: Option<Child>`, `status`, `data_dir`, `cookie: Option<Vec<u8>>`, `user_stop: bool`, `socks_port`, `control_port`, `lan_bind`, `use_system_tor`, `auto_enabled`, `auto_interval_secs` (default `60`), `auto_last_ms` (default `0`).

### Tests present
- `src-tauri/src/tun/adapter.rs` `mod tests` (compiled only on Windows, since the module is `cfg(target_os = "windows")`): `parse_cidr_valid` (`"10.0.0.2/24"` → `("10.0.0.2", 24)`), `parse_cidr_invalid_format` (`"10.0.0.2"`, `"10.0.0.2/"`, `"/24"` all err), `parse_cidr_invalid_ip` (`"999.999.999.999/24"` errs), `parse_cidr_prefix_too_large` (`"10.0.0.2/33"` errs). Nothing else in `tun/` is tested (no route/forwarder/dns/cleanup tests).
- `src-tauri/src/ip_changer.rs` `mod tests`: single test `hex_encoding` — `hex(&[0xde,0xad,0xbe,0xef]) == "deadbeef"`, `hex(&[]) == ""`, `hex(&[0x00,0x0f]) == "000f"`. No lifecycle/rotation tests.

### Ports table (this slice, verbatim from source)

| port | where defined | meaning |
|---|---|---|
| `9050` (`DEFAULT_SOCKS_PORT`) | `ip_changer.rs:15` | Advertised Tor SOCKS endpoint: `httpproxy::claim("127.0.0.1:9050", tor_upstream)` (or `0.0.0.0:9050` when `lan_bind`). What `get_socks_addr`, `set_ip_proxy` and `fetch_tor_ip` talk to. |
| `9051` (`DEFAULT_CONTROL_PORT`) | `ip_changer.rs:16` | Tor control port, bound by Tor as `--ControlPort 127.0.0.1:9051`, cookie auth (`control_auth_cookie` in `<app_data>/tor-run`). |
| ephemeral `127.0.0.1:0` → `tor_upstream` | `httpproxy::free_loopback_ports(1)` in `do_start` | Tor's *real* `--SocksPort`; the bridge relays `9050 → tor_upstream`. Never a fixed number. |
| (none) | `tun/forwarder.rs`, `tun/dns.rs` | TUN opens **no listening socket**; it only dials the engine bridge (ephemeral loopback from `httpproxy`) and outbound targets. |
| `53` (target) | `dns.rs:54-55` (`8.8.8.8`, port `53`), `forwarder.rs:103` (UDP src/dst `53`) | DNS target dialed through SOCKS/UDP; the app **listens on no DNS port** — DNS replies are consumed inside the TUN read loop. |
| engine bridge (ephemeral loopback) | `httpproxy::engine_addr()` | The SOCKS endpoint the TUN forwarder dials for every flow. |

### Platform quirks

- TUN subsystem is entirely `#[cfg(target_os = "windows")]`; other OSes get a stub `TunManager` and `is_tun_available() == false`.
- All external commands (`route`, `netsh`, `ipconfig`) run hidden via `crate::childproc::hidden`.
- `cleanup::is_process_alive` uses `windows_sys` `OpenProcess`/`GetExitCodeProcess` and treats only exit code `259` as alive.
- Unix-only `fix_exec_bit` (0o755) when locating a system/bundled Tor binary.
- `wintun.dll` is also listed as a resource for Linux/macOS bundles (config overshoot; unused there).

## Links to other sections

- **`BackendProxyNet` (`src-tauri/src/httpproxy.rs`)** — TUN's SOCKS target (`engine_addr()`), and IP Changer's exposed endpoint machinery (`claim`, `free_loopback_ports`, `is_claimed`, `set_target`). `ip_changer::do_start` depends on `httpproxy::claim` semantics (advertised port relay) and on `aether::status::port_is_live` for preflight.
- **`BackendAetherCore` (`src-tauri/src/aether/mod.rs`)** — owns TUN activation/deactivation call sites (`monitor_connect`, `request_disconnect`, `shutdown_blocking`) and the engine-Tor event `aether://tor-status` that must not be confused with `ip-changer://status`.
- **`BackendProfilesPty` (`src-tauri/src/aether/profiles.rs`)** — `CaptureMode`, `DnsMode`, `tun_address`, `tun_dns` defaults + validation (`validate` requires `IP/prefix` form and a parseable `tun_dns`).
- **`BackendLifecycle` (`src-tauri/src/lib.rs`, `state.rs`, `childproc.rs`, `events.rs`)** — command registration lists (13 ip_changer + 2 TUN commands), `AppState.{tun_manager, tor_manager}`, startup `reap_orphan_tun`, `spawn_auto_rotate`, `ip_changer_use_system_tor` load, exit `shutdown_blocking`, event constants.
- **`BackendLifecycle` / `sysproxy.rs` + `commands.rs::set_ip_proxy`** — system-proxy handoff (`SOURCE_IP_CHANGER`, `get_system_proxy_state.owner == "ip_changer"`); disabled automatically in `ip_changer::stop`.
- **`FrontendConnUI` / `FrontendShell`** — `TunIndicator.tsx` polls `get_tun_active`; `connectionStore.setCaptureMode/setDnsMode/setTunAddress/setTunDns` drive TUN inputs; `CaptureModeSelect`, `DnsModeSelect`.
- **`FrontendLibHooks` (`src/stores/ipChangerStore.ts`)** — the sole consumer of ip-changer IPC: `start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `get_tor_status`, `set_auto_rotate`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `get_tor_lan`, `set_tor_lan`, `get_tor_source`, `set_use_system_tor`, plus `set_ip_proxy`/`get_system_proxy_state`; listens to `ip-changer://status` and `ip-changer://log`, parses bootstrap `%` with `/Bootstrapped (\d+)% \((\w+)(?::|\))/`.
- **`traffic.rs`** — `record_tx`/`record_rx` called by `forwarder.rs`; surfaced via `get_traffic_stats`.
- **`BuildPackaging`** — ships `binaries/wintun.dll` and `binaries/tor/**` as Tauri resources (`tauri.conf.json`).
