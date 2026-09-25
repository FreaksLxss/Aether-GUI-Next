# Slice 07 — Backend proxy & network subsystem

Covers `src-tauri/src/httpproxy.rs`, `sysproxy.rs`, `traffic.rs`, `net.rs`.
Non-goals (only referenced as callers): `aether/`, `tun/`, `commands.rs`, frontend.

## File inventory

| path | ~size | purpose |
|---|---|---|
| `src-tauri/src/httpproxy.rs` | 26.7 KB / 814 lines | Loopback HTTP+SOCKS5 **bridge**: binds `127.0.0.1:0`, sniffs the first byte to serve either HTTP (`CONNECT` + plain `GET/POST…`) or SOCKS5, and chains every connection to an upstream SOCKS5 endpoint (the Aether engine) via a hand-rolled SOCKS5 client; also "claims" the engine's advertised doorways/ports so the GUI owns them, plus port-pairing helpers (`route_connect`) so the bridge never loops into itself. |
| `src-tauri/src/sysproxy.rs` | 7.9 KB / 266 lines | OS **system-proxy** switchboard: global atomics (`PROXY_ENABLED`/`PROXY_SOURCE`/`PROXY_SOCKS_PORT`), `enable`/`disable`/`ensure_free`/`disable_if_main`, and per-OS backends (Windows registry + WinInet broadcast, Linux `gsettings`, macOS `networksetup`) that point HTTP/HTTPS system proxy at `127.0.0.1:<bridge port>`. |
| `src-tauri/src/traffic.rs` | 7.5 KB / 232 lines | Global **byte counters** (`AtomicU64` TX/RX) with rate computation on `snapshot()`, `reset()`, plus a Windows-only `active_connections()` snapshotter (TCP/UDP table via `GetExtendedTcpTable`/`GetExtendedUdpTable` + PID→exe name). |
| `src-tauri/src/net.rs` | 2.5 KB / 81 lines | Public-IP **leak check**: async reqwest client (optionally routed `socks5h://` through the tunnel bind address), two endpoint fallbacks (`ipwho.is`, `ipapi.co`), JSON→`PublicInfo` parser. |

## Architecture / data flow

### 1. Startup (bridge)
`lib.rs::run()` → `builder.setup(...)` → `httpproxy::start()` (`lib.rs:45`):
1. If `RUNNING` already true, return the stored `LISTEN` addr (idempotent).
2. `TcpListener::bind("127.0.0.1:0")` — **OS-assigned ephemeral port** (no fixed HTTP proxy port).
3. Store addr in `LISTEN`, set `RUNNING`, `std::thread::spawn(accept_loop)`.
4. `accept_loop` spawns one thread per accepted connection → `handle_client`.

There is **no `stop()`**: `RUNNING` is never reset to `false`, accept threads and claimed listeners live for the whole process lifetime.

### 2. Connect path (who the bridge chains to)
`aether/mod.rs::connect` (non-goal file, called from here):
1. `httpproxy::route_connect(&profile.bind_address, tor_door)` (`aether/mod.rs:140`) → allocates a fresh loopback **engine** port via `free_loopback_ports`, sets `ENGINE`, clears `ENGINE_TOR`/`ENGINE_PSIHON`, `set_target(engine)`, claims the advertised door (`claim_sa(sa, engine)`) and optionally a tor door.
2. Optional `httpproxy::claim(http, engine)` for the profile's `http_proxy_address` (`aether/mod.rs:155`), `claim_psiphon_door(door)` (`:162`), `reserve_engine_psiphon()` / `reserve_engine_tor()` for reverse modes (`:170`, `:178`).
3. `traffic::reset()` then emit `aether://status` `Launching` (`aether/mod.rs:186-187`).
4. Engine is spawned with `bind_address = httpproxy::engine_addr()` (i.e. the private engine port), so the real Aether SOCKS5 only ever sees loopback traffic from the bridge.

Net effect: **[advertised door] → [private engine port] → real Aether SOCKS5**, one `PINS` hop, with `target_for()` applying `pin_for()` twice so an address can never be routed into itself (`httpproxy.rs:67-73`, tested by `route_connect_claims_doors_and_never_chains_into_itself`).

### 3. System-proxy enable
`set_system_proxy` / `set_system_proxy_addr` (`commands.rs:149-170`) → `sysproxy::enable(addr, SOURCE_MAIN)`:
1. `httpproxy::set_target(addr)` — record which SOCKS upstream the bridge should chain to (normalizes to loopback; unparsable → `127.0.0.1:1819`).
2. `httpproxy::local_addr()` → **bridge listen port** (error `"HTTP proxy bridge is not running"` if not started).
3. OS-specific set (below) pointing HTTP/HTTPS proxy at `127.0.0.1:<bridge port>`.
4. Store `PROXY_ENABLED=true`, `PROXY_SOURCE`, `PROXY_SOCKS_PORT` (port parsed from `addr`'s `rsplit_once(':')`).

So the OS is told about the **bridge** port, while `set_target` decides **where the bridge goes** (engine/SOCKS port). `get_system_proxy_state().port` reports the *upstream SOCKS* port, not the bridge port.

### 4. One request through the bridge
`handle_client(client)` (`httpproxy.rs:183`):
1. Read 1 byte.
   - `0x05` → `handle_socks5` (bridge also speaks SOCKS5 to clients).
   - not ASCII alphabetic → drop silently.
2. `read_head` accumulates until `\r\n\r\n` (or `\n\n`), cap `MAX_HEAD = 64 KiB`.
3. `request_line` → `(method, target)`; unparsable → `400 Bad Request`.
4. `target_for(door)` where `door = client.local_addr()` (pin lookup by exact/`0.0.0.0` match) → upstream `SocketAddr`; failure → `502 Bad Gateway`.
5. **`CONNECT host:port`**: `parse_authority` (no port → `400`), `socks_connect(host, port, upstream)`, reply `HTTP/1.1 200 Connection Established\r\n\r\n`, then `relay(client, upstream)`.
6. **Plain HTTP**: `handle_plain_http` — absolute-form target parsed by `split_request_target` (default port 80 / 443 for `https://`), origin-form target falls back to `Host:` header (`first_host_header`, default `127.0.0.1` / port 80); `rewrite_http` replaces the request line with origin-form `METHOD path`, writes head + leftover body upstream, `record_tx` for each write, then `relay`. Upstream connect failure → `502`.
7. **SOCKS5 client** (`handle_socks5`, `:316`): reads methods, always answers `[0x05,0x00]` (**no-auth only, no username/password**), expects `VER=5 CMD=1` (else `0x07` command-not-supported), decodes ATYP 1/4/3 (`read_socks_addr_body`/`socks_dest`), connects upstream, replies `[0x05,0x00,0x00,0x01,0,0,0,0,0,0]`, then `relay`. Upstream failure → reply code `0x05`.

`socks_connect(host, port, upstream)` (`:570`) — the SOCKS5 **client** half:
- `TcpStream::connect_timeout(upstream, UPSTREAM_TIMEOUT = 5s)`, `TCP_NODELAY`.
- Greeting `[0x05,0x01,0x00]`, requires reply `[0x05,0x00]` (upstream must offer no-auth).
- Request `[0x05,0x01,0x00, ATYP, addr, port_be]` with ATYP `0x01` IPv4 / `0x04` IPv6 / `0x03` domain (len ≤ 255).
- Reads reply + bind-address body per ATYP; `reply[1] != 0` → `SOCKS5 connect failed: 0xNN`.

`relay(client, upstream)` (`:401`): 4 `try_clone`s, two `std::thread`s running `pipe_counted` (8 KiB buffer) in each direction; `is_tx=true` for client→upstream, `false` for upstream→client; joins both; on EOF `shutdown(Write)` on destination.

### 5. Traffic measurement
- Counters are **global aggregates**, not per-connection: `record_tx`/`record_rx` bump `TX_BYTES`/`RX_BYTES` (`Relaxed`).
- Producers: `httpproxy::pipe_counted` (relay bytes), `handle_plain_http` (initial head/body writes), `tun/forwarder.rs:222` (`record_tx`) and `:398` (`record_rx`) for TUN traffic.
- Emitter: `lib.rs:57-69` — a dedicated `std::thread` sleeps **1000 ms**, and only when `ConnectionState::Connected` calls `traffic::snapshot()` and `handle.emit(events::TRAFFIC_EVENT, &stats)` where `TRAFFIC_EVENT = "aether://traffic"` (`events.rs:17`).
- `rates()` keeps `PREV: Mutex<(tx, rx, Option<Instant>)>`; rate = delta/elapsed only if `elapsed > 0.05s`, else 0. The same `PREV` is shared by the 1 s emitter and on-demand `get_traffic_stats`, so whichever polls first consumes the window.
- `reset()` zeroes both counters and `PREV`.

### 6. Disconnect / exit cleanup
- `sysproxy::disable_if_main()` (only clears when `SOURCE_MAIN`): on spawn failure (`aether/mod.rs:212`), retry exhaustion (`:299`), engine process exit (`:375`), disconnect (`:648`).
- `traffic::reset()` at those same points plus connect start (`:186`), auto-retry respawn (`:333`), disconnect without session (`:621`).
- IP changer: `ip_changer::stop_tor` disables the system proxy only when `source() == SOURCE_IP_CHANGER` (`ip_changer.rs:567-569`).
- App exit: `lib.rs:228-237` `RunEvent::Exit` → `aether::shutdown_blocking(...)` which ends with unconditional `crate::sysproxy::disable()` (`aether/mod.rs:680`).
- The bridge itself is never torn down (no `stop()`, `STOLEN` listeners kept forever).

## Key details

### Command table (`#[tauri::command]`, registered in `lib.rs:146-200`)

| command | what it does | args |
|---|---|---|
| `set_system_proxy` | enable/disable system proxy with hardcoded upstream `"127.0.0.1:1819"`, source `SOURCE_MAIN`; refuses if owned by another source (`AetherError::ProxyConflict`) | `enable: bool` |
| `set_system_proxy_addr` | same but arbitrary upstream addr (frontend passes `status.socks_addr` or `127.0.0.1:1819`) | `addr: String, enabled: bool` |
| `get_system_proxy` | returns `sysproxy::is_enabled()` | — |
| `get_system_proxy_state` | `SystemProxyState { enabled, owner: "main"\|"ip_changer"\|"none", port: sysproxy::socks_port() }` | — |
| `set_ip_proxy` | `ensure_free(SOURCE_IP_CHANGER)` then `sysproxy::enable("127.0.0.1:<tor socks_port>", SOURCE_IP_CHANGER)` | `state: State<AppState>, enabled: bool` |
| `get_public_ip` | `net::fetch_public_info(through_tunnel, profile.bind_address)` | `app: AppHandle, through_tunnel: bool` → `Option<PublicInfo>` |
| `get_traffic_stats` | `traffic::snapshot()` (also updates the shared rate window) | — → `TrafficStats` |
| `get_active_connections` | `traffic::active_connections()` (Windows-only data; `[]` elsewhere) | — → `Vec<ActiveConn>` |

### `httpproxy.rs` — statics, API, constants
Statics: `TARGET: Mutex<Option<String>>`, `LISTEN: Mutex<Option<SocketAddr>>`, `RUNNING: AtomicBool`, `STOLEN: Mutex<Vec<SocketAddr>>` (listeners already bound), `ENGINE`, `ENGINE_TOR`, `ENGINE_PSIHON: Mutex<Option<SocketAddr>>`, `PINS: Mutex<Vec<(SocketAddr, SocketAddr)>>` (listen → upstream).
Constants: `MAX_HEAD = 64 * 1024`, `UPSTREAM_TIMEOUT = Duration::from_secs(5)`, `DEFAULT_SOCKS = "127.0.0.1:1819"`.

Public functions:
| fn | role |
|---|---|
| `set_target(addr)` | set chain target; `normalize_target` maps unspecified IP → `127.0.0.1`, junk → `DEFAULT_SOCKS` |
| `local_addr()` | bridge listen addr (used by `sysproxy::enable`) |
| `engine_addr()` | current engine addr, falls back to `DEFAULT_SOCKS` |
| `engine_tor_addr()` / `engine_psiphon_addr()` | optional private reverse-engine ports |
| `is_claimed(&addr)` | pin exists (used by `ip_changer.rs:379` to distinguish "our port" from a genuine `PortInUse`) |
| `free_loopback_ports(n)` | bind `127.0.0.1:0` n times, read addrs, drop (ephemeral reservation) |
| `route_connect(advertised, tor_door)` | set up engine pairing + claim advertised door |
| `claim(addr_str, upstream)` / `claim_sa` | parse addr, upsert pin, bind listener once (`STOLEN` guard), spawn `accept_loop` |
| `claim_psiphon_door(door)` | private port + claim |
| `reserve_engine_tor()` / `reserve_engine_psiphon()` | allocate-only private ports |
| `start()` | bind bridge, spawn accept loop, idempotent |

Auth/PAC: **no authentication anywhere** (HTTP bridge never checks `Proxy-Authorization`; SOCKS5 always negotiates no-auth `0x00`), **no PAC served or installed by the backend**. The frontend `src/components/PacUrl.tsx` builds a `data:application/x-ns-proxy-autoconfig,…` PAC string (`"SOCKS5 ${addr}; DIRECT"` + LAN `DIRECT` rules) for the user to copy manually only.

### `sysproxy.rs` — state, OS specifics
State (all `Relaxed` atomics): `PROXY_ENABLED: AtomicBool`, `PROXY_SOURCE: AtomicU8` with `SOURCE_NONE = 0`, `SOURCE_MAIN = 1`, `SOURCE_IP_CHANGER = 2`, `PROXY_SOCKS_PORT: AtomicU16`.
API: `source()`, `socks_port()`, `is_enabled()`, `ensure_free(source)` → error `"A system proxy is already set — turn it off first before switching"`, `disable_if_main()`, `enable(addr, source)`, `disable()`.

- **Windows** (`set_proxy_windows`/`clear_proxy_windows`): key `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` (`KEY_SET_VALUE`), sets `ProxyEnable` = `1u32` (`0u32` on clear), `ProxyServer` = `"127.0.0.1:{port}"`, `ProxyOverride` (verbatim, `sysproxy.rs:145`) = `<local>;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;localhost`. Clear does **not** remove `ProxyServer`/`ProxyOverride`, only `ProxyEnable=0`. Then `notify_proxy_changed()`: `InternetSetOptionW(NULL, INTERNET_OPTION_SETTINGS_CHANGED/INTERNET_OPTION_REFRESH, …)` + `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, L"InternetSettings", SMTO_ABORTIFHUNG, 1000, …)` (`sysproxy.rs:85-119`).
- **Linux** (`set_proxy_linux`): `gsettings set org.gnome.system.proxy mode manual`, then for `http` and `https`: `…<sub>.host = 127.0.0.1`, `…<sub>.port = <port>`. Clear: `mode none`. Requires `gsettings` installed (`run_cmd` error text: "system proxy needs the {cmd} helper installed").
- **macOS**: `networksetup -listallnetworkservices` (skips lines starting with `*`), then per service `networksetup -setwebproxy <svc> 127.0.0.1 <port>` and `-setsecurewebproxy …`; clear: `-setwebproxystate` / `-setsecurewebproxystate` off.
- **Anything else**: `Err("System proxy is not supported on this OS yet")`.
- What is *not* set: no PAC/`AutoConfigURL`, no OS-level SOCKS proxy, no bypass exceptions on Linux/macOS.

### `traffic.rs` — structs & functions
```rust
pub struct TrafficStats { tx_bytes: u64, rx_bytes: u64, tx_rate: u64, rx_rate: u64 }   // Serialize
pub struct ActiveConn { pid: u32, exe: String, local: String, remote: String, state: String, proto: String } // Serialize
```
Fns: `record_tx`, `record_rx`, `rates` (private), `snapshot`, `reset`, `active_connections`; Windows helpers `pid_exe` (`OpenProcess`/`QueryFullProcessImageNameW`, pid 0 → `"System Idle"`, pid 4 → `"System"`), `tcp_state_label` (1 `CLOSED` … 12 `DELETE_TCB`, 5 → `ESTABLISHED`), `fmt_ipv4`.
`active_connections()` (`#[cfg(windows)]`; non-Windows returns `Vec::new()`): `GetExtendedTcpTable` (AF_INET, TCP_TABLE_OWNER_PID_ALL) collects ≤128 rows, `GetExtendedUdpTable` up to 160 total, sorts `ESTABLISHED` first then exe/pid, `truncate(64)`. UDP rows: `remote = "*:*"`, `state = ""`.

### `net.rs` — functions & constants
`REQUEST_TIMEOUT = 8s`; `USER_AGENT = "aether-gui/<CARGO_PKG_VERSION> leak-check"`; `ENDPOINT_IPWHO = "https://ipwho.is/"`, `ENDPOINT_IPAPI = "https://ipapi.co/json/"`.
- `client(through_tunnel, bind_addr)` — reqwest builder; when `through_tunnel`, `Proxy::all("socks5h://{bind_addr}")` (DNS through tunnel).
- `parse(&Value) -> Option<PublicInfo>` — `ip`, `ip_version` (`type == ipv6` or `:` in ip → `"IPv6"` else `"IPv4"`), `country_code` (`country_code` or `country`), `city`, `org` (`connection.org`).
- `fetch_from(&Client, url)` — GET, success status + `success != false`, then `parse`.
- `fetch_public_info(through_tunnel, bind_addr)` — `ipwho.is` first, `ipapi.co` fallback.
- Also consumed by `ip_changer.rs` (`ENDPOINT_*`, `parse`, its own `fetch_from` around `:613-630`).

### Default ports table (this slice + directly-tied defaults)

| port | role | source (verbatim) |
|---|---|---|
| `127.0.0.1:1819` | default Aether SOCKS5 / default chain target / default `set_system_proxy` upstream | `httpproxy.rs:19` `DEFAULT_SOCKS`; `commands.rs:154`; `aether/profiles.rs:366` `default_bind_address()`; `aether/status.rs:6` `DEFAULT_SOCKS_ADDR` |
| `127.0.0.1:1820` | default `engine_tor_bind` | `aether/profiles.rs:883`, `aether/status.rs:64` |
| `127.0.0.1:1821` | default `engine_psiphon_bind` | `aether/profiles.rs:894`, `aether/status.rs:92` |
| `127.0.0.1:0` (ephemeral) | HTTP bridge listen port (the one handed to the OS proxy settings) | `httpproxy.rs:160` `start()` |
| ephemeral | private engine / tor / psiphon ports from `free_loopback_ports` | `httpproxy.rs:79-108` |
| **no fixed HTTP proxy port, no PAC port** | — | — |

Frontend fallbacks hardcode `"127.0.0.1:1819"` (`SystemProxyToggle.tsx:24`, `PacUrl.tsx:15`, `ConnectionInfo.tsx:40`, `CopyProxyButton.tsx:15`, `TrafficStats.tsx:36`, `usePaletteItems.ts:201`).

### Events & frontend callers (naming only)
- Emit: `events::TRAFFIC_EVENT = "aether://traffic"` (`events.rs:17`), payload `TrafficStats`, every 1000 ms, only while `Connected` (`lib.rs:57-69`). Also `aether://status`, `aether://tor-status`, `aether://psiphon-status` (defined `events.rs:3-6`, emitted elsewhere).
- Frontend: `src/state/connectionStore.ts:466` `listen<TrafficStats>("aether://traffic")`; `:366-367` `get_public_ip` (tunnel + direct pair); `:393` `get_active_connections`; `:483` `get_traffic_stats` on init. `src/components/ProxyIndicator.tsx:15-18` polls `get_system_proxy_state` every 3000 ms; `src/components/SystemProxyToggle.tsx:30` invokes `set_system_proxy_addr`; `src/stores/ipChangerStore.ts:197` invokes `set_ip_proxy`, `:230` reads `get_system_proxy_state`.
- Backend peers: `ip_changer.rs:379` (`is_claimed`), `:400-405` (`free_loopback_ports` + `claim`), `:567` (`source()`/`disable()`); `aether/mod.rs` (route/claim/reset/disable_if_main as above); `aether/status.rs:72,100` (`engine_tor_addr()`/`engine_psiphon_addr()` for `ready` probes); `tun/forwarder.rs:222,398` (`traffic::record_*`).

### Threading / blocking patterns
- `httpproxy.rs` is pure `std::thread` + blocking `TcpStream`: 1 bridge accept thread + 1 accept thread per claimed door + per-connection 1 handler thread + 2 relay threads (handler joins both). No tokio, no async, no timeouts on relay reads (only the 5 s upstream connect timeout); an idle connection holds 2 threads until closed.
- `traffic.rs`: lock-free atomics for counters; `PREV` mutex only on `snapshot()`.
- `lib.rs` traffic emitter: one `std::thread` with `sleep(1000ms)`.
- `net.rs` is the only async piece (reqwest), awaited inside async Tauri commands.
- `sysproxy.rs` uses blocking `std::process::Command` (`gsettings`/`networksetup`) and blocking registry writes on whatever thread called the command.

### Tests present (all inside the slice files)
`httpproxy.rs` `mod tests` (644-814): `normalize_to_loopback`, `authority_parsing`, `absolute_target_parsing`, `host_header_parsing`, `find_head_end`, `route_connect_claims_doors_and_never_chains_into_itself`, `socks5_handshake_survives_first_byte_sniff` (full in-process SOCKS5 echo server), `socks5_dest_decoding`.
`sysproxy.rs`, `traffic.rs`, `net.rs`: no tests. Related-but-outside: `aether/status.rs` port tests, `aether/profiles.rs` bind-address validation tests.

## Links to other sections
- **BackendAetherCore / aether/**: `route_connect`, `claim`, `claim_psiphon_door`, `reserve_engine_*`, `engine_*_addr`, `is_claimed` are the bridge-side half of the connect flow; `traffic::reset()` and `sysproxy::disable_if_main()` are called throughout `aether/mod.rs` lifecycle/monitor code.
- **BackendTunIpChanger / tun+ip_changer**: `tun/forwarder.rs` feeds `traffic::record_tx/rx` (TUN stats share the same counters as the bridge); `ip_changer.rs` claims its Tor SOCKS door through `httpproxy::claim` and drives `sysproxy` with `SOURCE_IP_CHANGER`.
- **BackendProfilesPty**: `profile.bind_address` (default `127.0.0.1:1819`) is what `net::fetch_public_info` and `route_connect` consume.
- **FrontendConnUI / FrontendShell**: commands `set_system_proxy*`, `get_system_proxy_state`, `set_ip_proxy`, `get_traffic_stats`, `get_active_connections`, `get_public_ip` and event `aether://traffic` are their wire contract; `SystemProxyState.owner` values `"main"|"ip_changer"|"none"` are matched literally in `SystemProxyToggle.tsx:16`.
- **BuildPackaging**: Windows-only deps used here — `winreg`, `windows-sys` (WinInet + IpHelper + Threading).
