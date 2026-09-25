# Aether-GUI — Project Rundown

> Source-accurate navigation reference for agents working in `E:/Projects/Aether-GUI`. Assembled 2026-09-25 from 12 parallel deep-read reports plus firsthand orchestrator verification. Every claim below is grounded in a file read; doc-vs-repo cross-checks are resolved in §8. Where behavior belongs to the upstream Aether engine (not this repo) it is marked `[INFERENCE]`; genuinely unverifiable items are marked `[UNCERTAIN]`.
>
> Reading order: §1–8 orientation → Part B (frontend) / Part C (backend) by file → Part D (build, docs, tests, quirks).

## Part A — Orientation

### 1. What this repo is

Tauri 2 desktop GUI wrapper for the Aether censorship-circumvention tunnel. GUI-only: all tunnel/protocol logic lives upstream at github.com/CluvexStudio/Aether. Windows-first (Windows-only installers today), AGPL-3.0. **GUI version 1.18.0, pinned engine 2.1.0 — separate versions** (verified: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` all `1.18.0`; `src-tauri/aether-release.json` `2.1.0`).

Two processes:

1. **Frontend** — React 19 + TypeScript + Tailwind v4 + Zustand + Motion. Two HTML entries: `index.html` (main window), `log-window.html` (separate log window). Vite dev server pinned to port `1420` (`strictPort: true`, watcher ignores `src-tauri/**`).
2. **Backend** — Rust/Tauri 2 (`src-tauri/src/`), drives the real `aether` binary via `portable-pty`, plus subsystems: local HTTP/SOCKS bridge (`httpproxy.rs`), system-proxy switchboard (`sysproxy.rs`), Windows TUN mode (`tun/`), independent IP-Changer Tor bundle (`ip_changer.rs`).

### 2. Repo map (top level)

| path | role |
|---|---|
| `src/` | Frontend: `App.tsx` (root), `components/` (~85 incl. `ui/` shadcn primitives, `ip-changer/`), `state/connectionStore.ts`, `stores/ipChangerStore.ts`, `hooks/`, `lib/`, `types/`, `log-window.ts`, `index.css` |
| `src-tauri/src/` | Backend: `main.rs` (7-line shim → `lib.rs::run()`), `lib.rs` (setup + 53-command registry), `commands.rs`, `state.rs`, `events.rs`, `error.rs`, `tray.rs`, `focus.rs`, `history.rs`, `presets.rs`, `updater.rs`, `httpproxy.rs`, `sysproxy.rs`, `net.rs`, `traffic.rs`, `ip_changer.rs`, `childproc.rs`, `aether/` (mod, profiles, status, engine, pty, pty_output, pty_android, prompts, orphan), `tun/` (mod, route, dns, forwarder, cleanup, adapter) |
| `src-tauri/binaries/` | Engine staging: `fetch-aether.{py,ps1,sh}` + `test_fetch_aether.py`, gitignored `engine/` payload (`aether.exe` + `pt/`), committed `wintun.dll`, Tor expert bundle dirs `tor/<os>/<arch>/`, android assets, sample `aether*.toml` |
| `src-tauri/aether-release.json` | Pin: engine 2.1.0, asset names, SHA-256s — single source of truth for fetch/CI |
| `.github/workflows/build.yml` | CI (only workflow) |
| docs | `README.md` + `README_fa.md` (bilingual pair — README edits MUST mirror `README_fa.md`), `PRODUCT.md`, `DESIGN.md`, `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/releases/` |
| Tooling noise (not product) | `.claude/`, `.agents/`, `.impeccable/`, `.mimocode/`, `.github/{agents,skills,hooks}`, `skills-lock.json`, `rel210.json`, `*.log` |

**Repo rules that bind edits** (AGENTS.md): no code comments in any source file; README changes mirrored in README_fa.md; Vite port/strictPort untouched; never commit fetched engine payloads or identity `*.toml` files; do not read/copy/delete provisioned identity files during engine upgrade.

### 3. Startup & shutdown sequence

Verified firsthand: `src-tauri/src/main.rs` is `fn main() { aether_gui_lib::run() }`; all setup lives in `lib.rs:24-239`.

Builder plugins: `store`, `notification`, `shell`, `dialog`, `clipboard_manager`; `autostart` (non-Android) with `MacosLauncher::LaunchAgent`, arg `--minimized`. `.manage(AppState::default())`.

Setup order in `lib.rs`:

1. `app_data_dir()` — `create_dir_all`.
2. `aether::orphan::reap_orphan(&data_dir)` (line 40) — reap crashed engine processes from prior runs.
3. `#[cfg(windows)] tun::cleanup::reap_orphan_tun(&data_dir)` (line 42).
4. `focus::spawn_watcher` — window focus watcher (emits inline `app://focused`).
5. `tray::init(app)`.
6. `httpproxy::start()` — **failure aborts setup** (mapped to `tauri::Error::Io`).
7. `ip_changer::spawn_auto_rotate(handle, state.tor_manager.clone())`.
8. Background thread: traffic emitter (1 s tick, emits `aether://traffic` only while `Connected`).
9. Start-minimized gate: reads `settings.json` `minimize_on_startup` **AND** `close_to_tray` — both must be true → `window.hide()`.
10. Restore `window_position` `{x,y,width,height}` with sanity bounds (w,h > 100; −10000 < x,y < 20000).

Window events: `CloseRequested` → if `tray::get_close_to_tray()` then `prevent_close` + hide. `Moved|Resized` → persist `window_position` to `settings.json` (store saved immediately).

`RunEvent::Exit` → `aether::shutdown_blocking(&state.manager, &data_dir, app_handle)` then `ip_changer::shutdown_blocking(&state.tor_manager)`.

### 4. IPC command registry — 53 commands

Registration site is **`lib.rs:146-199`** (AGENTS.md/doc claims of "registered in `main.rs`" are imprecise — `main.rs` is a shim; see §8-21).

`commands::` (40): `connect`, `disconnect`, `send_input`, `get_status`, `get_default_profile`, `set_default_profile`, `get_close_to_tray`, `set_close_to_tray`, `set_always_on_top`, `get_always_on_top`, `get_history`, `get_history_paginated`, `get_diagnostics`, `clear_history`, `get_minimize_on_startup`, `set_minimize_on_startup`, `set_system_proxy`, `set_system_proxy_addr`, `get_system_proxy`, `get_system_proxy_state`, `set_ip_proxy`, `get_app_version`, `check_update`, `get_presets`, `save_preset`, `delete_preset`, `aether_binary_exists`, `get_engine_info`, `get_engine_tor_status`, `get_engine_psiphon_status`, `download_aether`, `read_file`, `write_file`, `save_window_position`, `get_window_position`, `is_tun_available`, `get_tun_active`, `get_public_ip`, `get_traffic_stats`, `get_active_connections`.

`ip_changer::` (13): `start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `get_tor_status`, `set_auto_rotate`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `set_tor_lan`, `get_tor_lan`, `get_tor_source`, `set_use_system_tor`.

Per-command semantics: §14 (lifecycle) and §15 (proxy/net/traffic). **6 registered commands have no frontend caller** (`get_history_paginated`, `get_diagnostics`, `set_system_proxy`, `get_system_proxy`, `aether_binary_exists`, `is_tun_available`) — see §22.

### 5. Events backend → frontend

Verified in `events.rs` (7 named constants) + one inline event:

| const in `events.rs` | wire name | payload |
|---|---|---|
| `STATUS_EVENT` | `aether://status` | `ConnectionState` (serde `tag = "state"`) |
| `LOG_EVENT` | `aether://log` | `LogEvent { line, timestamp }` |
| `TRAFFIC_EVENT` | `aether://traffic` | `TrafficStats { tx_bytes, rx_bytes, tx_rate, rx_rate }` — 1 s tick, only while Connected |
| `ENGINE_TOR_STATUS_EVENT` | `aether://tor-status` | `EngineTorStatus { enabled, ready, address }` |
| `ENGINE_PSIHON_STATUS_EVENT` | `aether://psiphon-status` | same shape (alias `EnginePsiphonStatus`) |
| `TOR_STATUS_EVENT` | `ip-changer://status` | IP-Changer Tor status |
| `TOR_LOG_EVENT` | `ip-changer://log` | IP-Changer log line |
| (inline, `focus.rs`) | `app://focused` | window focus/blur — not declared in `events.rs` |

### 6. Connection state machine

Verified firsthand in `state.rs` — **7 variants** (a draft report omitted `Connecting`; this list is authoritative):

`ConnectionState` (serde `tag = "state"`): `Idle` → `Launching` → `Connecting` → `Connected { socks_addr, bridge_addr, connected_at_ms }`; `Reconnecting { attempt, max_attempts }`; `Disconnecting`; `Error { message, phase }`.

`AppState { manager: Arc<Mutex<AetherManager>>, tun_manager: Arc<Mutex<TunManager>>, tor_manager: Arc<Mutex<TorManager>> }`.

Frontend gate: `status.state === "Connected"` (App.tsx). Backend ground truth for `'Connected'` = successful 300 ms TCP connect to the profile's primary local SOCKS listener (default `127.0.0.1:1819`, `aether/status.rs` `port_is_live` of `httpproxy::engine_addr()`) — **local listener readiness only, not end-to-end connectivity or leak protection**.

`AetherError` (`error.rs`, serialized as string): `AlreadyRunning`, `EngineIncompatible`, `SpawnFailed`, `PortInUse`, `NotConnected`, `ProxyConflict`, `Internal`.

Retry policy: `RETRY_BACKOFF = [2,5,10] s`, `MAX_AUTO_RETRIES = 3`; user-requested disconnect is never auto-retried.

### 7. Ports

| port | role |
|---|---|
| `127.0.0.1:1819` | primary SOCKS5 = "connected" probe, default chain target |
| `127.0.0.1:1820` | engine Tor secondary listener — chained Tor modes only; only-modes use primary |
| `127.0.0.1:1821` | engine Psiphon chained listener — chained Psiphon modes only |
| `9050` / `9051` | IP-Changer Tor SOCKS5 / control (independent expert bundle — never conflated with engine Tor) |
| `127.0.0.1:<ephemeral>` | HTTP/SOCKS bridge listen port handed to OS proxy settings |
| ephemeral | private engine/tor/psiphon pin ports (`free_loopback_ports`) |
| `1420` | Vite dev port (`strictPort: true` — do not change) |
| `1421` | `.claude/launch.json` alternate vite-session port (tooling only) |

### 7.1. Cross-cutting runtime facts

**Persistence.** Profile → `profile.json` (`last_successful_profile` key) — NOT settings.json; history → `history.json` / `connection_history` cap 20; presets → `presets.json` / `saved_presets` cap 10; settings/window → `settings.json` (tauri-plugin-store under app-data) keys `close_to_tray`, `minimize_on_startup`, `always_on_top`, `window_position`, `ip_changer_use_system_tor`. Frontend localStorage: `aether-theme`, `aether-custom-primary`, `aether-custom-secondary`, `aether:onboarded`, `aether-close-choice`, `aether-sound-enabled`, `aether-sound-volume`, `aether:palette:recent` (cap 3), `aether:palette:pinned` (no writer — §22). sessionStorage: `aether-update-checked`.

**Polling / emission cadences (ms).** monitor_connect 400, monitor_connected 500, disconnect 200, traffic emitter 1000 (event only while Connected), active-connections UI 2000, ProxyIndicator/TunIndicator 3000, public-IP poll 10000/30000.

**Retry / shutdown.** `RETRY_BACKOFF = [2,5,10] s`, `MAX_AUTO_RETRIES = 3`, `GRACEFUL_SHUTDOWN_GRACE = 3 s`; user-requested disconnect is never auto-retried.

**Connect timeout by scan mode (s).** Turbo 90, Balanced 150, Thorough 330, Verified 210, Ironclad 240.

**Log rings.** Main window 500 lines (100 ms batch), log window 2000 (independent re-subscription, no postMessage bridge), IP Changer 400; `BUDGET_RE = /budget=(\d+)s/`.

**Profile → engine transport.** No TOML is ever written (only `toml` hits = rejection tests): ~57 CLI flags via `as_args()` + `AETHER_*` env via `environment()` — full table in §17; proxy env stripped (`PROXY_ENV_KEYS`), `NO_PROXY=localhost,127.0.0.1,::1`; cwd = app-data; `--http-proxy` never emitted.

### 8. Verification log — all 27 doc-vs-repo cross-checks resolved

Report 12 flagged 27 claims; each was re-checked against source. Results (✅ = confirmed; ⚠ = doc problem):

1. ✅ Versions aligned across `package.json`/`tauri.conf.json`/`Cargo.toml` = `1.18.0`; engine `2.1.0` (`aether-release.json`).
2. ⚠ **`PRODUCT.md` stale**: lines 35/37/51 still say GUI `0.17.1`, engine `2.0.0`, repair path `engine-2.0.0/`.
3. ⚠ `docs/releases/v0.17.1.md` + `.claude/release-notes-v0.17.0.md` say engine 2.0.0 — historical but unmarked as historical.
4. ✅ "Connected" = TCP connect to primary SOCKS (`status.rs`), not log wording.
5. ✅ 1820/1821 are chained-only; only-modes use the primary listener.
6. ✅ IP Changer: 9050/9051, cookie auth, `SIGNAL NEWNYM`/`SIGNAL SHUTDOWN`, `socks5h` via ipwho.is/ipapi.co.
7. ✅ State machine `Idle→Launching→Connecting→Connected`, reconnect cap 3, user-stop never retried (7 variants, §6).
8. ✅ Actual UI string: `The tunnel dropped — getting you back · attempt ${attempt} of ${max_attempts}` (`ConnectionStatusLine.tsx:91`); README's "(attempt N of 3)" is a paraphrase.
9. ✅ Leak rule: `tunnel.ip === direct.ip → "leak"` (`connectionStore.ts:373`); strings "Leak detected — your real IP is visible" (`LeakBanner.tsx:23`), "Leak detected"/"Traffic secured" (`PublicLocation.tsx:49-51`).
10. ✅ TUN gated off: `DISABLED_MODES: CaptureMode[] = ["tun","both"]` (`CaptureModeSelect.tsx:22`); `tun/` is `cfg(windows)`.
11. ✅ sysproxy semantics (§15) + `--upstream` flag emission (§17). Transport semantics (SOCKS5 = all traffic; HTTP = MASQUE-over-H2 only) = upstream engine behavior → `[INFERENCE]`.
12. ✅ `minimize_on_startup` gating enforced backend-side (`lib.rs` step 9); frontend has no coupling.
13. ✅ Settings via `tauri-plugin-store` in `settings.json` under app data; window position persisted there.
14. ✅ Orphan reaps at startup: `aether::orphan` + `tun::cleanup`.
15. ✅ Engine repair installs `<app-data>/binaries/engine-2.1.0/`; candidate priority (versioned download → bundled → legacy bundle → dev → legacy download), PT companion required, `INSTALLING` gate needs `Idle|Error`.
16. ✅ Fetch helper validates sha256 / archive members / both executable archs / `--version`; stages complete payload into `binaries/engine/`.
17. ✅ `wintun.dll` in `tauri.conf.json:42` resources; identity TOMLs gitignored (`.gitignore:37` `src-tauri/binaries/*.toml`).
18. ✅ Vite port 1420 / `strictPort` / two HTML entries.
19. ✅ `AmbientBackground` = static radial-gradient + `.anim-orb-a/b`, `animationPlayState` paused on blur, no `backdrop-filter` on orbs. Note: `index.css` `.glass*` utilities DO use `backdrop-filter` — DESIGN.md's "zero backdrop-filter" is a policy claim, not a literal repo fact; phrase carefully.
20. ✅ `src/types/three.d.ts` = hand-written ambient `declare module "three"` (8-class shim) that shadows shipped `@types/three`. `[UNCERTAIN]` precedence vs `three@0.180` — no `tsc` run during this audit.
21. ✅ Command registration lives in `lib.rs:146-199`; `main.rs` is a shim — the AGENTS.md sentence "registered in `main.rs`" is imprecise.
22. ✅ `Verified` = serde alias `stealth` (Rust) + zod transform `stealth→verified` (frontend). "Ironclad does a real tunnel+HTTP probe" = upstream engine behavior → `[INFERENCE]`.
23. ✅ About dialog uses `get_app_version` / `get_engine_info`; no hardcoded core version in UI.
24. ✅ History `ConnectionEntry { protocol, scan_mode, timestamp, duration_secs, success }`, cap 20, `clear_history` available.
25. ✅ Auto-rotate UI `MINUTE_OPTIONS = [1,2,5,10,15,30,60]` minutes (`AutoRotateSettings.tsx:7`); backend clamps 60..=86400 s (wider than UI).
26. ✅ Bundle targets `"all"`: dmg/AppImage/deb/rpm/setup.exe/msi under `src-tauri/target/**/bundle/`.
27. ✅ Test counts measured directly: **92 `#[test]` fns, 1 `#[ignore]` → 91 runnable** Rust + **10 Python** (`test_fetch_aether.py`). Release notes' "85 Rust tests" = stale. `npm run build` = `tsc -b && vite build`.

## Part B — Frontend

React + TypeScript on Vite 7 (Tailwind v4 CSS-first, shadcn/ui on single `radix-ui`, Zustand, `motion/react`, sonner, `cuelume`, three.js). §9 shell · §10 lib · §11 connection UI + stores · §12 chrome/settings · §13 visuals. IPC §4, events §5, ports/persistence §7.1.

### 9. Shell & entry points

One main SPA webview plus a second independently-subscribed log webview; `App.tsx` owns theme bootstrap, listener install, the squircle shell and five lazily-loaded panels behind a permanent "Tunnel" screen — no tab router.

| path | role | key symbols / notable lines |
|---|---|---|
| `vite.config.ts` | build/dev | `input { main, "log-window" }`, `manualChunks` → `three`/`motion`/`radix`, dev `port:1420, strictPort:true` |
| `index.html` / `src/main.tsx` | entry | `<title>Aether-GUI</title>`, one `#root`; `initSound()` → `createRoot` → `<App/>` |
| `src/App.tsx` | root (342 ln) | `App`, `AccordionPanel = PanelId \| null`, private `MainScreen`, theme effect, `useSquircleClip()` |
| `log-window.html` | log doc | `<title>Aether - Live Log</title>`; viewport/search/clear/close/badge ids |
| `src/log-window.ts` | log script (no React) | `listen("aether://log"/"aether://status")`, `MAX_LINES = 2000`, badge `#4ade80`/`#f87171`/`#fbbf24`/`#fb923c` |
| `src/state/windowFocus.ts` | focus store | `useWindowFocused()` ← `app://focused` + `onFocusChanged` |
| `src/lib/log-window.ts` | log opener | `LOG_WINDOW_LABEL = "log-window"`; `{ url:"/log-window.html", title:"Aether - Live Log", width:860, height:560, minWidth:400, minHeight:300, decorations:false, transparent:false, backgroundColor:"#09090b", dragDropEnabled:false }`; `isVisible()`→`setFocus()` |
| `src/index.css` | tokens | §13 |

**Bootstrap.** `App()` hooks: `useKeyboardShortcuts`, `useConnectionSound`, `useIpChangerSound`, `useWindowPersist`, theme `useLayoutEffect` (`localStorage["aether-theme"]`, `"system"`→`matchMedia`+listener → `.dark`/`.light` + `applyColors`), `initConnectionListeners`+`initIpChangerListeners`, `useSquircleClip`. Tree: `TooltipProvider > Toaster > MotionConfig(reducedMotion="user") > div.window-shell > (CloseDialog, AmbientBackground, TitleBar, screen)`; `AnimatePresence` swaps `MainScreen` ↔ `SidecarErrorScreen` (retry `retryAfterSidecarError()`+`connect()`).

**MainScreen** top→bottom: skip-link `<a href="#main">` + `NotificationBanner` → hero `ConnectButton` → `#main`: `LeakBanner` (`leakStatus==="leak" && Connected`), `ConnectionStatusLine`, `PublicLocation` (keyed remount per connect), `TrafficStats`, connected-only `CopyProxyButton`+`PacUrl`, `QuickConnect`, `QuickProtocol` → footer `AppMenu` + `⌘K` + `shortcuts ?` → overlays: active-apps `Dialog`, `CommandPalette`, `OnboardingTour`, `ShortcutsDialog`, five `PanelDialog`s; polls `refreshActiveConns()` every **2000 ms** while `Connected`.

**Panels** — `type PanelId = "advanced" | "presets" | "ipchanger" | "history" | "settings"` (`AppMenu.tsx:9`); each `lazy()` + `Suspense`/`PanelSkeleton` + `ErrorBoundary onReset=closePanel`:

| id | lazy import → content | icon / title |
|---|---|---|
| `advanced` | `@/components/AdvancedPanel` → `AdvancedPanelContent` | `Settings2` / "Advanced" |
| `presets` | `@/components/ProfilePresets` → `ProfilePresetsContent` | `Bookmark` / "Presets" |
| `ipchanger` | `@/components/ip-changer/IpChangerPanel` → `IpChangerContent` | `Globe` / "IP Changer" |
| `history` | `@/components/ConnectionHistoryContent` → `ConnectionHistoryContent` | `Clock` / "History" |
| `settings` | `@/components/SettingsPanel` → `SettingsContent` | `Settings` / "Settings" |

**Event bus** (no shared context): `aether:toggle-palette` (⌘K/Ctrl+K), `aether:open-shortcuts` (`?`/⌘/Ctrl+/ when not typing; `ShortcutsDialog.tsx:16`), `aether:request-close-dialog` (`CloseDialog.tsx:25` → §12).

**Window glue.** `useWindowPersist`: restore when `x>=-100 && y>=-100 && w>100 && h>100`, save debounced **500 ms**; `useSquircleClip`: native `corner-shape` else JS `clip-path`. `tauri.conf.json`: `420×640`, `minWidth 320`, `minHeight 400`, `center/decorations:false`, `transparent true`, `shadow false`; drag via `data-tauri-drag-region`. `openLogWindow()` re-subscribes — no `postMessage`, no shared store.

### 10. Lib, hooks, validators, types

The IPC-free half: validation, formatting, theme math, motion/sound constants, hooks wiring stores to the DOM.

| path | role | key symbols / notable lines |
|---|---|---|
| `lib/validators.ts` | validation | `connectionProfileSchema`, `profileShape`, `validateActiveProfile`, ~10 `validate*` |
| `lib/profile-defaults.ts` | defaults | `defaultConnectionProfile()`; `supportsFirewallMark()` = `/linux/i.test(navigator.platform) \|\| /android/i.test(navigator.userAgent)` |
| `lib/theme.ts` | accent | `PRIMARY_COLORS`, `applyColors()`, `initThemeColors()` |
| `lib/sound.ts` + `lib/toast.ts` | sound | `SOUND_ENABLED_KEY`/`SOUND_VOLUME_KEY`, `DEFAULT_ENABLED = true`, `DEFAULT_VOLUME = 0.5`, `cuelume@0.2.2` |
| `lib/motion.ts` | springs | `SPRING` (400 ms), `SPRING_FAST` (250 ms), `SPRING_SHEET`, `SPRING_HERO`, `FADE_UP`, `SCREEN_FADE` |
| `lib/close.ts` | close | `CLOSE_DIALOG_REQUEST_EVENT`, `CLOSE_CHOICE_KEY = "aether-close-choice"`, `handleClose()`, `syncCloseChoice()` |
| `lib/location.ts` / `format.ts` / `utils.ts` | helpers | `COUNTRY_NAMES` (112 ISO2), `formatBytes`/`formatRate`, `cn()` |
| `hooks/usePaletteItems.ts` | palette (27.5 KB) | `usePaletteItems`, `wrapRun`, `openAdvanced`, `RECENT_KEY`/`PINNED_KEY` |
| `hooks/useKeyboardShortcuts.ts` | keys | below |
| `hooks/useConnectionSound.ts` / `useIpChangerSound.ts` | cues | skip no-op + hidden tab |
| `hooks/useLocked.ts` | gate | `state !== "Idle" && state !== "Error"` (inlined 4×, §11) |
| `hooks/useWindowPersist.ts` / `useSquircleMask.ts` | §9 | exports **`useSquircleClip`** (file≠export) |
| `types/connection.ts` | domain | `ConnectionProfile` (61 fields), `ConnectionStatus` (§6), `LogLine`, `PublicInfo`, `ConnectionHistoryEntry`, `ActiveConn`, `TrafficStats` |
| `types/ipChanger.ts` / `engine.ts` | Tor/engine | `TorStatus` = `Stopped\|Starting\|Running\|Stopping\|{Error,message}`; `EngineInfo { version, expected_version, compatible, … }` |
| `types/three.d.ts` | ambient | `declare module "three"` (8 classes); `[UNCERTAIN]` precedence vs `@types/three` |

**Validators** (verbatim): `socketMessage = "Use numeric IP:port (bracket IPv6), port 1–65535"` — shared by `bindAddressSchema`, `httpProxyAddressSchema`, `engineTorBindSchema` (**alias of bind**, `:165`, blank OK). Then `upstreamSchema` → `Invalid upstream proxy`; `wiwPeersSchema` → `Provide one or two numeric IP:port endpoints with different IP addresses`; `mimPeersSchema` → `Use 'auto' or one or two numeric IP:port endpoints with different IP addresses`; `dnsServersSchema` → `DNS entries must not contain spaces`; `routeRuleSchema` → `Rules can't contain spaces — separate entries with commas or new lines.`; `ztTeamSchema` → `Team name must not contain spaces`; `fwMarkSchema` → `Mark must be 0..4294967295 or 0x hex`; `countrySchema` → `Country must be 2-letter code`; `validateRouteSniffMs` → `Must be ≥ 0` / `Must be ≤ 10000`; `validateUint32` → `Must be an integer from 0 to 4294967295`.

**Profile assembly.** `profileShape`: `scan_mode` `stealth`→`verified`, engine modes hyphenate (`tor_reverse`→`tor-reverse`); `connectionProfileSchema = z.preprocess(…, profileShape)` merges defaults **minus** `protocol`/`scan_mode`/`ip_version`. `validateActiveProfile(p)` order: (1) listeners `bind_address` + non-blank `http_proxy_address` + `engine_tor_bind` (`127.0.0.1:1820` for `tor`/`tor-reverse`) + `engine_psiphon_bind` (`127.0.0.1:1821`) → `` `${name}: ` + socketMessage `` or `` `${name} conflicts with ${other.name}; choose separate listener addresses/ports` ``; (2) verbatim engine strings `tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`, `psiphon-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`, `psiphon-only cannot be combined with engine Tor — both claim the primary listener`, `tor-only cannot be combined with engine Psiphon — both claim the primary listener`, `tor-reverse and psiphon-reverse cannot both run — each needs MASQUE as its sole outer tunnel`; (3) peer/mark/sniff → `` `${field}: ${error}` ``; (4) TUN address/DNS; (5) `Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled` + `engine_tor_relays: use auto, only, off, or a number`; (6) `psiphon_region`; (7) `exit_loc: comma-separated two-letter country codes, optional leading ! (e.g. "DE,SE,!IR")`; (8) uint32 fields (`route_sniff_ms`, `max_clients`, `stats_secs`, …).

**Defaults** (`defaultConnectionProfile()`): `protocol "auto"`, `scan_mode "turbo"`, `ip_version "v4"`, `quick_reconnect true`, `masque_http2 false`, `masque_noize "firewall"`, `wg_noize "balanced"`, `bind_address "127.0.0.1:1819"`, `capture_mode "proxy"`, `dns_mode "forward"`, `tun_address "10.0.0.2/24"`, `tun_dns "8.8.8.8"`, `route_sniff true`, `auto_reprovision true`, `mim false`, `quic_v2 true`, `engine_tor_mode "disabled"`, `engine_psiphon_mode "disabled"`, `psiphon_shape "auto"`, `stats false`, rest `null`/`[]`. Engine semantics `[INFERENCE]`.

**Shortcuts** (one `window keydown`): `Ctrl+Shift+C` → `connect()` unless `Connected/Connecting/Reconnecting/Launching`, `disconnect()` on `Idle/Error`; `Meta+K`/`Ctrl+K` → `aether:toggle-palette`; `?` or `Meta+/`/`Ctrl+/` (target not `INPUT`/`TEXTAREA`/contentEditable) → `aether:open-shortcuts`.

**Palette**: `PaletteItem = { id, label, hint?, keywords?, group, icon, run }`; `RECENT_KEY = "aether:palette:recent"` cap **3**, `PINNED_KEY = "aether:palette:pinned"` **no writer** → synthetic `Pinned` group inert (§7.1); ids `panel-*` (§9 five), `action-*`, `tuning-*` (Fast/Balanced/Secure/Verified; `ironclad` only when active, `run` **no-op**), `field-*`→`openAdvanced`, `settings-theme`, `tor-*`. Gating toasts `Disconnect first to change IP version` / `…transport` / `…this setting`.

**`PRIMARY_COLORS`**: `#f2711c` Orange, `#ea580c` Deep Orange, `#dc2626` Red, `#e11d48` Rose, `#a855f7` Purple, `#6366f1` Indigo, `#3b82f6` Blue, `#06b6d4` Cyan, `#14b8a6` Teal, `#22c55e` Green, `#84cc16` Lime, `#eab308` Yellow.

**Dead exports (grep-verified)** → §22: `validators.hostPortRegex`/`hostRegex`/`validateProfile`, `theme.getLastColors`, `motion.SPRING_SHEET`/`SPRING_HERO`/`FADE_UP`, `recordPaletteRecent`.

### 11. Connection UI & stores

Two Zustand stores + ~32 components; config controls read `s.profile.<field>`/write `s.set<Field>`, disabled by `locked` (`state` not `Idle`/`Error`). Store defaults: `status {state:"Idle"}`, `logs []` (500), `publicIpHistory []` (last **20**), `leakStatus "unavailable"` (`"none"|"leak"|"unavailable"`), `history []`, `traffic null`, `activeConns []`.

| path | role | key symbols / notable lines |
|---|---|---|
| `state/connectionStore.ts` | store (506 ln) | `initConnectionListeners`, `createPersistSetter` → **500 ms** persist → `set_default_profile`, ~90 setters, `BUDGET_RE = /budget=(\d+)s/`, `MAX_LOG_LINES = 500`, `window.__conn` |
| `stores/ipChangerStore.ts` | Tor store (285 ln) | `initIpChangerListeners()`, `MAX_LOG_LINES = 400`, `BOOT_RE = /Bootstrapped (\d+)% \((\w+)(?:\|\))/` |
| `ConnectButton.tsx` | hero | ARIA `Connect`/`Cancel connecting`/`Disconnect`/`Retry connection`, `Ctrl+Shift+C`, `cue("pulse")`, lazy `MagicRings` |
| `ConnectionStatusLine.tsx` | status text | `useElapsed`, `scanPercent = min(99, round(attemptSeconds/scanBudgetSecs*100))`, 44×4 px bar |
| `LeakBanner.tsx` | leak alert | `Leak detected — your real IP is visible` (:23); `Disconnect now`/`Re-check` |
| `SidecarErrorScreen.tsx` | engine failure | `Aether engine failed to start`; `/binary not found\|engine incompatible/i` → `Install / repair Aether` → `download_aether` |
| `PublicLocation.tsx` + `CountryFlag.tsx` | exit-IP pill | `runPublicIpCheck` per connect transition; flags via `import.meta.glob("country-flag-icons/3x2/*.svg")` |
| `CopyProxyButton.tsx`, `PacUrl.tsx` | copy | null unless `Connected`; `addr = "bridge_addr" in status ? status.bridge_addr : "127.0.0.1:1819"`; label swap 1500 ms |
| `TrafficStats.tsx`, `ActiveConnections.tsx` | widgets | no I/O; `aria-live="polite"`; 6 rows / 32 expanded |
| `QuickConnect.tsx`, `QuickProtocol.tsx` | pills | Fast→`turbo`, Balanced→`balanced`, Secure→`thorough`, Verified→`verified`; `ironclad→"Secure"` |
| mode pickers (`ProtocolSelect`, `ScanModeToggle`, `IpVersionToggle`, `MasqueTransportToggle`, `NoizeProfileToggle`, `PerfSelect`, `LogLevelSelect`, `DnsModeSelect`, `CaptureModeSelect`) | selects | `cue("scan")`; `auto`→`null` sentinels; Masque locked for `wireguard`/`gool` |
| field inputs (`BindAddressField`, `HttpProxyAddressField`, `UpstreamProxyField`, `TunnelDnsField`, `MimPeersField`, `WiwPeersField`, `MarkField`, `RouteRulesField`, `RouteSniffMsField`) | text | `onBlur` validate, error clears **2500 ms**; `DEFAULT_PORT="1819"`, `LOOPBACK`, `ANY`; `MarkField` off Linux/Android |
| `AdvancedPanel.tsx` + `EngineTorPanel`, `PsiphonPanel`, `ZeroTrustPanel` | Advanced | 8 sections; `profileValidationError ?? "Some fields have errors — fix them before connecting"`; `send_input` |
| `ProfilePresets.tsx` | presets | `get_presets`/`save_preset`/`delete_preset`; apply → `toast.success('Applied "<name>"')`; `No presets yet` |
| `SystemProxyToggle.tsx` | OS proxy | `get_system_proxy_state`; `enabled = s.enabled && s.owner === "main"`; `set_system_proxy_addr { addr, enabled }` |
| `VirtualLogList.tsx` + `LogSearch.tsx` | in-panel log | `@tanstack/react-virtual` (18/12); export → `write_file`; `role="log"` |
| `ConnectionHistoryContent.tsx` | History | `Success {rate}%`, `Avg time`, `Top {protocol}`; CSV `timestamp,protocol,scan_mode,duration_secs,success\n`; `Delete all history?` |
| `ip-changer/` (8 files) | Tor panel | below |

**Connect flow.** `connect()` → schema parse + `validateActiveProfile`; failure → `{ state:"Error", message, phase:"validation" }`, **no IPC**; else `invoke("connect", { profileOverride })`. Rejections: `/binary not found|engine incompatible|engine_incompatible/i` → `sidecarError` (full-screen), `/already running/i` → swallowed. `Reconnecting{attempt,max_attempts}` (§6): `` `The tunnel dropped — getting you back · attempt ${status.attempt} of ${status.max_attempts}` `` (`ConnectionStatusLine.tsx:91`); backoff backend-side (§7.1).

**Status map**: Idle `Disconnected`/`Click to connect`; Launching `Starting Aether…`/`Answering setup prompts`; Connecting `Finding a route…`/`Still searching · <elapsed>[ · <pct>%]`; Reconnecting `Reconnecting…`/string above; Connected `Connected`/`""`; Disconnecting `Disconnecting…`; Error `Couldn't connect`/`status.message` (secondary `role="alert" aria-live="assertive"`, plus `Try Verified mode`, `View log`).

**Leak.** `runPublicIpCheck` single-flight; two parallel `invoke<PublicInfo|null>("get_public_ip", { throughTunnel })`; `connectionStore.ts:373`: `leakStatus = direct ? (tunnel.ip === direct.ip ? "leak" : "none") : "none"` (only `if (connected && tunnel)`, else `"unavailable"`). `PublicLocation`: `Checking location…`/`Location unavailable`; shield `Leak detected`/`Traffic secured`/`Disconnected`/`Check pending`.

**Controls.** `CaptureModeSelect`: `const DISABLED_MODES: CaptureMode[] = ["tun", "both"]` (`:22`) — **only `proxy` selectable** though type + backend accept all three; TUN elevation never frontend-handled `[INFERENCE]`. `AutoRotateSettings`: `const MINUTE_OPTIONS = [1, 2, 5, 10, 15, 30, 60]` (`:7`), `aria-label="Auto-rotate Tor identity"`, `disabled={!running}`, fallback `5`, labels `{m} minute{m===1?"":"s"}`.

**Cadences** (global §7.1): active-conn **2000 ms**, `ProxyIndicator`/`TunIndicator` **3000 ms** (TunIndicator unmounted → §22), IP poll **10000/30000 ms** hidden, profile persist **500 ms**, log flush **100 ms**. Rings: main **500**, log window **2000**, ip-changer **400**.

**ipChangerStore defaults.** `status "stopped"` (`stopped|starting|running|stopping|error`), `rotationCount 0`, `autoRotateEnabled false`, `autoRotateIntervalSecs 60`, `socksAddr {host:"127.0.0.1",port:9050}`, `lanEnabled/ipProxyEnabled false`, `torEngine {using_system:false,bundled_available:true,system_available:false}`.

| action | invoke(s) | notes |
|---|---|---|
| `start()`/`stop()` | `start_tor`/`stop_tor` | wrapped in `transitioning` |
| `rotate()` | `rotate_ip` | `rotationCount+1`, `refreshIp` after 4000 ms |
| `refreshIp()` | `get_current_ip` | probe `[tor] exit IP not reachable yet (tor bootstrapping {p}%)` |
| `setAutoRotate`/`setLan` | `set_auto_rotate { intervalSecs, enabled }`, `set_tor_lan { enabled }`→`get_socks_addr` | |
| `setIpProxy`/`setTorEngine` | `set_ip_proxy { enabled }`, `set_use_system_tor { useSystem }` | return `string \| null` |
| `refreshAll()` | `get_tor_status`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `get_tor_lan`, `get_system_proxy_state`, `get_tor_source` | `Promise.all`; `ipProxyEnabled = proxy?.owner === "ip_changer"` |

Events: `ip-changer://status` → `mapStatus` (`Running→running` … `Error→error`+message; `Stopped`/`Error` clear IP/bootstrap); `ip-changer://log` → 400-line ring + `BOOT_RE`; `percent>=100 && running` → `refreshIp()`.

**IP-changer components.** `IpChangerContent`: `refreshAll()` once, IP poll `document.hidden ? 30000 : 10000` re-armed on `visibilitychange`. `StatusIndicator` `Stopped`/`Starting…`/`Running`/`Stopping…`/`Error`; `IpDisplay` bootstrap bar + `never rotated yet`/`rotated N min ago`/`new identity ×{n}`; `RotationControls` `Start Tor`/`Stop`/`Rotate IP`; `ProxyEndpointSettings` `${host}:${port}` + LAN `title="Applies on next start"`; `IpProxyToggle` `aria-label="Set Windows system proxy to Tor SOCKS"`; `LogViewer` copy via `navigator.clipboard.writeText`, empty `No output yet`.

### 12. Chrome & settings UI

Title bar, menu, ⌘K palette, dialogs, Settings tree, and three settings-persistence patterns (local+IPC, Zustand profile, localStorage-only).

| path | role | key symbols / notable lines |
|---|---|---|
| `TitleBar.tsx` | header | `data-tauri-drag-region`; uptime `hh:mm:ss` from `status.connected_at_ms`; `Minus`→`cue("droplet")`, `Maximize2`→`toggleMaximize()`, `X`→`handleClose()` |
| `AppMenu.tsx` | `Options · 5` popover | exports `PanelId` (`:9`); 5 hardcoded `ITEMS`, footer `Press ⌘K to search` |
| `CommandPalette.tsx` | ⌘K dialog | `fuzzyScore` (word boundary, `startsWith` +6); ARIA `combobox`/`listbox` (`#palette-listbox`)/`option`; placeholder `Search settings, presets, actions…`; footer `↑↓ navigate · ↵ open` + `N results` |
| `SettingsPanel.tsx` | sections | `SettingsContent()` = real UI (rows below); export `SettingsPanel({open,onToggle})` **voids props**, never imported → §22 |
| `SettingsIO.tsx` | export/import | `SettingsExport { version:1, profile, presets, settings:{close_to_tray, always_on_top, minimize_on_startup} }`, file `aether-gui-settings.json`, diff max **80** rows, Apply → `set_default_profile`+`reloadProfile()`+`save_preset`+`SETTING_COMMANDS`, Undo = profile only; `SETTING_COMMANDS` (:27-31): `close_to_tray`→`set_close_to_tray`+`syncCloseChoice(v)`, `always_on_top`→`set_always_on_top`, `minimize_on_startup`→`set_minimize_on_startup` |
| `AboutDialog.tsx` | About | `get_app_version`/`get_engine_info`; `not installed` + ` (needs v{expected_version})`; links `github.com/MatinSenPai/Aether-GUI`, `github.com/CluvexStudio/Aether`, `github.com/FreaksLxss/Aether-GUI-Next`; `Licensed under AGPL v3.0` |
| `ShortcutsDialog.tsx` | shortcut sheet | listens `aether:open-shortcuts`; rows `⌘K / Ctrl+K`, `Ctrl+Shift+C`, `Esc`, `? · ⌘/`, `Enter` |
| `CloseDialog.tsx` | close chooser | listens `aether:request-close-dialog`; `Minimize to tray`→`set_close_to_tray(true)`+`hide()`; `Close completely`→`set_close_to_tray(false)`+`close()`; persists `aether-close-choice` |
| `OnboardingTour.tsx` | first run | skipped when `aether:onboarded==="1"` or `history.length>0`; 900 ms → `Hit Connect` / `Fine-tune in Advanced` / `Press ⌘K to search` |
| `UpdateChecker.tsx` | update | once/session via `sessionStorage["aether-update-checked"]`; `check_update` → `UpdateInfo { available, latest_version, current_version, download_url }`; `Update available: v{latest_version}` + `Download`/`Dismiss`; errors swallowed |
| toggles: `AlwaysOnTopToggle`, `MinimizeOnStartupToggle`, `CloseToTrayToggle`, `AutoStartToggle`, `SoundSettings` | rows | hydrate then optimistic `set` with rollback; `render null` until loaded |
| `ThemeToggle.tsx`, `ColorTheme.tsx` | appearance | theme → `aether-theme`; accent → `aether-custom-primary`/`-secondary` (§10, §13) |
| `ErrorBoundary.tsx` / `PanelDialog.tsx` | boundary/shell | `[ErrorBoundary:<label>]`, `onReset` closes panel; `Something went wrong` + `Try again`; `bg-transparent` overlay, backdrop click only when `e.target===e.currentTarget`, empty `{}` at :30,:36 |
| `ui/` (22 files) + `components.json` | shadcn | `style "radix-nova"`, `baseColor "neutral"`, `iconLibrary "lucide"`; list below |

**ui/**: `button` (`cva`, `data-cuelume-press`), `input`, `textarea`, `badge`, `switch` (`data-cuelume-toggle`), `toggle`, `toggle-group`, `slider`, `dialog` (`bg-black/30 backdrop-blur-xl`, `cue("page")`), `popover`, `select`, `alert`, `inline-alert` (`InlineErrorBanner`; "Copy diagnostics" = profile JSON + last 50 log lines), `separator`, `collapsible`, `progress`, `scroll-area`, `tooltip` (`delayDuration=300`), `segment`, `sonner` (Toaster `top-center`/40/dark), `panel-section` (`FieldRow.tooltip` never rendered), `panel-skeleton`.

**Settings rows** (order): **System**(`Monitor`) — Always on top `get_always_on_top`/`set_always_on_top { enabled }`; Launch at startup `@tauri-apps/plugin-autostart` `isEnabled()`/`enable()`/`disable()`; Start minimized `get_minimize_on_startup`/`set_minimize_on_startup`; Minimize to tray `get_close_to_tray`/`set_close_to_tray` + `syncCloseChoice()` → `aether-close-choice`. **Network**(`Network`) — Capture mode `capture_mode`/`setCaptureMode` (only `proxy`); System proxy (if `capture_mode ∈ {proxy,both}`) `get_system_proxy_state`/`set_system_proxy_addr { addr, enabled }` gated `owner === "main"`; DNS (if `capture_mode !== "proxy"`) `dns_mode`/`setDnsMode`. **Appearance**(`Palette`) — theme, accent, Export/Import (`SettingsIO`). **Sound**(`Volume2`) — Enable + volume 0–1 step 0.01 → `aether-sound-enabled` (`"true"`), `aether-sound-volume` (`0.5`). **About**(`Info`) — About, Check for updates.

**Dialog triggers**: `ShortcutsDialog`←`aether:open-shortcuts`; `CloseDialog`←`aether:request-close-dialog`; `CommandPalette`←`aether:toggle-palette`; five `PanelDialog`s←`AppMenu`/palette; active-apps `Dialog`←`TrafficStats`; `AboutDialog`←Settings→About. Start-minimized vs minimize-to-tray independent in frontend; only `CloseToTrayToggle`/`SettingsIO` sync localStorage↔backend `[UNCERTAIN: Rust-side coupling]`; tray interplay backend (`tray.rs`, §4).

### 13. Visual system, theme & index.css

Static ambient gradients, lazy three.js rings, accent system, Tailwind v4 token layer; light mode = variable swaps with no functional `light:` variant.

| path | role | key symbols / notable lines |
|---|---|---|
| `AmbientBackground.tsx` | backdrop (43 ln) | `aria-hidden z-0` radial gradient + `.anim-orb-a`/`.anim-orb-b` (10/13 s, `opacity .11/.06`); pauses on blur; no `backdrop-filter` |
| `MagicRings.tsx` | connect anim (276 ln) | three.js WebGL2 shader plane, `lazy()` on `phase==="connecting"`; `const float HP = 1.5707963;`, `CYCLE = 3.45`, 10 rings; needs `capabilities.isWebGL2` |
| `ColorTheme.tsx` | accent picker (184 ln) | 12 primary swatches (§10) + 8 secondary + `<input type="color">` + Reset → `aether-custom-primary`/`-secondary` |
| `src/index.css` | tokens (492 ln) | Tailwind v4 CSS-first (no `tailwind.config.js`); imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/{inter,jetbrains-mono,geist}` |
| `log-window.html` inline `<style>` | log theme | separate palette, below |
| `DESIGN.md` | policy | divergences below |

**Tokens.** `@custom-variant dark (&:is(.dark *))` (`:8`) is the only custom variant. `@theme inline`: `--font-sans "Geist Variable"`, `--font-mono "JetBrains Mono Variable"`, `--color-surface-1..4`, `--color-status-*`, `--shadow-glass`. Dark `:root`: `--background #0d0d0f`, `--foreground #f4f4f3`, `--card #19191c`, **`--primary #ea580c`** (`:71`, `:151`), `--muted-foreground #9f9fa3`, `--border/--input rgba(255,255,255,0.07)`, `--surface-1 #131316`…`--surface-4 #28282e`, status `--status-{connected,connecting,error,idle} #2dd4bf/#f2711c/#ef4444/#6b6b70`. Light `:root.light`: `--background #f4f4f3`, `--card #ffffff`, `--border rgba(0,0,0,0.07)`, surfaces `#ffffff`…`#dddcd8`, status `#0d9488/#ea580c/#dc2626/#9ca3af`. Glass `--glass-blur 20px`, `--glass-saturate 1.35` (neutralized by `prefers-reduced-transparency`). Base: `corner-shape: squircle`, transparent `body`, `overflow:hidden` root.

**Utilities.** Light repairs `.light .bg-background`/`.text-foreground`/`.bg-surface-2`/`.text-muted-foreground`/`.ring-white/5`; `.window-shell` (100dvh, per-corner radii); `.glass*` **do use** `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))` (`:262,:268,:274`) — DESIGN.md's "zero `backdrop-filter` in the entire app"/"Don't reintroduce `backdrop-filter`/glass" is policy, not fact; `.text-balance`, `.transition-smooth` 200 ms, `.hover-lift`, `.active-press`. Durations 4.5/1.6/1.2/10/13/0.22 s (`ring-breathe`…`log-in`). Gradient: `radial-gradient(110% 72% at 50% -8%, color-mix(in srgb, var(--color-primary) 9%, transparent) 0%, transparent 62%)`.

**`light:` is inert (verified).** No `@custom-variant light` in `src/` or `shadcn`/`tw-animate-css`/`tailwindcss`; `dist/assets/main-CiShDdCj.css` has **0** `light\:` selectors — yet `App.tsx:163` uses `light:bg-white light:shadow-lg` and other components use `light:border …`. Real light mode = `:root.light` swaps + `.light .…` repairs.

**Two palettes.** Log window `log-window.html:19` → `--primary: #6366f1` (indigo, `--accent #818cf8`); main app `--primary: #ea580c` in both themes — the webviews never share a primary. Log window owns `--bg-0 #09090b`…`--bg-3 #1e1e22`, `--text #fafafa`, `--text-dim #a1a1aa`.

**Motion/a11y.** `MotionConfig(reducedMotion="user")`; `prefers-reduced-motion: reduce` disables `ring-breathe`, `orb-a`, `orb-b`, `scan-sweep`, `log-in`. DESIGN.md's `:lang(fa)` guard is **unimplemented — no `:lang(fa)` rule in `src/`** (only `DESIGN.md`/critique files); `src/index.css` is authoritative over DESIGN.md prose.

**Exported but unmounted** (repo search = defining file only; §22): `TunIndicator` — 3 s `get_tun_active` badge (`title="TUN adapter active — capturing all traffic"`), **never mounted, so `get_tun_active` is effectively never invoked** (grep-verified; not a live poller); `ConnectionInfo` (`SCAN_LABELS`, `IP_LABELS`, `showTun = capture_mode ∈ {tun,both}`); `GlassAccordion`; `ConnectionHistory.tsx` 2-line barrel (App imports `ConnectionHistoryContent`); `IpChangerPanel`, `AdvancedPanel`, `ProfilePresets` wrappers **discard `{open,onToggle}`** — App imports their `*Content` exports (§11).

---

## Part C — Backend

Rust half of `src-tauri/`: lifecycle + IPC (§14), proxy/leak-check (§15), engine core (§16), profile->CLI + PTY (§17), TUN + IP Changer (§18). Part A `§3`-`§8` = repo map, startup, command registry, events, state machine, ports, versions; UI `§9`/`§11`; tests `§21`; dead code `§22`.

### 14. Lifecycle, state & core IPC

Builder, setup/exit hooks, shared `AppState`, IPC handlers outside Aether/TUN/IP-Changer. camelCase args; commands return `Result<T, AetherError>` as Display -> 3 s toast (`§9`).

| path | role | key symbols / notable lines |
|---|---|---|
| `src-tauri/src/main.rs` | shim | -> `aether_gui_lib::run()` |
| `src-tauri/src/lib.rs` | builder, hooks, registry | `reap_orphan` :40, `reap_orphan_tun` :42, focus/tray/httpproxy :43-45, traffic :55-70, minimize gate :87-110, `generate_handler!` :146-200, `.on_window_event` :201-225, `RunEvent::Exit` :228-237 |
| `src-tauri/src/state.rs` | shared handles | `AppState { manager, tun_manager, tor_manager }`; `ConnectionState` = `§6` |
| `src-tauri/src/commands.rs` | history/presets/settings/window/updater IPC | :17-434 |
| `src-tauri/src/events.rs` | payloads, clock | `EngineTorStatus { enabled, ready, address }`, `EnginePsiphonStatus` alias, `LogEvent`, `now_millis()` |
| `src-tauri/src/error.rs` | error Display | 7 variants |
| `src-tauri/src/history.rs`, `presets.rs` | stores | `MAX_ENTRIES = 20`, `MAX_PRESETS = 10` |
| `src-tauri/src/tray.rs`, `focus.rs` | tray, focus | `CLOSE_TO_TRAY`, ids `show`/`quit`; `app.emit("app://focused", bool)` 1000 ms |
| `src-tauri/src/updater.rs` | update check + repair | `GUI_REPO`, `UpdateInfo`, `download_aether_binary` (`§21`) |
| `src-tauri/aether-release.json` | pinned engine | `version 2.1.0`, 5 assets, SHA-256s |

`AetherError` Display (`error.rs:5-18`): `Aether is already running` / `Aether engine incompatible: {0}` / `failed to launch Aether: {0}` / `port {0} is already in use by another process` / `no active connection` / `a system proxy is already set — turn it off first before switching` / `internal error: {0}`.

| store file | key | notes |
|---|---|---|
| `profile.json` | `last_successful_profile` | written on connect-success (`§17`) |
| `history.json` | `connection_history` | `ConnectionEntry { protocol, scan_mode, timestamp, duration_secs, success }`; `insert(0,…)` + `truncate(20)`; offset/limit `min(len)`/`clamp(1,50)` |
| `presets.json` | `saved_presets` | `ProfilePreset { name, profile }`; `retain(name != n)` -> `insert(0,…)` -> `truncate(10)` |
| `settings.json` | `close_to_tray` | only `tray::get/set_close_to_tray` |
| `settings.json` | `minimize_on_startup` | default `false` |
| `settings.json` | `always_on_top` | `get_always_on_top` only |
| `settings.json` | `window_position` | `{x,y,width,height}` via `save_window_position` / `get_window_position` |
| `settings.json` | `ip_changer_use_system_tor` | setup `lib.rs:71-86`, written by `set_use_system_tor` (`§18`) |

**Window/exit + tray.** `CloseRequested` -> `prevent_close()` + `window.hide()` iff `tray::get_close_to_tray()`; `Moved`/`Resized` -> `window_position` write. Tray `show` -> `unminimize()+show()+set_focus()`, `quit` -> `app.exit(0)`. `RunEvent::Exit` -> `aether::shutdown_blocking` -> `ip_changer::shutdown_blocking` -> `sysproxy::disable()` (`§15`).

**Update = check only.** `check_for_update(env!("CARGO_PKG_VERSION"))` GETs `https://api.github.com/repos/FreaksLxss/Aether-GUI-Next/releases/latest`, `is_newer` compares `tag_name` minus `v`, first `.exe`/`.msi` asset else `html_url` -> `UpdateInfo { available, latest_version, current_version, download_url }`; webview opens it (`§9`).

**Repair `download_aether`:** `INSTALLING` held => `Internal("Engine repair is already running")`, else status must be `Idle | Error { .. }` (else `AlreadyRunning`); `InstallationGuard` (drop => reset) -> `download_aether_binary()` -> re-inspect, `!info.compatible` => `EngineIncompatible(problem)` (`§16`). Limits `.connect_timeout(20s)`, `.timeout(180s)`, `MAX_ARCHIVE = 64 * 1024 * 1024`, `MAX_FILE = 128 * 1024 * 1024`; zip-slip/duplicate/link rejected, install-lock + rollback.

**Also here:** `get_diagnostics` (redacts `zt_access_secret`/`zt_access_token`); `is_tun_available` -> Win32 `TokenElevation` else `false`; `read_file`/`write_file` = raw `fs`, **no path sandbox**; Android `set_always_on_top` => `Internal("always-on-top is a desktop-only feature")` — these + boot reaps -> `§22`.

### 15. Local proxy, system proxy, net & traffic

`httpproxy` = GUI's HTTP+SOCKS5 bridge; `sysproxy` = OS proxy with ownership; `net` = tunnelled leak checks; `traffic` = counters + socket table.

| path | role | key symbols / notable lines |
|---|---|---|
| `src-tauri/src/httpproxy.rs` | HTTP/1.1 + SOCKS5 bridge | `start()` binds `127.0.0.1:0` (no `stop()`, `RUNNING` never resets), `engine_addr()`, `route_connect()`, `socks_connect()`, `relay()`, `pipe_counted()` |
| `src-tauri/src/sysproxy.rs` | OS proxy enable/disable + ownership | `PROXY_ENABLED`/`PROXY_SOURCE`/`PROXY_SOCKS_PORT` (`Relaxed`); `SOURCE_NONE=0`, `SOURCE_MAIN=1`, `SOURCE_IP_CHANGER=2` |
| `src-tauri/src/net.rs` | public-IP fetch, direct or tunnelled | `fetch_public_info`, `PublicInfo`, `client(through_tunnel, bind_addr)` |
| `src-tauri/src/traffic.rs` | counters + active-socket table | `snapshot()`, `record_tx/rx`, `reset()`, `active_connections()` |

`MAX_HEAD = 64 * 1024`, `UPSTREAM_TIMEOUT = 5s`, `DEFAULT_SOCKS`; statics `TARGET`, `LISTEN`, `RUNNING`, `STOLEN`, `ENGINE`, `ENGINE_TOR`, `ENGINE_PSIHON`, `PINS`.

**Bridge flow.** First byte: `0x05` => SOCKS5, non-ASCII-alphabetic => drop, else HTTP/1.1 absolute-URI/`Host:`. `engine_addr()` = engine bind else `DEFAULT_SOCKS`. `route_connect(advertised, tor_door)` pairs the engine port with the advertised door, pinned (`claim`/`claim_sa`, `claim_psiphon_door`, `reserve_engine_tor`/`reserve_engine_psiphon`, `is_claimed`, `set_target`, junk => `DEFAULT_SOCKS`). SOCKS5 no-auth only (`CMD != 1` => `0x07`); HTTP replies `200 Connection Established` / `400 Bad Request` / `502 Bad Gateway`; `relay` = 2 threads x 8 KiB.

**System proxy switchboard:** `source()/socks_port()/is_enabled()/ensure_free(src)/disable_if_main()/enable(src,port)/disable()`; another owner => `AetherError::ProxyConflict`; `SystemProxyState { enabled, owner: "main"|"ip_changer"|"none", port }`. Capture mode points the OS at the **bridge** port.

| OS | mechanism | exact values |
|---|---|---|
| Windows | `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` | `ProxyEnable` `1`/`0`; `ProxyServer` `127.0.0.1:{port}`; `ProxyOverride` = `<local>;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;localhost`; `InternetSetOptionW` + `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, L"InternetSettings", …)`; **disable writes only `ProxyEnable = 0`** |
| Linux | `gsettings` | `mode manual`/`none` + http/https host+port; missing helper => `system proxy needs the {cmd} helper installed` |
| macOS | `networksetup` | `-setwebproxy` / `-setsecurewebproxy` per service |
| other | — | `System proxy is not supported on this OS yet` |

Restore: `disable_if_main()` on spawn failure/retries/exit/disconnect; `RunEvent::Exit` => unconditional `disable()`; `stop_tor` only when `source() == SOURCE_IP_CHANGER`. No PAC, no OS SOCKS entry, no Linux/macOS bypass.

**Leak check:** `REQUEST_TIMEOUT = 8s`, `USER_AGENT = "aether-gui/<CARGO_PKG_VERSION> leak-check"`, `ENDPOINT_IPWHO = "https://ipwho.is/"`, `ENDPOINT_IPAPI = "https://ipapi.co/json/"`; `client(true, bind)` -> `Proxy::all("socks5h://{bind_addr}")`; `PublicInfo`; polls 10000/30000 ms (`§9`).

**Traffic:** `TrafficStats { tx_bytes, rx_bytes, tx_rate, rx_rate }`, `ActiveConn { pid, exe, local, remote, state, proto }`; `AtomicU64` + `PREV` window (delta only when `elapsed > 0.05s`); producers `httpproxy::pipe_counted`, `handle_plain_http`, `tun/forwarder.rs:222`/`:398`. `active_connections()` Windows-only (`GetExtendedTcpTable` <=128, `GetExtendedUdpTable` <=160, `truncate(64)`, pid 0 -> `"System Idle"`, 4 -> `"System"`). Emits 1000 ms **only while `Connected`** (`lib.rs:55-70`); `set_system_proxy`/`get_system_proxy` never invoked -> `§22`.

### 16. Aether core — status, engine, prompts, orphan

Connect lifecycle: probes, waits, auto-retry, prompts, engine selection.

| path | role | key symbols / notable lines |
|---|---|---|
| `src-tauri/src/aether/mod.rs` | `AetherManager`, spawn/monitor/disconnect | `start_connect` -> `spawn_and_monitor` -> `monitor_connect` 400 ms -> `monitor_connected` 500 ms; `handle_unexpected_failure`; `send_input`; `request_disconnect` 200 ms; `shutdown_blocking`; bind remap :201 |
| `src-tauri/src/aether/status.rs` | probes, timeouts, stage strings | `DEFAULT_SOCKS_ADDR = "127.0.0.1:1819"`, `port_is_live`, `probe_addr`, `connect_timeout`, `startup_timeout`, `startup_stage` |
| `src-tauri/src/aether/engine.rs` | engine discovery/compat | `inspect`, `resolve`, `install_dir`, `binary_name`, `transport_path`, `probe_version`, `parse_version`, `EngineInfo`, `INSTALLING: Mutex<bool>` |
| `src-tauri/src/aether/prompts.rs` | menu auto-answer | `PROMPT_TABLE`, `looks_like_choice_prompt`, `prompts_done` |
| `src-tauri/src/aether/orphan.rs` | stale engine reaping | `<app-data>/aether.pid`, `write_pid`/`clear_pid`/`reap_orphan` |

**Probing.** `port_is_live(addr)` = TCP `connect_timeout(300 ms)` via `probe_addr`. `connect_timeout(scan_mode)` s: **Turbo 90, Balanced 150, Thorough 330, Verified 210, Ironclad 240**. `startup_timeout = max(scan, tor_budget, psiphon_budget)` s; `tor_budget` = 600 + direct/stall secs, `psiphon_budget = 300`. Secondary `secondary_tor_address` (default `127.0.0.1:1820`) / `secondary_psiphon_address` (`1821`) probed only when Tor/Psiphon active (`§7`).

| condition | `startup_stage` string |
|---|---|
| `PsiphonOnly` | `Waiting for Psiphon to hand a working route (can take a few minutes)` |
| `PsiphonReverse` | `Waiting for Psiphon bootstrap, then the reverse tunnel's primary SOCKS listener` |
| `TorOnly` | `Waiting for native Tor bootstrap and the primary SOCKS listener (bridge fallback can take several minutes)` |
| `TorReverse` | `Waiting for native Tor bootstrap, then the reverse tunnel's primary SOCKS listener (bridge fallback can take several minutes)` |
| `Tor` / `Disabled` | `Waiting for Aether's primary SOCKS listener` |

**Lifecycle.** Unexpected exit -> `handle_unexpected_failure` with `RETRY_BACKOFF = [2,5,10] s` / `MAX_AUTO_RETRIES = 3`, suppressed by `user_requested_stop`; `request_disconnect` polls **200 ms**, `GRACEFUL_SHUTDOWN_GRACE = 3 s` before kill; `shutdown_blocking` clears `aether.pid`. `Connected` saves `last_successful_profile` and activates TUN (`capture_mode ∈ {Tun, Both}`, `§18`).

**Engine discovery.** `install_dir(app)` = `<app-data>/binaries/engine-2.1.0/` (`expected_version()` <- `aether-release.json`); `transport_path` = `<dir>/pt/lyrebird[.exe]` (**required**). Candidates, first compatible wins: `downloaded` `<install_dir>/`, `bundled` `<resource_dir>/binaries/engine/`, `legacy bundle` `<resource_dir>/binaries/`, `development` `$CARGO_MANIFEST_DIR/binaries/engine/`, `legacy download` `<app-data>/binaries/`. `probe_version` spawns `--version` (3 s, `CREATE_NO_WINDOW`). `EngineInfo { version, expected_version, path, source, compatible, transports_available, problem }`; `resolve` => `EngineIncompatible("{problem}. Install/repair Aether {expected}.")`.

**Prompts** (answered once, then the line is forwarded):

| `section` | match | answer |
|---|---|---|
| `protocol` | `Protocol:` | `1` / `1` / `2` / `3` |
| `scan_mode` | `Scan mode:` | `1`–`5` |
| `ip_version` | `IP version to scan:` | `1` / `2` / `3` |
| `masque_transport` | `MASQUE transport:` | `2` if `masque_http2` else `1` |

`looks_like_choice_prompt` = line ends with `:`; first non-empty line flips `prompts_done`. One-time-code prompt is **not** in the table — typed in console, sent via `send_input` (`[gui] one-time code sent to Aether`).

**Scan modes:** Turbo `--turbo` (1), Balanced `--balanced` (2), Thorough `--thorough` (3), Verified `--verified` (4), Ironclad `--ironclad` (5). Ironclad real-tunnel + HTTP-probe = **upstream engine behaviour** -> `[INFERENCE]` (README.md:27, `ScanModeToggle.tsx:23-24`).

**Orphan + commands.** `reap_orphan` reads `<app-data>/aether.pid`: unix `kill -0` then `kill -9`; Windows hidden `tasklist /FI "PID eq <pid>"` then `taskkill /PID <pid> /F` — **no process-name verification** -> `§22`. Commands (`§4`): `get_engine_info` -> `engine::inspect`, `get_engine_tor_status`/`get_engine_psiphon_status` -> `tor_status()`/`psiphon_status()`, `aether_binary_exists` -> `info.compatible`.

### 17. Profiles & PTY pipeline

`ConnectionProfile` = the profile struct (persisted, validated, translated); PTY spawns the engine, streams stdout to the log.

| path | role | key symbols / notable lines |
|---|---|---|
| `src-tauri/src/aether/profiles.rs` | struct, defaults, validation, translation, store | `ConnectionProfile` :234-351, `as_args()` :386-655, `environment()` :657-713, `STORE_FILE/STORE_KEY` :796-797, `validate()` :859-1051 |
| `src-tauri/src/aether/pty.rs` | desktop spawn/read/send/kill | `portable-pty = "0.8"`, `PtySession`, `read_loop` 4096 B |
| `src-tauri/src/aether/pty_output.rs` | line buffering, ANSI strip, failure classification | `drain_lines`/`finish_lines`, `MAX_PARTIAL = 16 * 1024`, `strip_ansi` (CSI only), `StartupFailure`, `failure_after_exit()` <= 250 ms |
| `src-tauri/src/aether/pty_android.rs` | Android pipe shim | `prompts_done` starts `true`, `send_ctrl_c` no-op, `send_line` appends `"\n"` |
| `src-tauri/src/childproc.rs` | hide helper console windows | `hidden(&mut Command)` -> `CREATE_NO_WINDOW` (`0x0800_0000`) |

**Profile -> engine:** **no TOML/JSON profile file reaches the engine** (repo `toml` hits are rejection tests); everything travels as **~57 CLI flags via `as_args()`** + **`AETHER_*` env via `environment()`** (first-wins); cwd = app-data; `PROXY_ENV_KEYS` stripped (HTTP(S)/ALL/FTP_PROXY + lowercase); `NO_PROXY`/`no_proxy` = `localhost,127.0.0.1,::1`; **`--http-proxy` never emitted** (`§21`) — `http_proxy_address` is served by `httpproxy` (`§15`).

**Field -> emission (flags below; `§16`).** **Never:** `http_proxy_address` (listener only). **Conditional:** `bind_address` -> `--bind` only if trimmed != `127.0.0.1:1819` **and** parses (spawn overwrites with `httpproxy::engine_addr()`); `upstream_proxy` -> `--upstream` if non-empty; `wiw_peers` -> `--wiw-peers` only for `Gool`; `mim` -> `--mim` only `Auto`/`Masque`; one `--tor-bridge <line>` per non-empty bridge; `--tor-bind` unless `TorOnly`, `--psiphon-bind` unless `PsiphonOnly`; `--exit-loc-secs` only with `--exit-loc`; `fw_mark` -> `AETHER_MARK` always, `--mark` only linux/android; `masque_http2` always emits `AETHER_MASQUE_HTTP2` `1`/`0` and suppresses `--no-quic-v2`, which fires when `!quic_v2 && !masque_http2 && protocol∈{Auto,Masque} && engine_tor_mode∉{TorReverse,TorOnly} && engine_psiphon_mode∉{PsiphonReverse,PsiphonOnly}`. **No flag:** `capture_mode` (drives TUN), `dns_mode`, `tun_address` (default `10.0.0.2/24`), `tun_dns` (unused -> `§22`); `tun_*` validated only when `capture_mode != Proxy`.

**Flag vocabulary** (emission order = struct order, `profiles.rs:389-652`): `--masque`, `--wg`, `--gool`, `--turbo`, `--balanced`, `--thorough`, `--verified`, `--ironclad`, `-4`, `-6`, `--dual`, `--quick-reconnect`, `--no-quick-reconnect`, `--noize`, `--bind`, `--upstream`, `--wiw-peers`, `--log-level`, `--perf`, `--dns`, `--route-block`, `--route-direct`, `--team`, `--access-id`, `--access-secret`, `--access-email`, `--access-token`, `--gateway`, `--mim`, `--mim-peers`, `--no-quic-v2`, `--exit-loc`, `--exit-loc-secs`, `--stats`, `--stats-secs`, `--mark`, `--tor`, `--tor-reverse`, `--tor-only`, `--tor-bind`, `--tor-dir`, `--tor-bridge`, `--tor-bridges`, `--no-tor-bridges`, `--tor-pt`, `--tor-pt-dir`, `--tor-relays`, `--tor-relay-ports`, `--tor-bridge-file`, `--psiphon`, `--psiphon-reverse`, `--psiphon-only`, `--psiphon-bind`, `--psiphon-mode`, `--psiphon-region`.

**Env vars** (`environment()` :657-713, first-wins): `AETHER_MASQUE_HTTP2` (`1`/`0`, always), `AETHER_ROUTE_SNIFF` (`0` when disabled), `AETHER_ROUTE_SNIFF_MS`, `AETHER_REPROVISION` (`0` when disabled), `AETHER_QUIC_V2` (`0` when disabled), `AETHER_MARK`, `AETHER_MAX_CLIENTS`, `AETHER_HALF_CLOSE_SECS`, `AETHER_TCP_KEEPALIVE_SECS`, `AETHER_TCP_CONNECT_SECS`, `AETHER_TOR_COUNTRY`, `AETHER_TOR_DIRECT_SECS`, `AETHER_TOR_STALL_SECS` (last three only when `engine_tor_mode != Disabled`).

**Enum serde spellings** (lowercase unless noted): `CaptureMode` `proxy|tun|both`; `DnsMode` `forward|direct`; `Protocol` `auto|masque|wireguard|gool`; `ScanMode` `turbo|balanced|thorough|verified` (alias `stealth`) `|ironclad`; `IpVersion` `v4|v6|both`; `MasqueNoize` `firewall|gfw|light|off`; `WgNoize` `balanced|aggressive|light|off`; `EngineTorMode` `disabled|tor|tor-reverse` (alias `tor_reverse`) `|tor-only` (alias `tor_only`); `EnginePsiphonMode` `disabled|psiphon|psiphon-reverse` (alias `psiphon_reverse`) `|psiphon-only` (alias `psiphon_only`); `PsiphonShape` `auto|cdn|direct` (default `Auto`).

**`validate()` errors (verbatim, subset):** `"{name} conflicts with {other_name}; choose separate listener addresses/ports"`, `tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`, `psiphon-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`, `psiphon-only cannot be combined with engine Tor — both claim the primary listener`, `tor-only cannot be combined with engine Psiphon — both claim the primary listener`, `tor-reverse and psiphon-reverse cannot both run — each needs MASQUE as its sole outer tunnel`, `route_sniff_ms: must be an integer from 0 to 10000`, `Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled`, `engine_tor_country: use a two-letter country code`, `engine_tor_relays: use auto, only, off, or a number`, `engine_tor_relay_ports: use web or any`, `exit_loc: comma-separated two-letter country codes, optional leading ! (e.g. "DE,SE,!IR")`, `{field}: provide at most two distinct numeric IP:port endpoints`. Run by `set_default_profile` (failure => `AetherError::Internal(msg)`), import/export; `#[serde(default)]` fills new fields (`old_profile_json_gets_defaults`).

**PTY & log.** `openpty(PtySize { rows: 40, cols: 120, … })`; `PtySession { pid, prompts_done, startup_failure_after_exit, try_wait, send_ctrl_c (0x03), send_line (line + "\r\n"), kill }`. `read_loop` 4096 B -> `drain_lines` -> `strip_ansi` -> `log_line` -> `mpsc<LogEvent>` -> `app.emit("aether://log", …)` (`mod.rs:235-242`, `§5`). `StartupFailure` = `UnsupportedOption`/`InvalidConfiguration`/`MissingTransport`/`BindInUse`, `failure_after_exit()` <= 250 ms. **Rings:** `BUDGET_RE = /budget=(\d+)s/` feeds the progress bar; main **500** (100 ms batch), log window **2000** (re-subscribes independently).

### 18. TUN mode & IP Changer

Windows TUN (user-space TCP stack + route takeover, a connect side effect) + an independent Tor bundle for IP rotation.

| path | role | key symbols / notable lines |
|---|---|---|
| `src-tauri/src/tun/mod.rs` | `TunManager` facade + `TunError` | `activate`/`deactivate`/`is_active`; non-Windows stub `Ok(())`/`false`; `AdapterCreate`/`RouteError`/`ForwarderError`/`NotActive`/`Internal` |
| `src-tauri/src/tun/adapter.rs` | wintun adapter | `wintun.dll` probed under `<resource>`/`<exe_dir>` x root/`binaries/`; name `"Aether"`, `set_mtu(1500)`, `start_session(MAX_RING_CAPACITY)` |
| `src-tauri/src/tun/route.rs` | save/restore default route | `route change 0.0.0.0 mask 0.0.0.0 <tun_ip> metric 1`, `restore()` = `route change … <orig_gw> metric 1 [if <idx>]` + `ipconfig /flushdns`, `Drop` => `restore()` |
| `src-tauri/src/tun/dns.rs` | DNS forwarders | `forward_dns_tcp` (SOCKS5 -> `8.8.8.8:53`, 3 s, cap 4096), `resolve_direct` (UDP 3 s) |
| `src-tauri/src/tun/forwarder.rs` | user-space TCP/IP forwarder | `FlowKey`, `Flow {stream, state, client_seq, server_seq}`, `TcpState = SynReceived\|Established\|CloseWait\|Closed`, `server_seq = 1000` |
| `src-tauri/src/tun/cleanup.rs` | orphaned-adapter reaper | `TUN_STATE_FILE` = `<data_dir>/tun_state.json`, alive = `GetExitCodeProcess == 259` |
| `src-tauri/src/ip_changer.rs` | bundled/system Tor, rotation, auto-rotate | `TorManager`, `TorStatus`, `DEFAULT_SOCKS_PORT`, `DEFAULT_CONTROL_PORT` |

**TUN flow.** Side effect of `monitor_connect` (`§16`): `capture_mode ∈ {Tun, Both}` => `tun.activate(&httpproxy::engine_addr(), &profile, resource_dir)`; failure only logs `[tun] Failed to activate TUN: {e}`, connection continues -> `§22`. UI gating `§11`; `is_tun_available`/`get_tun_active` never invoked, `TunIndicator` never mounted -> `§22`.

**Route:** forwarder hard-codes `10.0.0.2` and **discards the CIDR prefix** (`_prefix_len` unused); `route.cmd` exit codes ignored — both `§22`. Bypass routes at metric 5: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8` (via 127.0.0.1), gateway host route, `162.159.192.0/20`, `162.159.198.0/24`, `172.64.0.0/13`, `104.16.0.0/13`.

**DNS/forwarder/cleanup:** TUN DNS replies are **discarded** so `tun_dns` unused -> `§22`. Forwarder: SOCKS5 connect 5 s, `read_timeout(30s)`, 16 KiB; UDP only for port 53. Cleanup: `reap_orphan_tun` reads `tun_state.json` (`{adapter_name, original_gateway, pid}`); dead => `"[tun] Cleaning up orphaned TUN adapter '<name>' (PID <pid> is dead)"`, `netsh interface delete interface`, restore route, flushdns, delete file. **No writer for `tun_state.json`** -> inert; TUN **not deactivated on engine crash** — both `§22`; called at `lib.rs:42`.

**IP Changer constants:** `DEFAULT_SOCKS_PORT: u16 = 9050`, `DEFAULT_CONTROL_PORT: u16 = 9051` (`§7`), `BOOTSTRAP_TIMEOUT = 120s` (poll 1500 ms), `SHUTDOWN_GRACE = 10s`, `KILL_GRACE = 3s`, `MIN_AUTO_INTERVAL_SECS = 60`, `MAX_AUTO_INTERVAL_SECS = 86_400`, `IP_REQUEST_TIMEOUT = 8s`, `IP_USER_AGENT = "aether-gui/<CARGO_PKG_VERSION> ip-changer"`; monitor 500 ms, auto-rotate tick 1 s.

Binary: `binaries/tor/<os>/<arch>/tor[.exe]` over `resource_dir`, `app_data_dir`, `CARGO_MANIFEST_DIR` (per-OS/arch dir, else `no bundled Tor for {os}/{arch}`). Spawn args (verbatim): `--SocksPort <tor_upstream>`, `--ControlPort 127.0.0.1:<control_port>`, `--CookieAuthentication 1`, `--DataDirectory <run_dir>`, `--ClientOnly 1`, `--Log notice stdout`, `--GeoIPFile`/`--GeoIPv6File` when present. Control: `AUTHENTICATE <hex cookie>` (reply must start `250` else `control rejected: <line>`), rotation `SIGNAL NEWNYM`, stop `SIGNAL SHUTDOWN`. Exit IP via `socks5h://127.0.0.1:<socks_port>` -> `ipwho.is` then `ipapi.co`.

`TorStatus` serde tag `state`: `Stopped | Starting | Running | Stopping | Error { message }`; emitted on `ip-changer://status` / `ip-changer://log` (`§5`) with its own **400-line** ring. Preflight `port_is_live(addr) && !httpproxy::is_claimed(addr)` else `AetherError::PortInUse(port)`. Errors (verbatim): `Tor is already running`, `Tor is not running`, `Tor exited during startup (status {code})`, `Timed out waiting for Tor to open its control port`, `Tor exited unexpectedly (status {code})`.

**Commands (13; registry `§4`):** `start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `get_tor_status`, `set_auto_rotate`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `set_tor_lan`, `get_tor_lan`, `get_tor_source`, `set_use_system_tor`. `spawn_auto_rotate` runs at startup (`§3`), `shutdown_blocking` at exit (`§14`); only persisted key `settings.json`/`ip_changer_use_system_tor`. Backend `set_auto_rotate` validates **60..=86400 s** vs UI `MINUTE_OPTIONS = [1, 2, 5, 10, 15, 30, 60]` minutes (`AutoRotateSettings.tsx:7`) => sub-60 s picks rejected -> `§22`.

---

## Part D — Build, docs & meta

### 19. Build, packaging & CI

Tauri 2 app: Vite frontend + Rust side bundling a SHA-256-pinned `aether` engine fetched separately. One workflow, no updater plugin.

#### File inventory

| path | role | key symbols / notable lines |
|---|---|---|
| `package.json` | npm manifest `aether-gui` | `version: "1.18.0"`; scripts below; React 19, Tauri 2, Tailwind 4, Vite 8, TS ~6 |
| `vite.config.ts` | bundler config | **two HTML inputs** `main`/`log-window`; dev 1420 `strictPort` |
| `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `components.json` | strict TS, flat lint, Prettier `semi: false` | ignores `dist`/`target`/`.claude` |
| `src-tauri/Cargo.toml`, `build.rs`, `gen/` | crate `aether-gui`; `tauri_build::build()`; `gen/` **gitignored** | `version = "1.18.0"`, `rust-version = "1.98"` |
| `src-tauri/tauri.conf.json` + `tauri.macos/linux.conf.json` | main config + byte-identical overlays | identifier `com.cluvexstudio.aethergui`; `bundle.resources` **line 42** |
| `src-tauri/capabilities/default.json`, `log-window.json` | window permissions | 17 / 2 permissions |
| `src-tauri/aether-release.json` | pinned engine manifest | `"version": "2.1.0"`, 5 assets + sha256 |
| `src-tauri/binaries/fetch-aether.py` (+ `.sh`/`.ps1`, `test_fetch_aether.py`) | engine fetcher | download → sha256 → arch → safe extract → atomic activate; 10 tests |
| `setup.bat`, `src-tauri/binaries/run-aether.bat` | Windows onboarding; launcher shipped *inside* the engine archive | `[1/4]`–`[4/4]`; `aether.exe %*` |
| `.github/workflows/build.yml` | the **only** workflow | `name: build`, 4-OS matrix, `tauri-action` |
| `.gitignore`, `.github/ISSUE_TEMPLATE/` | engine/identity exclusions; `bug_report.yml`, `feature_request.yml` | identity at **line 37** |
| `rel210.json`, `Cargo.lock`, `package-lock.json` | upstream release snapshot; committed lockfiles | CI uses `npm ci` |

Fetch scripts, tests and `run-aether.bat` live under **`src-tauri/binaries/`**, never repo root.

#### npm scripts (verbatim, `package.json`)

```json
"dev": "vite",
"build": "tsc -b && vite build",
"lint": "eslint .",
"format": "prettier --write \"**/*.{ts,tsx}\"",
"typecheck": "tsc --noEmit",
"preview": "vite preview",
"tauri": "tauri"
```

`npm run dev` → Vite on **1420** (`strictPort: true`). `npm run build` → `tsc -b && vite build`, the only typecheck gate CI runs; `lint`/`format` are **not run by CI**. `npm run tauri build` → installers under `src-tauri/target/release/bundle/`.

#### `src-tauri/tauri.conf.json`

`productName: "Aether-GUI"`, `version: "1.18.0"`. One unlabeled window → default `main`; `log-window` created at runtime.

- CSP verbatim: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.
- **`targets: "all"`** → NSIS `.exe`/`.msi`, `.dmg`/`.app`, `.deb`/`.AppImage`/`.rpm`; `nsis.installMode: "perMachine"`.
- **Line 42 `bundle.resources` (base = Windows):** `binaries/engine/aether.exe`, `binaries/engine/pt/lyrebird.exe`, `binaries/engine/pt/psiphon-tunnel-core.exe`, `binaries/tor`, `binaries/wintun.dll`.
- macOS/Linux overlays: `binaries/engine/aether`, `binaries/engine/pt/lyrebird`, `binaries/tor`, `binaries/wintun.dll` — **no `psiphon-tunnel-core`** on Unix though `wintun.dll` stays; merge semantics `[UNCERTAIN]`.
- **No updater block, no `tauri-plugin-updater`, no `createUpdaterArtifacts`/`endpoints`** in config, `Cargo.toml`, `package.json`, `build.yml` → §14, §22.

Capabilities `default.json` (identifier `default`, windows `["main"]`), 17 verbatim: `core:event:default`, `core:window:allow-is-focused`, `core:window:allow-start-dragging`, `core:window:allow-close`, `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-show`, `core:window:allow-hide`, `core:window:allow-set-always-on-top`, `core:window:allow-is-always-on-top`, `core:webview:allow-create-webview-window`, `notification:default`, `autostart:default`, `shell:allow-open`, `dialog:default`, `clipboard-manager:allow-write-text`, `clipboard-manager:allow-read-text`.

`log-window.json` (windows `["log-window"]`): `core:event:default`, `core:window:allow-close`.

#### `src-tauri/aether-release.json` — pinned engine manifest

`{ "version": "2.1.0", "repository": "CluvexStudio/Aether", "assets": { "<target>": { "name": "<asset>", "sha256": "<64 hex>" } } }`.

| key | name | sha256 |
|---|---|---|
| `windows-x86_64` | `aether-windows-x86_64.zip` | `16221819f57b1519302dec4488ff2890a1e64ebab233ed27a289be167138677b` |
| `linux-x86_64` | `aether-linux-x86_64-musl.tar.gz` | `db70a0f5258ae27695d4f14e98f88049e761c1985908582a941d25e57febbf5b` |
| `linux-aarch64` | `aether-linux-aarch64-musl.tar.gz` | `8bbc8ba5dcbe01d08a63424793d55a23002e1220eb2752ab46bb61e09a5e15e9` |
| `macos-x86_64` | `aether-macos-x86_64.tar.gz` | `d80e4bd11125b7b4511de454d7baf51470f7e377691b6a9ca30d29fad2685b54` |
| `macos-aarch64` | `aether-macos-arm64.tar.gz` | `4cb73361301ccf87f6b15eedb1c058a7cc0fb41508dc1943f307439ed6774881` |

Key says `macos-aarch64`, filename says `arm64`; all five equal `rel210.json`'s `digest` fields (tag **v2.1.0**); used by runtime repair (§14).

#### `binaries/fetch-aether.*` validation pipeline

`fetch-aether.py` (Python 3 stdlib) → asset key `os-arch` (env **`AETHER_ASSET`** must match a pinned key starting `{system}-`, else `ValueError("Unsupported platform: …")`) → download (`MAX_ARCHIVE = 64 * 1024 * 1024`) → sha256 must equal pin → extract into `.engine-stage-*` requiring `aether[.exe]`, `pt/lyrebird[.exe]`, `pt/psiphon-tunnel-core[.exe]`, rejecting unexpected/duplicate paths, symlinks, >`MAX_FILE = 128 * 1024 * 1024` → arch check → `--version` prints `aether 2.1.0` → `activate()` renames old `engine/` → `.engine-backup-<uuid4hex>`, restoring on failure.

Stages `src-tauri/binaries/engine/` (~60MB, gitignored) → `bundle.resources` → bundle. Runtime repair targets `<app-data>/binaries/engine-2.1.0/` (§14).

#### `test_fetch_aether.py` — 10 tests

No network; synthetic PE/zip/tar fixtures. `test_complete_pt_layout` · `test_checksum_mismatch` · `test_missing_pt` · `test_unsafe_paths_and_unexpected_files` · `test_duplicate_and_conflicting_paths` · `test_zip_symlink` · `test_tar_links_rejected` · `test_architecture_mismatch` · `test_failed_activation_rolls_back` · `test_success_preserves_previous_install`. Rust counts → §21.

#### CI: `setup.bat` and `.github/workflows/build.yml`

`setup.bat` `[1/4]`–`[4/4]`: tool checks → `npm install` → `vite build` → `npx tauri dev`/`build`. It does **not** fetch the engine — `binaries/engine/` must exist before `tauri build` resolves `bundle.resources`.

`build.yml`: triggers `workflow_dispatch:` and `push:` with `tags: ["v*"]`; `permissions: contents: write`; single job `build`, `strategy.fail-fast: false`, matrix `include` verbatim:

| name | os | target | aether_asset |
|---|---|---|---|
| `linux-x86_64` | `ubuntu-22.04` | `""` | `""` |
| `macos-arm64` | `macos-latest` | `aarch64-apple-darwin` | `""` |
| `macos-x86_64` | `macos-latest` | `x86_64-apple-darwin` | `aether-macos-x86_64.tar.gz` |
| `windows-x86_64` | `windows-latest` | `""` | `""` |

Step chain: `actions/checkout@v4` → `actions/setup-node@v4` (node 22, `cache: npm`) → `actions/setup-python@v5` → `dtolnay/rust-toolchain@stable` → **Install Linux system dependencies** → **Fetch Aether core (Linux/macOS)** → **Fetch Aether core (Windows)** → **Test safe engine archive installation** (`python -m unittest discover -s src-tauri/binaries -p "test_fetch_aether.py"`) → **Prune other-platform Tor bundles** → `npm ci` → `tauri-apps/tauri-action@v0` → **Sign Windows binaries** → `actions/upload-artifact@v4`.

`tauri-action@v0`: `tagName`/`releaseName` = `github.ref_name`, `releaseDraft: true`, `args: --target <matrix.target>` — tag pushes build **and draft a release**, `workflow_dispatch` does not. **Sign Windows binaries** runs only with secrets `WINDOWS_CERT_BASE64`/`WINDOWS_CERT_PASSWORD`; **no macOS codesigning/notarization**. Artifacts → `Aether-GUI_x.y.z_x64-setup.exe` / `Aether-GUI_x.y.z_x64_en-US.msi`.

#### `.gitignore` boundaries

- **Engine payloads, never committed:** `src-tauri/binaries/aether`, `src-tauri/binaries/aether.exe`, `src-tauri/binaries/aether-*`, `src-tauri/binaries/*.tar.gz`, `src-tauri/binaries/*.zip`, `src-tauri/binaries/SHA256SUMS.txt`, `src-tauri/binaries/engine/`, `src-tauri/binaries/pt/`, `src-tauri/binaries/.engine-*/`, `src-tauri/binaries/__pycache__/`, `src-tauri/binaries/android/`.
- **Identity — `.gitignore:37` `src-tauri/binaries/*.toml`**, under the comment: "Aether writes its provisioned device identity (private keys, access tokens) here when run with binaries/ as its cwd (e.g. manual testing) — must never be committed."
- **Committed + shipped under `src-tauri/binaries/`:** fetch scripts, tests, `run-aether.bat`, **`wintun.dll`**, and `tor/{macos/{aarch64,x86_64},linux/{i686,x86_64},windows/x86_64}` with `data/{geoip,geoip6,torrc-defaults}` (CI prunes non-target dirs).

---

### 20. Documentation & product context

Bilingual set (English + Persian), AGPL-3.0; current promises (`AGENTS.md`, `README.md`) vs stale-but-unmarked history (`PRODUCT.md`, `docs/releases/`, `.claude/release-notes-*`).

#### File inventory

| path | role / key content |
|---|---|
| `README.md` (16.2KB) | user promise: versions, features, settings, install, build, how-it-works, attribution, license |
| `README_fa.md` (25.7KB) | Persian mirror (parity required) |
| `AGENTS.md` (5.4KB) | agent contract: stack, six npm commands, "no code comments", bilingual-doc rule |
| `PRODUCT.md` (6.2KB) | persona, positioning, principles — **stale versions** |
| `DESIGN.md` (8.3KB) | design system "Clear Signal": YAML front-matter tokens + named rules |
| `SECURITY.md` (1.6KB) | reporting policy, GUI-vs-upstream scope split |
| `CONTRIBUTING.md` (1.2KB) | setup + pre-PR gate + AGPL sign-off |
| `docs/releases/v0.17.1.md` (895B), `docs/screenshot-idle.png` (86.9KB) | patch notes (engine still 2.0.0); screenshot not embedded in READMEs |
| `.claude/release-notes-v0.17.0.md` (3.4KB) | draft notes, Aether 2.0.0 integration |
| `LICENSE` (34.4KB) | **AGPL-3.0** |

#### `README.md` heading sequence (no FAQ exists)

`# Aether-GUI` + badges/language switch (**English** · **فارسی**) → `## Versions and engine repair` → `## Features` → `## Settings` → `## Installing` → `## Building from source` → `## How it works` → `## About Aether` → `## Attribution & trademark` → `## License`. **No FAQ**; no screenshots.

Key verbatim claims:

- Versions: "**Aether-GUI 1.18.0** is the desktop app version; **Aether 2.1.0** is the separately versioned engine it requires." Repair path `<app-data>/binaries/engine-2.1.0/`, "pinned to v2.1.0".
- TUN: routes "through a **TUN** virtual adapter that catches everything (**currently gated off in the UI until fully wired**)".
- Leak check: compares exit IP against "your real, direct IP" — mismatch raises visible "**Leak detected**" warning.
- Reconnect: visible "**Reconnecting… (attempt N of 3)**"; "A user-requested disconnect is never retried."
- Ground truth: probes the profile's local SOCKS5 listener (default `127.0.0.1:1819`) … "not proof of end-to-end internet connectivity or leak protection".
- Caveat: "**this documentation does not claim successful builds, platform verification or live network connectivity**."

#### `README_fa.md` parity

Same badges, language switch and heading sequence in Persian (`نسخه‌ها و ترمیم موتور`, `امکانات`, `تنظیمات`, `نصب`, `ساختن از روی سورس`, `پشت صحنه چطور کار می‌کند`, `درباره‌ی Aether`, `مجوز`); same versions (`1.18.0`, `2.1.0`), ports, engine path. Structural parity only — **Persian wording not reviewed `[UNCERTAIN]`**; `AGENTS.md` requires mirroring.

#### `PRODUCT.md` digest — and its stale versions

**Platform** `web` (desktop webview). **Persona:** non-technical users in heavily restricted networks, primarily **Persian-speaking**, wanting circumvention without a command line. **Positioning:** "The single button, not the terminal … Same engine, zero threshold." **Principles:** one click over configuration; trust the mechanism not the wording (TCP probe + real IP comparison). **STALE:** "GUI **0.17.1** and engine **2.0.0** are separate versions" — truth §8-2, fix §23.

#### `DESIGN.md` — "Clear Signal"

| group | values |
|---|---|
| colors | ember `#f2711c`, ember-deep `#ea580c`, ember-ink `#0d0d0f`, canvas `#0b0b0c`, paper `#fafafa`, surface-1…4 `#101012`/`#151517`/`#1b1b1e`/`#212124`, ash `#a1a1aa`, line `rgba(255,255,255,0.09)`, connected `#2dd4bf`, error `#ef4444`, idle `#6b7280`, light-canvas `#f4f4f5`, light-card `#ffffff` |
| typography | Geist Variable body 14px/1.5, label 11px/500/+0.08em, JetBrains Mono Variable 12px |
| radii px | sm 6 / md 8 / lg 10 / xl 14 / window 18 / window-base 30 / pill 999 |
| spacing px | xs 6 / sm 10 / md 12 / lg 20 |
| components | button-primary (ember-deep/ink, 32px), button-outline, input (surface-3, mono), hero-disc (160px pill), panel (surface-2, 14px, hairline) |

Named rules: **One Accent Rule** (accent <10% of screen; selection = hairline ring + dot); **Status Trio Rule** (connecting amber / connected teal / error red / idle gray); **Readability Floor** (no text <11px, no secondary <85% opacity in dark); **Tabular Telemetry** (JetBrains Mono `tabular-nums`); **Flat-By-Default** (hover +1px, press 0.98; **zero `backdrop-filter`** — glass banned).

Layout **420×640**, 18px top / 30px bottom rounding, TitleBar + five tabs (Tunnel · Advanced · IP Changer · History · Settings); Tunnel tab = 160px connect disc + mode row. Sonar-ring motion while connecting; `prefers-reduced-motion` honored.

#### `SECURITY.md`

Never open public issues; use GitHub Security Advisories → `https://github.com/FreaksLxss/Aether-GUI-Next/security/advisories/new`, then coordinated fix + disclosure. **Scope split:** this repo owns the Tauri IPC surface, spawning/prompt-answering of `aether`, checksum-pinning of the binary, the CSP and the release pipeline; upstream `CluvexStudio/Aether` owns protocols/route discovery/encrypted-connection mechanics.

#### `CONTRIBUTING.md` — pre-PR gate (verbatim)

```sh
npm run typecheck
npm run lint
npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

Also: repo is GUI-only (tunnel/protocol changes go upstream); AGPL v3.0 sign-off. AGENTS.md adds `&& cargo test`; **no frontend test suite**.

#### Release docs — historical but unmarked

`docs/` holds exactly two files: `releases/v0.17.1.md` ("UI layout only"; "The bundled Aether engine remains **2.0.0**") and `screenshot-idle.png`. `.claude/release-notes-v0.17.0.md` drafts the Aether 2.0.0 integration. Both read as current but are **2.0.0**-era; its "**85 Rust tests passed** … **Engine packaging tests: 10 passed**" — Rust figure stale (§21), packaging still matching (§19).

#### Tooling noise — safe to ignore

| path | contents |
|---|---|
| `.claude/` | `settings.local.json` (6.8KB permission allowlist + impeccable hooks), `skills/` (0-byte pointers `[UNCERTAIN]`) |
| `.agents/skills/` | **15** personal SKILL.md prompt packs, no product code |
| `.impeccable/` | `design.json` (21.3KB), `decision-payload.json` (7.6KB, visual world "**The Honest Dashboard**", palette `#0c0d0f #141519 #f2f2f0 #f2711c #2dd4bf`) |
| `.mimocode/`, `.github/{agents,skills,hooks}` | another agent's workspace (`plans/`, `package.json`, `.cron-lock`); impeccable sub-agent prompts + `hooks/impeccable.json` |
| `skills-lock.json` (3,268 B) | `"version": 1`, 13 skills from `Leonxlnx/taste-skill`, each with `sourceType: "github"` + `computedHash` |

---

### 21. Test inventory (measured, not documented)

Direct count over `src-tauri/src/**/*.rs` (`#[test]` function attributes), 2026-09-25:

| test file (module) | `#[test]` fns | notes |
|---|---|---|
| `aether/profiles.rs` | 38 | flag/env serialization, validation, migration incl. TOML-rejection |
| `aether/pty_output.rs` | 11 | log batching/ring behavior |
| `aether/status.rs` | 11 | connected probe / port logic |
| `updater.rs` | 10 | release/check logic (a draft report said 9 — wrong) |
| `httpproxy.rs` | 8 | bridge behavior |
| `aether/pty.rs` | 5 | PTY pipeline |
| `tun/adapter.rs` | 4 | TUN adapter |
| `aether/engine.rs` | 3 | **1 `#[ignore]`d** → 2 runnable |
| `ip_changer.rs` | 1 | Tor manager |
| `tray.rs` | 1 | tray |
| **total** | **92** | 1 `#[ignore]` → **91 runnable** |

Plus **10 Python tests** in `src-tauri/binaries/test_fetch_aether.py` (fetch-helper validation). **No frontend test suite exists.**

Run gates (from `src-tauri/`): `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`. Frontend: `npm run typecheck && npm run lint && npm run build`.

Stale count: `.claude/release-notes-v0.17.0.md` claims "85 Rust tests" and "Engine packaging tests: 10 passed" — Python count still 10, Rust count is now 92/91 (§8-27).

### 22. Quirks, dead code & sharp edges

Navigation hazards found during the audit — read before "fixing" or deleting anything.

**Gated / dormant features**
- TUN capture mode gated off in UI: `DISABLED_MODES: CaptureMode[] = ["tun","both"]` (`CaptureModeSelect.tsx:22`); `src-tauri/src/tun/` is `cfg(windows)` only.
- `TunIndicator` component exists but is never mounted → `get_tun_active` is effectively never invoked from the UI.
- `aether:palette:pinned` localStorage key is read but has no writer.
- No tauri-updater plugin in the build config: `check_update` is check-only (repo `FreaksLxss/Aether-GUI-Next`), the browser opens `download_url`; `aether-update-checked` sessionStorage dedupes the prompt.
- Inert `light:` variant: no `@custom-variant light` declaration, 0 matches in built CSS, yet `App.tsx` uses `light:bg-white` (dark-only theme in practice).

**Registered but uncalled IPC (6)** — registered in §4, no frontend caller: `get_history_paginated`, `get_diagnostics`, `set_system_proxy`, `get_system_proxy`, `aether_binary_exists`, `is_tun_available`.

**Unmounted / discarded exports (frontend)** — component files exist, never imported at a mount site: `TunIndicator`, `ConnectionInfo`, `GlassAccordion`, `ConnectionHistory.tsx` (barrel), `SettingsPanel` named export, `IpChangerPanel` wrapper. Wrapper exports that discard their `open`/`onToggle` props: `AdvancedPanel`, `ProfilePresets`. Dead lib exports: `validators.hostPortRegex/hostRegex/validateProfile`, `theme.getLastColors`, `motion.SPRING_SHEET/SPRING_HERO/FADE_UP`.

**Backend sharp edges**
- `read_file`/`write_file` commands accept arbitrary paths — no sandbox (trust boundary: anyone who can invoke IPC reads/writes the filesystem).
- Orphan reaper keys on PID only — no process-name check → PID-reuse risk on reap.
- `tun_state.json` has no writer; DNS replies arriving through TUN are discarded and `tun_dns` is unused by TUN code; the forwarder hard-codes `10.0.0.2` and drops the prefix; `route.rs` ignores route-command exit codes; TUN is not deactivated when the engine crashes (only startup reaps orphans, §3-3).
- `HttpProxyAddressField` validates its input with `validateDnsServers` (wrong validator for the field).
- `QuickConnect`'s `protocol` field is never applied to the connect call.
- `ironclad` scan mode renders as the "Secure" pill label (naming mismatch).

**Cosmetic inconsistencies**
- Log window themes its `--primary` indigo `#6366f1`; main app accent is ember orange `#ea580c`.
- `index.css` `.glass*` utilities do use `backdrop-filter` while DESIGN.md declares "zero backdrop-filter" (policy vs. practice; `AmbientBackground` orbs themselves are filter-free).

### 23. Known doc-vs-repo discrepancies (fix list)

Consolidated actionable staleness; evidence in §8.

| doc | says | actual |
|---|---|---|
| `PRODUCT.md` (lines 35/37/51) | GUI `0.17.1`, engine `2.0.0`, repair path `engine-2.0.0/` | GUI `1.18.0`, engine `2.1.0`, `engine-2.1.0/` |
| `AGENTS.md` | IPC commands "registered in `main.rs`" | `main.rs` is a shim; registry = `lib.rs:146-199` |
| `README.md` | reconnect shows "(attempt N of 3)" | actual string `The tunnel dropped — getting you back · attempt ${attempt} of ${max_attempts}` |
| `DESIGN.md` | "zero backdrop-filter" | `.glass*` utilities use it (policy vs. practice) |
| `.claude/release-notes-v0.17.0.md` | "85 Rust tests passed" | 92 `#[test]` / 91 runnable |
| `docs/releases/v0.17.1.md`, `.claude/release-notes-v0.17.0.md` | engine 2.0.0 | historical snapshots — unmarked as historical |

All three version statements in README/README_fa/AGENTS.md (`1.18.0` / `2.1.0`) are aligned with `package.json`, `tauri.conf.json`, `Cargo.toml`, `aether-release.json` (§8-1).

---

## Appendix — provenance report index

This document was assembled from 12 deep-read slice reports (plus Main's firsthand verification, §1–§8). Report files live in the session `local/` dir; read `local://<name>` to re-open them.

| report | covers |
|---|---|
| `rundown-00-overview.md` | Part A skeleton (this document's §1–§7 base) |
| `rundown-01-frontend-shell.md` | §9 shell & entry points |
| `rundown-02-frontend-lib-hooks.md` | §10 lib, hooks, validators, types |
| `rundown-03-frontend-conn-ui.md` | §11 connection UI & stores |
| `rundown-04-frontend-chrome-ui.md` | §12 chrome & settings UI |
| `rundown-05-frontend-visual-ui.md` | §13 visual system, theme, index.css |
| `rundown-06-backend-lifecycle-ipc.md` | §14 lifecycle, state & core IPC |
| `rundown-07-backend-proxy-net.md` | §15 local proxy, system proxy, net & traffic |
| `rundown-08-backend-aether-core.md` | §16 aether status/engine/prompts/orphan |
| `rundown-09-backend-profiles-pty.md` | §17 profiles & PTY pipeline |
| `rundown-10-backend-tun-ipchanger.md` | §18 TUN mode & IP Changer |
| `rundown-11-build-packaging.md` | §19 build, packaging & CI |
| `rundown-12-docs-product.md` | §20 documentation & product context |
