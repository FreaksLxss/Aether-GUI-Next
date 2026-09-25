# Slice 01 — Frontend shell, entries, state

Everything below is read directly from source; file/line counts from `wc -l`. Paths are repo-relative from `E:/Projects/Aether-GUI`.

## File inventory

### Assigned files (this slice)

| path | ~size | purpose |
|---|---|---|
| `index.html` | 12 ln | Single `<div id="root">`, title `Aether-GUI`, loads `/src/main.tsx` module. No favicon, no inline script. |
| `src/main.tsx` | 14 ln | Entry: calls `initSound()` (from `@/lib/sound`) before render, then `createRoot(#root).render(<StrictMode><App/></StrictMode>)`; imports `./index.css`. |
| `src/App.tsx` | 342 ln | Root component: theme bootstrap (localStorage), Tauri listener init, squircle shell, `TitleBar`/`CloseDialog`/`AmbientBackground`, screen switching between `MainScreen` and `SidecarErrorScreen`; `MainScreen` owns panel state (5 lazy panels), palette, and 2 s polling of active connections. |
| `src/index.css` | 492 ln | Tailwind v4 theme (`@theme inline`), dark `:root` + `:root.light` token sets, glass/window/squircle utilities, scrollbar + keyframe animation library. |
| `log-window.html` | 301 ln | Standalone page for the log viewer webview: title `Aether - Live Log`, inline `<style>` (own `--*` palette), static DOM (`#logViewport`, `#searchInput`, `#autoScrollBtn`, `#clearBtn`, `#closeBtn`, `#statusBadge`…), loads `/src/log-window.ts`. |
| `src/log-window.ts` | 172 ln | Script of the log window: subscribes directly to Tauri events `aether://log` / `aether://status`, keeps a 2000-line ring buffer, incremental DOM append + full rebuild on filter, auto-scroll, search highlighting, badge color mapping. |
| `src/types/connection.ts` | 130 ln | All connection-domain types: `ConnectionStatus` union, enum-like string unions, `ConnectionProfile` (61 fields), `EngineTorStatus`/`EnginePsiphonStatus`, `LogLine`, `PublicInfo`, `ConnectionHistoryEntry`, `ActiveConn`, `TrafficStats`. |
| `src/types/ipChanger.ts` | 23 ln | Tor-side types: `TorStatus` union (5 variants), `AutoRotateConfig`, `TorSocksAddr`, `TorSourceInfo`. |
| `src/types/engine.ts` | 9 ln | `EngineInfo` interface (engine binary version/compat report; consumed by `AboutDialog` via `invoke("get_engine_info")`). |
| `src/types/three.d.ts` | 38 ln | Ambient `declare module "three"` — hand-rolled 8-class type surface that shadows `three`'s shipped types for `MagicRings.tsx`. |
| `src/state/connectionStore.ts` | 506 ln | Zustand `useConnectionStore`: connection status/logs/profile/IP/traffic/active-conn state, ~90 debounced profile setters, `initConnectionListeners()` wiring 5 Tauri events + 5 bootstrap invokes. |
| `src/state/windowFocus.ts` | 46 ln | Non-Zustand module-level focus store exposed through `useSyncExternalStore`; fed by `app://focused` event and `onFocusChanged`. |
| `src/stores/ipChangerStore.ts` | 285 ln | Zustand `useIpChangerStore`: Tor/IP-changer lifecycle, bootstrap %, auto-rotate, LAN/system-proxy toggles; `initIpChangerListeners()` wiring `ip-changer://status` + `ip-changer://log`. |

### Supporting files read for context (owned by other slices)

| path | why read |
|---|---|
| `src/lib/log-window.ts` (43 ln) | Actual opener of the log webview (`openLogWindow()`). |
| `src/hooks/useWindowPersist.ts` (62 ln) | Window position save/restore wired from `App`. |
| `src/hooks/useSquircleMask.ts` (135 ln) | `useSquircleClip()` applied to App's shell div. |
| `vite.config.ts` (34 ln) | Two-entry build (`index.html` + `log-window.html`), `@` alias, chunking. |
| `src-tauri/tauri.conf.json`, `src-tauri/capabilities/{default,log-window}.json` | Window geometry/decorations and permissions. |
| `src-tauri/src/{commands.rs,tray.rs,lib.rs,history.rs,aether/profiles.rs,ip_changer.rs}` | Only to confirm exact `settings.json` store key strings (see Persistence). |

## Architecture / data flow

### 1. Bootstrap chain

```
index.html (#root)
  └─ /src/main.tsx
       ├─ import "./index.css"        (Tailwind v4 theme loads first)
       ├─ initSound()                 (reads localStorage "aether-sound-enabled"/"aether-sound-volume")
       └─ createRoot(#root) → <StrictMode><App/></StrictMode>
```

`App()` (src/App.tsx:258) runs, in order:

1. hooks: `useKeyboardShortcuts()`, `useConnectionSound()`, `useIpChangerSound()`, `useWindowPersist()`.
2. `useLayoutEffect` — theme: `localStorage.getItem("aether-theme")`; `"system"` → `matchMedia("(prefers-color-scheme: dark)")` + change listener; otherwise default dark (`savedTheme ? savedTheme === "dark" : true`). Applies `.dark`/`.light` class on `document.documentElement`, then loads `aether-custom-primary`/`aether-custom-secondary` and dynamically imports `@/lib/theme.applyColors`.
3. `useEffect` — `initConnectionListeners()` + `initIpChangerListeners()` (both return cleanup promises, unlistened on unmount).
4. `useSquircleClip()` → `ref` on the shell div.
5. Render tree: `TooltipProvider > Toaster > MotionConfig(reducedMotion="user") > div.window-shell > (CloseDialog, AmbientBackground, TitleBar, screen area)`.
6. Screen area: `AnimatePresence mode="sync"` picks `SidecarErrorScreen` when `useConnectionStore.sidecarError` is truthy (retry = `retryAfterSidecarError()` + `connect()`), else `MainScreen`.

### 2. MainScreen composition (src/App.tsx:57-256)

Top→bottom inside `div.relative.z-10.flex.h-full.flex-col`:

- skip-link `<a href="#main">`, `NotificationBanner`
- fixed-height (`h-60`) hero with `ConnectButton`
- `#main` block: `LeakBanner` (only when `leakStatus === "leak" && status.state === "Connected"`), `ConnectionStatusLine`, `PublicLocation`, `TrafficStats`, connected-only cluster (`CopyProxyButton` + `PacUrl`), `QuickConnect`, `QuickProtocol`
- footer: `AppMenu` + `⌘K` hint + "shortcuts ?" button (dispatches `CustomEvent("aether:open-shortcuts")`)
- overlays: active-apps `Dialog` (contains `ActiveConnections compact`), `CommandPalette`, `OnboardingTour`, `ShortcutsDialog`, five `PanelDialog`s.

Local state: `panel: PanelId | null`, `activeOpen`, `paletteOpen`, `highlightScanMode`.
`PanelId = "advanced" | "presets" | "ipchanger" | "history" | "settings"` (defined in `src/components/AppMenu.tsx:9`).

Lazy-loaded panel contents (each wrapped in `Suspense fallback={<PanelSkeleton/>}` + `ErrorBoundary label=… onReset={closePanel}`):

| PanelId | lazy import | dialog icon/title |
|---|---|---|
| `advanced` | `@/components/AdvancedPanel` → `AdvancedPanelContent` | `Settings2` / "Advanced" |
| `presets` | `@/components/ProfilePresets` → `ProfilePresetsContent` | `Bookmark` / "Presets" |
| `ipchanger` | `@/components/ip-changer/IpChangerPanel` → `IpChangerContent` | `Globe` / "IP Changer" |
| `history` | `@/components/ConnectionHistoryContent` → `ConnectionHistoryContent` | `Clock` / "History" |
| `settings` | `@/components/SettingsPanel` → `SettingsContent` | `Settings` / "Settings" |

Side effects in `MainScreen`:
- when `status.state === "Connected"`: `refreshActiveConns()` immediately + every **2000 ms** (interval cleared on disconnect).
- listens for window `CustomEvent("aether:toggle-palette")` to flip `paletteOpen` (dispatched by `useKeyboardShortcuts` on ⌘K/Ctrl-K).
- `openAdvancedHighlightScan()` sets `highlightScanMode` for 2000 ms while opening the Advanced panel (scan-mode highlight cue).

### 3. Tauri event flow into state

```
Rust backend
  ├─ emit "aether://status"      → connectionStore.status  (+ desktop notification on transitions)
  ├─ emit "aether://log"         → connectionStore.logs (batched 100 ms)  and  log-window.ts allLines (immediate)
  ├─ emit "aether://traffic"     → connectionStore.traffic
  ├─ emit "aether://tor-status"  → connectionStore.engineTorStatus
  ├─ emit "aether://psiphon-status" → connectionStore.enginePsiphonStatus
  ├─ emit "ip-changer://status"  → ipChangerStore.status/error
  ├─ emit "ip-changer://log"     → ipChangerStore.logs + bootstrap %
  └─ emit "app://focused" / window.onFocusChanged → windowFocus module

initConnectionListeners() then seeds initial state with
  invoke("get_status" | "get_default_profile" | "get_traffic_stats"
       | "get_engine_tor_status" | "get_engine_psiphon_status")
  (event-received flags prevent the initial fetch from overwriting a fresher event)
```

### 4. Separate log window data path

```
AdvancedPanel / ConnectionStatusLine / CommandPalette
   └─ openLogWindow()  (src/lib/log-window.ts)
        └─ new WebviewWindow("log-window", { url: "/log-window.html", … })
             └─ log-window.html + src/log-window.ts
                  ├─ listen("aether://log")     ← SAME backend event, independent subscription
                  └─ listen("aether://status")  ← badge text/color
```

**No `postMessage`, no `localStorage` bridge, no shared Zustand store** — the log window is a second webview that re-subscribes to the same Tauri events. `VirtualLogList` (inside `AdvancedPanel`, fed by `useConnectionStore.logs`) is therefore a *separate* consumer of the same event stream: main window shows store-capped 500 lines (virtualized, `@tanstack/react-virtual`), log window keeps its own 2000-line buffer.

## Key details

### App bootstrap & shell

- `src/App.tsx` exports `App` (named + default) and `AccordionPanel = PanelId | null`; `MainScreen` is module-private.
- Shell markup: `div.window-shell.flex.flex-col.bg-background` — `.window-shell` = `width:100%; height:100dvh; border-radius: var(--window-radius-tl) var(--window-radius-tr) var(--window-radius-br) var(--window-radius-bl); border:1px solid var(--window-ring); box-shadow: inset 0 1px 0 0 var(--window-highlight)` (index.css:247).
- `useSquircleClip()`: if `CSS.supports("corner-shape","squircle")` → sets `corner-shape: squircle` inline; else JS fallback builds an iOS-style superellipse `clip-path: path(...)` with coefficients `IOS_R1 = 0.0586`, `IOS_R2 = 0.332`, re-applied by `ResizeObserver`.
- Motion constants: `SPRING`, `SCREEN_FADE` from `@/lib/motion`; entrance delays 0.04 s (main block) and 0.08 s (footer).
- Accessibility bits in shell: `TooltipProvider`, skip-link, `aria-label` buttons, `aria-describedby={undefined}` on the active-apps dialog.

### Window/panel structure & Tauri window behaviors

Main window config (`src-tauri/tauri.conf.json`): `title "Aether-GUI"`, `width 420`, `height 640`, `minWidth 320`, `minHeight 400`, `center true`, `decorations false`, `transparent true`, `shadow false`, `resizable true`.

Wired from `App.tsx` (implementations in components/hooks, listed here because App composes them):

- **Position persistence** — `useWindowPersist()`: on mount `invoke<[number,number,number,number]|null>("get_window_position")` → `[x,y,w,h]` sanity-checked (`x >= -100 && y >= -100 && w > 100 && h > 100`) then `setPosition`/`setSize`; on `window.resize` and `getCurrentWindow().onMoved` schedules a 500 ms debounced `invoke("save_window_position", { x, y, width, height })`.
- **Close-to-tray** — `<CloseDialog/>` rendered by App; choice `"tray"` → `setCloseToTray(true)` (`invoke("set_close_to_tray", { enabled })`) + `tauriWindow()?.hide()`; `"close"` → `setCloseToTray(false)` + `close()`. Memoized choice also mirrored to `localStorage["aether-close-choice"]` (`syncCloseChoice`, src/lib/close.ts).
- **Minimize** — `<TitleBar/>`: `void tauriWindow()?.minimize()`. (`minimize_on_startup` toggle is read/written via `invoke("get_minimize_on_startup")`/`invoke("set_minimize_on_startup", { enabled })` from `MinimizeOnStartupToggle`.)
- **Drag regions** — `data-tauri-drag-region` attributes on `<header>` and its children in `TitleBar.tsx`; index.css adds `.light [data-tauri-drag-region] { color: var(--foreground); }` so drag text stays legible in light mode; permitted by `core:window:allow-start-dragging` in `capabilities/default.json`.
- **Dialogs** — Radix-based: `PanelDialog` (×5, one per `PanelId`), `CommandPalette`, `OnboardingTour`, `ShortcutsDialog`, active-apps `Dialog`, `CloseDialog`, sonner `Toaster`.
- Main-window capability permissions (`src-tauri/capabilities/default.json`, windows `["main"]`): `core:event:default`, `core:window:allow-is-focused`, `core:window:allow-start-dragging`, `core:window:allow-close`, `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-show`, `core:window:allow-hide`, `core:window:allow-set-always-on-top`, `core:window:allow-is-always-on-top`, `core:webview:allow-create-webview-window`, `notification:default`, `autostart:default`, `shell:allow-open`, `dialog:default`, `clipboard-manager:allow-write-text`, `clipboard-manager:allow-read-text`.

### Zustand store #1 — `useConnectionStore` (`src/state/connectionStore.ts`)

`create<ConnectionState>()` from `zustand`; interface at line 69.

**State fields (value type — default):**

| field | type | default |
|---|---|---|
| `status` | `ConnectionStatus` | `{ state: "Idle" }` |
| `engineTorStatus` | `EngineTorStatus` | `{ enabled: false, ready: false, address: null }` |
| `enginePsiphonStatus` | `EnginePsiphonStatus` | same shape, `null` address |
| `profile` | `ConnectionProfile` | `defaultConnectionProfile()` from `@/lib/profile-defaults` |
| `logs` | `LogLine[]` | `[]`, hard-capped `MAX_LOG_LINES = 500` |
| `sidecarError` | `string \| null` | `null` |
| `scanBudgetSecs` | `number \| null` | `null` |
| `history` | `ConnectionHistoryEntry[]` | `[]` |
| `publicIp` | `PublicInfo \| null` | `null` |
| `directIp` | `PublicInfo \| null` | `null` |
| `publicIpLoading` | `boolean` | `false` |
| `publicIpLatencyMs` | `number \| null` | `null` |
| `publicIpHistory` | `number[]` | `[]`, last 20 latency samples |
| `leakStatus` | `"none" \| "leak" \| "unavailable"` | `"unavailable"` |
| `traffic` | `TrafficStats \| null` | `null` |
| `activeConns` | `ActiveConn[]` | `[]` |

**Actions (grouped):**

- `connect()` — zod-validates (`connectionProfileSchema.parse` + `validateActiveProfile`); validation failure → local `status = { state:"Error", message, phase:"validation" }`; else `invoke("connect", { profileOverride: profile })`. Error handling: `/binary not found|engine incompatible|engine_incompatible/i` → `sidecarError`; `/already running/i` → swallowed; else `status = { state:"Error", message, phase:"launching" }`.
- `disconnect()` → `invoke("disconnect")`, errors swallowed.
- Profile setters — ~90 of them (`setProtocol`, `setScanMode`, `setIpVersion`, `setQuickReconnect`, `setMasqueHttp2`, `setMasqueNoize`, `setWgNoize`, `setBindAddress`, `setHttpProxyAddress`, `setUpstreamProxy`, `setWiwPeers`, `setLogLevel`, `setPerf`, `setCaptureMode`, `setDnsMode`, `setTunAddress`, `setTunDns`, `setDnsServers`, `setRouteBlock`, `setRouteDirect`, `setRouteSniff`, `setRouteSniffMs`, `setAutoReprovision`, `setZtTeam`, `setZtAccessEmail`, `setZtAccessId`, `setZtAccessSecret`, `setZtAccessToken`, `setZtGateway`, `setMim`, `setMimPeers`, `setQuicV2`, `setFwMark`, `setEngineTorMode`, `setEngineTorBind`, `setEngineTorDir`, `setEngineTorBridges`, `setEngineTorBridgesFile`, `setEngineTorNoBridges`, `setEngineTorForceBridges`, `setEngineTorRelays`, `setEngineTorRelayPorts`, `setEnginePsiphonMode`, `setEnginePsiphonBind`, `setPsiphonShape`, `setPsiphonRegion`, `setExitLoc`, `setExitLocSecs`, `setStats`, `setStatsSecs`, `setEngineTorPt`, `setEngineTorPtDir`, `setEngineTorCountry`, `setEngineTorDirectSecs`, `setEngineTorStallSecs`, `setMaxClients`, `setHalfCloseSecs`, `setTcpKeepaliveSecs`, `setTcpConnectSecs`). Two shapes: `createPersistSetter(key)` factory (set → `schedulePersist()`) or the equivalent inline `set(s => ({profile:{...s.profile, k:v}})); schedulePersist();`.
  `schedulePersist()` = module-level debounce **500 ms** → `invoke("set_default_profile", { profile })`, errors swallowed.
- `applyProfile(value)` — `connectionProfileSchema.parse` + `validateActiveProfile`, **throws** on invalid, else sets profile + schedules persist.
- `retryAfterSidecarError()` → `sidecarError: null`.
- `loadHistory()` → `invoke<ConnectionHistoryEntry[]>("get_history")`; `clearHistory()` → `invoke("clear_history")` + local `history: []`.
- `runPublicIpCheck()` — single-flight (`ipCheckAbort` AbortController + `ipCheckInFlight` promise); fires two parallel `invoke<PublicInfo|null>("get_public_ip", { throughTunnel })` calls (`throughTunnel = connected`, and `throughTunnel: false`); latency = `performance.now()` delta; leak rule: when connected and tunnel result exists → `direct && tunnel.ip === direct.ip ? "leak" : "none"`; when not connected → `"unavailable"`. Stores `publicIp`, `directIp`, `publicIpLatencyMs`, appends to `publicIpHistory` (`.slice(-20)`).
- `refreshActiveConns()` → `invoke<ActiveConn[]>("get_active_connections")`.
- `reloadProfile()` → `invoke<ConnectionProfile>("get_default_profile")`, zod-parsed; logs `console.error("Failed to reload profile:", e)` on failure.

**IPC surface (exact strings):**

- invokes: `"connect"` `{ profileOverride }`, `"disconnect"`, `"set_default_profile"` `{ profile }`, `"get_default_profile"`, `"get_status"`, `"get_history"`, `"clear_history"`, `"get_public_ip"` `{ throughTunnel }`, `"get_active_connections"`, `"get_traffic_stats"`, `"get_engine_tor_status"`, `"get_engine_psiphon_status"`.
- events: `"aether://status"`, `"aether://log"`, `"aether://traffic"`, `"aether://tor-status"`, `"aether://psiphon-status"`.
- desktop notifications via dynamic import of `@tauri-apps/plugin-notification` (`isPermissionGranted` → `requestPermission` → `sendNotification({title:"Aether-GUI", body})`) on transitions to `Connected` (`"Connected successfully" + " (TUN mode)" | " (Proxy + TUN)"` when `profile.capture_mode` is `tun`/`both`), `Error` (`"Connection failed: <message>"`), `Reconnecting` (`"Connection lost, reconnecting..."`). Only fires when the new state string differs from `lastNotifiedState`.
- `aether://log` handling: payloads pushed into `pendingLogs`, flushed at most every **100 ms**; each flush scans lines with `BUDGET_RE = /budget=(\d+)s/` and, when matched, sets `scanBudgetSecs`; `logs` appended and `.slice(-500)`.
- Side effects of `"aether://status"` payload: on `Launching` → clears `scanBudgetSecs`, `traffic`, `activeConns`; on `Idle`/`Error` → clears `traffic`, `activeConns`.
- Guard: `isTauriEnvStore()` (`window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_IPC__`) — in a plain browser `initConnectionListeners()` is a no-op returning `() => {}`.
- Dev hook: `if (import.meta.env.DEV) window.__conn = useConnectionStore`.

### Zustand store #2 — `useIpChangerStore` (`src/stores/ipChangerStore.ts`)

`MAX_LOG_LINES = 400`.

**State fields (default):**

| field | default |
|---|---|
| `status` | `"stopped"` (`"stopped" \| "starting" \| "running" \| "stopping" \| "error"`) |
| `error` | `null` |
| `currentIp` | `null` (`PublicInfo \| null`) |
| `bootstrapPercent` | `null` |
| `bootstrapPhase` | `null` |
| `_lastProbeNote` | `null` (dedupe key for repeated probe log notes) |
| `ipChecking` | `false` |
| `binaryAvailable` | `true` |
| `logs` | `[]` (capped 400) |
| `rotating` | `false` |
| `transitioning` | `false` |
| `lastRotatedAt` | `null` |
| `rotationCount` | `0` |
| `autoRotateEnabled` | `false` |
| `autoRotateIntervalSecs` | `60` |
| `socksAddr` | `{ host: "127.0.0.1", port: 9050 }` |
| `lanEnabled` | `false` |
| `ipProxyEnabled` | `false` |
| `torEngine` | `{ using_system:false, bundled_available:true, system_available:false, system_path:null }` |

**Actions → IPC:**

| action | invoke(s) |
|---|---|
| `logLine(line)` | none (local append, oldest evicted) |
| `start()` / `stop()` | `invoke("start_tor")` / `invoke("stop_tor")`, wrapped in `transitioning` |
| `rotate()` | `invoke("rotate_ip")` → sets `lastRotatedAt = Date.now()`, `rotationCount + 1`, then `setTimeout(refreshIp, 4000)` |
| `refreshIp()` | if `status !== "running"` clears `currentIp`; else `invoke<PublicInfo\|null>("get_current_ip")`; null result logs a deduped note (`"[tor] exit IP not reachable yet (tor bootstrapping N%)"` when `bootstrapPercent < 100`, else `"[tor] exit IP lookup: no exit circuit yet — retrying…"`) |
| `setAutoRotate(enabled, intervalSecs?)` | `invoke("set_auto_rotate", { intervalSecs: secs, enabled })` |
| `setLan(enabled)` | `invoke("set_tor_lan", { enabled })` then `invoke<TorSocksAddr>("get_socks_addr")` |
| `setIpProxy(enabled)` | `invoke("set_ip_proxy", { enabled })`; returns `null` or error string |
| `setTorEngine(useSystem)` | `invoke("set_use_system_tor", { useSystem })`; returns `null` or error string |
| `refreshAll()` | parallel `invoke` of `get_tor_status`, `get_auto_rotate`, `tor_binary_exists`, `get_socks_addr`, `get_tor_lan`, `get_system_proxy_state` (`.catch(()=>null)`), `get_tor_source` (`.catch(()=>null)`); `ipProxyEnabled = proxy?.owner === "ip_changer"`; then `refreshIp()` |
| `clearLogs()` | local |

**Events:** `ip-changer://status` (payload `TorStatus`) → `mapStatus()`: `Running→running`, `Starting→starting`, `Stopping→stopping`, `Stopped→stopped`, `Error→{status:"error", error:message}`; on `Stopped`/`Error` also clears `currentIp`, `bootstrapPercent`, `bootstrapPhase`, `_lastProbeNote`.
`ip-changer://log` (payload `LogLine`) → appends to `logs` and parses `BOOT_RE = /Bootstrapped (\d+)% \((\w+)(?::|\))/` into `bootstrapPercent`/`bootstrapPhase` (also resets `_lastProbeNote`); when `percent >= 100` and `status === "running"` triggers `refreshIp()`.

### `src/state/windowFocus.ts` — the third "store" (not Zustand)

- Module-level `let focused = true` + `Set<() => void>` listeners, exposed as `useWindowFocused(): boolean` via `useSyncExternalStore`.
- Feeds: `listen<boolean>("app://focused", …)` (source tag `"rust"`) and `getCurrentWindow().onFocusChanged(...)` (source tag `"tauri"`); `record()` keeps a debug `eventLog` and installs `window.__focus = { state: () => boolean, events: () => last 10 }`.
- Same `isTauriEnv()` triple check; in a browser neither listener is installed.
- Consumers: `ConnectionStatusLine`, `MagicRings` (slice-owned by other agents).

### `src/log-window.ts` + `log-window.html`

- **Opened by** `openLogWindow()` (`src/lib/log-window.ts`): label `LOG_WINDOW_LABEL = "log-window"`, options `{ url: "/log-window.html", title: "Aether - Live Log", width: 860, height: 560, minWidth: 400, minHeight: 300, center: false, decorations: false, transparent: false, backgroundColor: "#09090b", resizable: true, dragDropEnabled: false }`. Single-instance guard: cached `WebviewWindow` → `isVisible()` → `setFocus()`; stale handle caught → `logWindow = null`. `once("tauri://error")` and `once("tauri://close-requested")` reset the handle.
- **Permissions:** `src-tauri/capabilities/log-window.json` → `windows: ["log-window"]`, permissions `core:event:default`, `core:window:allow-close` (only these two — enough for `listen()` and `getCurrentWindow().close()`).
- **Communication with main window:** *only* shared Tauri events. `log-window.ts` does top-level `await listen<LogLine>("aether://log", …)` and `await listen<{ state: string }>("aether://status", …)`. No `postMessage`, no `localStorage`, no shared store, no IPC back to the main window.
- **Buffer/render:** `MAX_LINES = 2000` (older lines dropped sets `truncated = true` → forces full rebuild). `render()`: full rebuild when `filterText !== "" || truncated || renderedCount > allLines.length`, otherwise appends only `allLines[renderedCount:]`. Timestamps are relative to a `baseTs` (first matching line when filtering, else `allLines[0].timestamp`) rendered as `+X.Xs`. `getLevelClass` colors lines containing `error|failed|fatal` → `.level-error` (`#f87171`), `warn` → `.level-warn` (`#fbbf24`). Search wraps matches in `<mark>` using `color-mix(in srgb,var(--primary) 28%,transparent)` after `escapeHtml`.
- **Status badge:** `aether://status` payload `.state` → `#statusBadge` text + colors `{ Connected: #4ade80, Error: #f87171, Connecting/Launching: #fbbf24, Reconnecting: #fb923c }`, default `{bg:"rgba(99,102,241,0.15)", fg:"#818cf8"}`.
- **Controls:** scroll within 24 px of bottom toggles `autoScroll`; `autoScrollBtn` forces on; `clearBtn` empties buffer; `searchInput` case-insensitive substring filter; `closeBtn` → `getCurrentWindow().close()`.
- **Styling:** self-contained inline `<style>` with its own tokens `--bg-0 #09090b`, `--bg-1 #111113`, `--bg-2 #18181b`, `--bg-3 #1e1e22`, `--border rgba(255,255,255,0.06)`, `--text #fafafa`, `--text-dim #a1a1aa`, `--text-muted #52525b`, `--primary #6366f1` (indigo — **different from the main app's orange `--primary: #ea580c`**), `--primary-dim`, `--accent #818cf8`; fonts `'Inter'` UI + `'JetBrains Mono'/'Cascadia Code'/'Fira Code'/'Consolas'` for `.log-viewport`; `-webkit-app-region: drag` titlebar; `user-select: text` re-enabled only on `.log-viewport`; `@media (prefers-reduced-motion: reduce)` disables `.log-line` animation.
- **Build:** `vite.config.ts` `rollupOptions.input` = `{ main: index.html, "log-window": log-window.html }` → both pages ship in `dist/`.

### `src/types/*`

- **`connection.ts`** — `ConnectionStatus` (see state machine), string-unions: `Protocol = "auto"|"masque"|"wireguard"|"gool"`, `ScanMode = "turbo"|"balanced"|"thorough"|"verified"|"ironclad"`, `IpVersion = "v4"|"v6"|"both"`, `MasqueNoize = "firewall"|"gfw"|"light"|"off"`, `WgNoize = "balanced"|"aggressive"|"light"|"off"`, `LogLevel = "error"|"warn"|"info"|"debug"|"trace"`, `PerfLevel = "low"|"medium"|"high"`, `CaptureMode = "proxy"|"tun"|"both"`, `DnsMode = "forward"|"direct"`, `EngineTorMode = "disabled"|"tor"|"tor-reverse"|"tor-only"`, `EnginePsiphonMode = "disabled"|"psiphon"|"psiphon-reverse"|"psiphon-only"`, `PsiphonShape = "auto"|"cdn"|"direct"`.
  `ConnectionProfile` — 61 snake_case fields mirroring the Rust struct (full list at lines 25-85: `protocol` … `tcp_connect_secs`; notable ones: `bind_address`, `http_proxy_address`, `upstream_proxy`, `wiw_peers`, `tun_address`, `tun_dns`, `dns_servers`, `route_block[]`, `route_direct[]`, `route_sniff_ms`, `zt_*` (5 ZeroTier fields), `mim`, `mim_peers`, `quic_v2`, `fw_mark`, `engine_tor_*` (mode/bind/dir/bridges/bridges_file/no_bridges/force_bridges/pt/pt_dir/country/direct_secs/stall_secs/relays/relay_ports), `engine_psiphon_mode/bind`, `psiphon_shape`, `psiphon_region`, `exit_loc`, `exit_loc_secs`, `stats`, `stats_secs`, `max_clients`, `half_close_secs`, `tcp_keepalive_secs`, `tcp_connect_secs`).
  Also `EngineTorStatus { enabled, ready, address }`, `EnginePsiphonStatus = EngineTorStatus` (alias), `LogLine { line, timestamp }`, `PublicInfo { ip, ip_version: "IPv4"|"IPv6", country_code, city, org }`, `ConnectionHistoryEntry { protocol, scan_mode, timestamp, duration_secs, success }`, `ActiveConn { pid, exe, local, remote, state, proto }`, `TrafficStats { tx_bytes, rx_bytes, tx_rate, rx_rate }`.
- **`ipChanger.ts`** — `TorStatus` union `{state:"Stopped"|"Starting"|"Running"|"Stopping"} | {state:"Error", message}`; `AutoRotateConfig { enabled, interval_secs }`; `TorSocksAddr { host, port }`; `TorSourceInfo { using_system, bundled_available, system_available, system_path }`.
- **`engine.ts`** — `EngineInfo { version: string|null, expected_version: string, path: string|null, source: string|null, compatible: boolean, transports_available: boolean, problem: string|null }`; consumed only by `AboutDialog` (`invoke<EngineInfo>("get_engine_info")`).
- **`three.d.ts` ambient-shadow trick** — the file is a *script* `.d.ts` (no top-level import/export), so its `declare module "three" { … }` is an **ambient module declaration**: it supplies a hand-written, 8-class replacement surface (`WebGLRenderer` (loose `any` opts/`scene`/`camera`, `capabilities.isWebGL2`, `dispose`, `domElement`), `Scene.add(obj: any)`, `OrthographicCamera` (`position: { z: number }`), `ShaderMaterial`, `Mesh`, `PlaneGeometry`, `Vector2`, `Color`) instead of `three`'s shipped `^0.180.0` typings. Consumer is `src/components/MagicRings.tsx` (`import * as THREE from 'three'`), whose usage (`new THREE.WebGLRenderer({alpha:true})`, `camera.position.z = 1`, `new THREE.Vector2()`, `new THREE.Color().set(hex)`, `new THREE.ShaderMaterial({…})`, `new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat)`, `renderer.render(scene, camera)`, `renderer.capabilities.isWebGL2`) matches the declared surface exactly — i.e. only the tiny used subset is type-checked, with `any` holes where three's real types are strict. `tsconfig.app.json` pairs this with `skipLibCheck: true`, `"types": ["vite/client"]`, `moduleResolution: "bundler"`, `strict: true`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `include: ["src"]`, path alias `@/* → ./src/*`. Vite `manualChunks` isolates `node_modules/three` into a `three` chunk. [UNCERTAIN] whether the ambient declaration fully *precedes* three's own `node_modules` typings or is merged/suppressed under `skipLibCheck` — no `tsc` run was performed; the observable intent (small loose surface, zero three `.d.ts` checking) is unambiguous from the file + usage.

### `src/index.css` — theme architecture

1. **Imports (lines 1-6):** `tailwindcss` (Tailwind **v4** CSS-first, no `tailwind.config.js`), `tw-animate-css`, `shadcn/tailwind.css` (resolved to `node_modules/shadcn/dist/tailwind.css`, provides `data-open`/`data-closed`/… variants), then `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`, `@fontsource-variable/geist`.
2. **Variants:** exactly one custom variant declared — `@custom-variant dark (&:is(.dark *))` (class-based theming driven by `App`'s `useLayoutEffect`). ⚠️ `App.tsx:163` uses `light:bg-white` / `light:shadow-lg`, but **no `@custom-variant light` exists anywhere** (`grep` over `src/`, shadcn/tw-animate/tailwind packages = 0 hits) and the shipped build has **0 occurrences of `light\` selectors in `dist/assets/main-*.css`** → those two classes are inert in production. Light mode instead works through `:root.light` variable swaps plus the `.light .bg-background` etc. overrides at lines 187-213.
3. **`@theme inline` (lines 10-62)** maps Tailwind utilities onto raw custom properties: `--font-sans: "Geist Variable", sans-serif`, `--font-mono: "JetBrains Mono Variable", ui-monospace, monospace`, `--font-heading: var(--font-sans)`; `--color-background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring` + sidebar set; `--color-surface-1..4`; `--color-status-connected/-connecting/-error/-idle`; `--color-chart-1..5`; `--shadow-glass`; radius scale from `--radius`: `--radius-sm = *0.6`, `md = *0.8`, `lg = 1`, `xl = *1.4`, `2xl = *1.8`, `3xl = *2.2`, `4xl = *2.6`.
4. **Dark tokens on `:root` (default theme, 64-126):** `--background #0d0d0f`, `--foreground #f4f4f3`, `--card #19191c`, `--popover #1e1e20`, **`--primary #ea580c`** (orange), `--primary-foreground #0d0d0f`, `--secondary/--muted/--accent #232326`, `--muted-foreground #9f9fa3`, `--border/--input rgba(255,255,255,0.07)`, `--ring #ea580c`, **`--radius: 1.375rem`**, sidebar mirrors, surfaces `--surface-1 #131316` … `--surface-4 #28282e`, status `--status-connected #2dd4bf`, `--status-connecting #f2711c`, `--status-error #ef4444`, `--status-idle #6b6b70`, charts `oklch(...)`.
5. **Glass tokens:** `--glass-blur: 20px`, `--glass-saturate: 1.35`, `--glass-bg` / `--glass-bg-strong` / `--glass-bg-float` (`color-mix` of `--surface-*` with `transparent`), `--glass-ring`, `--glass-highlight`, `--shadow-glass` (3-layer drop+inset shadow). `@media (prefers-reduced-transparency: reduce)` neutralizes blur/saturate/opacities.
6. **Window tokens:** `--window-radius: 50px` + per-corner `--window-radius-tl/tr/bl/br`, `--window-ring: rgba(255,255,255,0.08)`, `--window-highlight: rgba(255,255,255,0.05)` — consumed by `.window-shell` and by `useSquircleClip`'s `readCSSCornerRadii()`.
7. **Light tokens on `:root.light` (144-185):** `--background #f4f4f3`, `--card #ffffff`, same `--primary #ea580c`, `--border rgba(0,0,0,0.07)`, surfaces `--surface-1 #ffffff` … `--surface-4 #dddcd8`, status `#0d9488 / #ea580c / #dc2626 / #9ca3af`, `--glass-blur: 18px`, white-based glass, inverted `--shadow-glass`.
8. **Light-mode utility repairs (187-213):** `.light .bg-background`, `.light .text-foreground`, `.light .bg-surface-2`, `.light .text-muted-foreground`, `.light .ring-white\/5`, `.light .ring-white\/10`, `.light .bg-black\/10`, `.light .bg-black\/20`, `.light [data-tauri-drag-region]`.
9. **Base layer:** `* { @apply border-border outline-ring/50; corner-shape: squircle; }` (native squircle by default) with `.corner-round { corner-shape: round; }` opt-out; `body { @apply text-foreground; background: transparent; font-optical-sizing: auto }`; `html, body, #root { height:100%; overflow:hidden; overscroll-behavior:none; background:transparent }` (transparent body because the Tauri window is `transparent: true`); `::selection` = `color-mix(in srgb, var(--primary) 30%, transparent)`.
10. **Utilities:** `.window-shell`, `.glass` / `.glass-strong` / `.glass-float` (backdrop-filter blur+saturate), `.text-balance`, `.tracking-tight-display`, `.transition-smooth` (200 ms `cubic-bezier(.4,0,.2,1)`), `.transition-fast` (100 ms), `.hover-lift` (`translateY(-1px)`), `.active-press` (`scale(0.98)`).
11. **Scrollbars:** global `scrollbar-width: thin` + 4 px `::-webkit-scrollbar*` using `color-mix(in srgb, var(--foreground) …)`.
12. **Animations:** keyframes `ring-breathe`, `ring-pulse-fast`, `ring-pulse-slow`, `glow-pulse`, `scan-sweep`, `orb-drift-a`, `orb-drift-b`, `strand-pulse`, `strand-breathe`, `side-ray-pulse`, `spin`, `log-in`; utility classes `.anim-ring-breathe` (4.5 s), `.anim-ring-pulse-fast` (1.6 s), `.anim-ring-pulse-slow` (2.4 s), `.anim-glow-fast`/`.anim-glow-slow` (1.6/2.4 s), `.anim-orb-a` (10 s), `.anim-orb-b` (13 s), `.anim-scan-sweep` (1.2 s), `.anim-spin` (0.8 s), `.anim-log-in` (0.22 s). `@media (prefers-reduced-motion: reduce)` disables `ring-breathe`, `orb-a`, `orb-b`, `scan-sweep`, `log-in`.

### Persistence

The frontend **never imports `@tauri-apps/plugin-store`** — all persistence goes through `invoke(...)`, and the Rust side maps these to tauri-plugin-store files.

**`settings.json` keys the frontend reaches (indirectly, exact strings):**

| key (in `settings.json`) | frontend command | shape |
|---|---|---|
| `always_on_top` | `invoke("set_always_on_top", { enabled })` / `invoke("get_always_on_top")` | bool (default false) |
| `minimize_on_startup` | `invoke("set_minimize_on_startup", { enabled })` / `invoke("get_minimize_on_startup")` | bool (default false) |
| `close_to_tray` | `invoke("set_close_to_tray", { enabled })` / `invoke("get_close_to_tray")` | bool (default false; `tray.rs` `STORE_FILE="settings.json"`, `STORE_KEY="close_to_tray"`) |
| `window_position` | `invoke("save_window_position", { x, y, width, height })` / `invoke("get_window_position")` → `[x,y,w,h]` | `{ "x": f64, "y": f64, "width": f64, "height": f64 }` |
| `ip_changer_use_system_tor` | `invoke("set_use_system_tor", { useSystem })` (from `useIpChangerStore.setTorEngine`) | bool; read at startup in `lib.rs` |

**Other store files touched by frontend commands (not `settings.json`, listed for clarity):** `profile.json` → key `last_successful_profile` (via `get_default_profile` / `set_default_profile` — this is how the profile debounce persists); `history.json` → key `connection_history` (via `get_history` / `clear_history`, backend caps `MAX_ENTRIES = 20`).

**`localStorage` keys owned/read by the shell:** `aether-theme` (`"dark"` \| `"light"` \| `"system"`, default dark), `aether-custom-primary`, `aether-custom-secondary` (constants `PRIMARY_KEY`/`SECONDARY_KEY` in `src/lib/theme.ts`), `aether:onboarded` (`"1"`, `OnboardingTour`), `aether-close-choice` (`"close"` \| `"tray"`, `CLOSE_CHOICE_KEY` in `src/lib/close.ts`), `aether-sound-enabled` (default `true`), `aether-sound-volume` (default `0.5`).

**Settings export/import (`SettingsIO.tsx`)** serializes `{ version: 1, profile, presets, settings: { close_to_tray, always_on_top, minimize_on_startup } }` to a user file `aether-gui-settings.json` (dialog default name, not the runtime store).

### Connection state machine (frontend view)

`ConnectionStatus` (`src/types/connection.ts:2-9`) — discriminated union on `state`:

| variant | payload | how the frontend learns it |
|---|---|---|
| `Idle` | — | `get_status` / `aether://status` |
| `Launching` | — | event; clears `scanBudgetSecs`, `traffic`, `activeConns` |
| `Connecting` | — | event |
| `Connected` | `socks_addr: string`, `bridge_addr: string`, `connected_at_ms: number` | event / `get_status` |
| `Reconnecting` | `attempt: number`, `max_attempts: number` | event → notification "Connection lost, reconnecting..." |
| `Disconnecting` | — | event |
| `Error` | `message: string`, `phase: string` | event, or **locally synthesized** with `phase: "validation"` (frontend `validateActiveProfile`) / `phase: "launching"` (invoke rejection) |

**How `Connected` is decided on the frontend:** exclusively `status.state === "Connected"` where `status` is either the seed from `invoke<ConnectionStatus>("get_status")` or the payload of `listen<ConnectionStatus>("aether://status")` — the frontend never infers connection from traffic/proxy probes. Callers: `App/MainScreen` (`isConnected`, gates active-conn polling + connected cluster), `isLeaking` (`leakStatus === "leak" && state === "Connected"`), `runPublicIpCheck` (`connected = get().status.state === "Connected"` → `throughTunnel` argument of `get_public_ip`), `useKeyboardShortcuts` (only connects from `Idle`/`Error`), `ConnectionHistoryContent` (transition detection). Separate but adjacent: `sidecarError` (regex on the `connect` rejection) swaps the whole screen to `SidecarErrorScreen`; `leakStatus` is `"none"|"leak"|"unavailable"` from the dual `get_public_ip` comparison.

### Exact string index (quick reference)

- Tauri events consumed in this slice: `"aether://status"`, `"aether://log"`, `"aether://traffic"`, `"aether://tor-status"`, `"aether://psiphon-status"`, `"ip-changer://status"`, `"ip-changer://log"`, `"app://focused"`, `"tauri://error"`, `"tauri://close-requested"`; window events `onFocusChanged`, `onMoved`.
- DOM `CustomEvent`s: `"aether:toggle-palette"` (dispatched by `useKeyboardShortcuts`, listened in `MainScreen`), `"aether:open-shortcuts"` (dispatched by `MainScreen` footer + `useKeyboardShortcuts`, listened in `ShortcutsDialog`).
- Invokes in this slice: `connect`, `disconnect`, `get_status`, `get_default_profile`, `set_default_profile`, `get_traffic_stats`, `get_engine_tor_status`, `get_engine_psiphon_status`, `get_history`, `clear_history`, `get_public_ip`, `get_active_connections`, `save_window_position`, `get_window_position`, `start_tor`, `stop_tor`, `rotate_ip`, `get_current_ip`, `set_auto_rotate`, `get_auto_rotate`, `set_tor_lan`, `get_tor_lan`, `get_socks_addr`, `set_ip_proxy`, `set_use_system_tor`, `get_tor_status`, `tor_binary_exists`, `get_system_proxy_state`, `get_tor_source`.
- Window labels: main = `"main"` (implicit from config), log viewer = `"log-window"`.
- Dev server: `port 1420`, `strictPort: true`.

## Links to other sections

- **Frontend components (`src/components/`)** — everything rendered by `MainScreen`/`App`: `TitleBar` (minimize + drag regions), `CloseDialog` (close-to-tray), `ConnectButton` (drives `connect()`/`disconnect()`), `ConnectionStatusLine` (+ `useWindowFocused`), `AdvancedPanel` (hosts `VirtualLogList` and `openLogWindow()`), `AppMenu`/`PanelId`, `SettingsPanel`/`SettingsIO` (settings.json key set), `MagicRings`/`AmbientBackground` (only consumer of `three.d.ts`).
- **Frontend lib/hooks (`src/lib/`, `src/hooks/`)** — `lib/log-window.ts` (opener referenced above), `lib/close.ts`, `lib/theme.ts`, `lib/sound.ts`, `lib/motion.ts` (`SPRING`, `SCREEN_FADE`), `lib/profile-defaults.ts` + `lib/validators.ts` (profile defaults and `validateActiveProfile` used by `connect()`/`applyProfile`), `hooks/useWindowPersist`, `hooks/useSquircleMask`, `hooks/useKeyboardShortcuts`, `hooks/useConnectionSound`, `hooks/useIpChangerSound`, `hooks/usePaletteItems`.
- **Backend (`src-tauri/`)** — every invoke/event string above must have a matching `#[tauri::command]` / `emit` (registration list in `src-tauri/src/lib.rs`); store key definitions in `commands.rs`, `tray.rs`, `history.rs`, `aether/profiles.rs`, `ip_changer.rs`; window geometry in `tauri.conf.json`; permissions in `capabilities/{default,log-window}.json`.
- **Build/packaging** — `vite.config.ts` two-entry build and `three`/`motion`/`radix` manual chunks; `dist/index.html` + `dist/log-window.html` must both ship.
