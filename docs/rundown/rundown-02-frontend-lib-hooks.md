# Frontend `src/lib/` and `src/hooks/` (slice 02)

All paths relative to `E:/Projects/Aether-GUI/`. Every claim below was read from source; line numbers refer to the files as read during this investigation.

## File inventory

| path | ~size | purpose |
| --- | --- | --- |
| `src/lib/validators.ts` | 16.7 KB | Zod schemas + imperative validators for every `ConnectionProfile` field, plus cross-field `validateActiveProfile()` used before connect/import. |
| `src/lib/theme.ts` | 7.4 KB | Applies custom primary/secondary accent colors as CSS custom properties on `<html>`, deriving dark/light surface ramps; re-applies on class change. |
| `src/lib/toast.ts` | 653 B | Wraps `sonner`'s `toast` so `toast.success` / `toast.error` also play a sound cue. |
| `src/lib/profile-defaults.ts` | 1.7 KB | `defaultConnectionProfile()` factory (the canonical defaults) + `supportsFirewallMark()` platform check. |
| `src/lib/sound.ts` | 1.8 KB | Sound preference store (localStorage-persisted enabled/volume, `useSyncExternalStore` hook) around the `cuelume` package; `cue()` player. |
| `src/lib/motion.ts` | 832 B | Shared `framer-motion`/`motion/react` spring transitions and variants (`SPRING`, `SPRING_FAST`, `SPRING_SHEET`, `SPRING_HERO`, `FADE_UP`, `SCREEN_FADE`). |
| `src/lib/log-window.ts` | 1003 B | Opens/focuses the secondary "Live Log" Tauri webview window (`log-window` label). |
| `src/lib/close.ts` | 1.2 KB | Close-button behavior: saved close choice (`close` vs `tray`), close-dialog event, `set_close_to_tray` IPC. |
| `src/lib/location.ts` | 2.0 KB | ISO-3166 alpha-2 → display name lookup (112 entries) for exit-country rendering. |
| `src/lib/format.ts` | 522 B | Human-readable byte/rate formatting (B/KB/MB/GB, B/s…MB/s). |
| `src/lib/utils.ts` | 172 B | `cn()` = `twMerge(clsx(...))` class-name combiner. |
| `src/hooks/usePaletteItems.ts` | 27.5 KB | Builds the whole command-palette item list (groups, ids, actions), with recent/pinned persistence. |
| `src/hooks/useKeyboardShortcuts.ts` | 1.4 KB | Global keydown handler: connect/disconnect, palette toggle, shortcuts dialog. |
| `src/hooks/useConnectionSound.ts` | 819 B | Plays a cue on each connection-state transition. |
| `src/hooks/useIpChangerSound.ts` | 686 B | Plays a cue on each IP-Changer (Tor) status transition. |
| `src/hooks/useLocked.ts` | 196 B | `true` while the tunnel is busy (not `Idle`/`Error`) — disables profile edits. |
| `src/hooks/useWindowPersist.ts` | 1.9 KB | Restores window geometry on mount and persists moves/resizes (debounced) via Tauri IPC. |
| `src/hooks/useSquircleMask.ts` | 4.2 KB | Applies iOS-style squircle corner clipping to the root window container (`useSquircleClip`). |

## Architecture / data flow

1. **Boot**: `src/main.tsx:8` calls `initSound()` (reads `aether-sound-enabled` / `aether-sound-volume`, calls `setEnabled`/`setVolume`, then `bind(document)` so declarative `data-cuelume-*` attributes work). `src/App.tsx` then mounts `usePaletteItems`, `useSquircleClip`, `useWindowPersist`, `useKeyboardShortcuts`, `useConnectionSound`, `useIpChangerSound` (`App.tsx:35,46-49,53`).
2. **Profile lifecycle**: `src/state/connectionStore.ts` imports `defaultConnectionProfile` (`:32`) and `connectionProfileSchema` + `validateActiveProfile` (`:33`). `setProfile` parses (`connectionStore.ts:168-171`), `connect` re-parses and on error sets `status = { state: "Error", message: error, phase: "validation" }` (`:189-193`). Field components (`BindAddressField`, `UpstreamProxyField`, `RouteRulesField`, …) call the matching `validate*` function for inline error text; `AdvancedPanel.tsx:86` calls `validateActiveProfile(profile)` for a whole-panel banner.
3. **Theme**: `ColorTheme.tsx` / `ThemeToggle.tsx` call `applyColors(primary, secondary)`; `App.tsx:282` dynamically imports `applyColors` on theme change; `initThemeColors()` installs a `MutationObserver` on `<html class>` so dark/light flips re-derive surfaces. Theme *mode* lives in `localStorage["aether-theme"]` (read by `App.tsx:269`, `ColorTheme.tsx:87`, written by `usePaletteItems.ts:636` and `ThemeToggle.tsx:54`).
4. **Close flow**: `TitleBar.tsx:70` → `handleClose()` → either `hide()` / `close()` per saved `aether-close-choice`, or dispatch `aether:request-close-dialog`, which `CloseDialog.tsx:25` listens for; the dialog persists the choice and calls IPC `set_close_to_tray`. `CloseToTrayToggle.tsx` and `SettingsIO.tsx:28` mirror it with `syncCloseChoice()` + `invoke("set_close_to_tray", { enabled })`.
5. **Window geometry**: `useWindowPersist` → `invoke("get_window_position")` once, then `save_window_position` on debounced `resize`/`onMoved`.
6. **Sound**: two hook subscriptions (`useConnectionStore`, `useIpChangerStore`) and `toast.success/error` all funnel into `cue(name)` → `cuelume.play`.
7. **Command palette**: `useKeyboardShortcuts` dispatches `aether:toggle-palette` → `App.tsx:81` flips palette open → `CommandPalette` renders `usePaletteItems(setPanel).filter(...)`, recording executed ids back via `recordPaletteRecent`.

## Key details

### `src/lib/validators.ts` — exported API

Low-level helpers:
- `hostPortRegex = /^\S+:\d+$/`, `hostRegex = /^\S+$/` (line 6-7). **No consumer found anywhere in `src/`** — dead exports as far as this repo goes.
- `isValidIPv4(host: string): boolean` — strict 4-octet, rejects leading zeros (`String(n) === s`).
- `isValidPort(p: string): boolean` — digits only, `1..65535`.
- `numericSocket(value: string): { ip: string; port: number } | null` — trims, matches `^(\[[^\]]+\]|[^:]+):(\d+)$`, then canonicalizes the IP (`canonicalIp`): accepts IPv4 or bracketed IPv6, and unfolds IPv4-mapped `::ffff:aabb:ccdd` into dotted quad via `new URL(...)`.
- Internal (not exported): `isValidOctet`, `hostHasSpaces`, `canonicalIp`, `validPeers(value, allowAuto)` (1–2 comma-separated `IP:port`, all valid, distinct IPs; `"auto"` allowed when `allowAuto`), `exitLocOk`.

Shared message: `socketMessage = "Use numeric IP:port (bracket IPv6), port 1–65535"` (line 63).

#### Zod schemas (field-level)

| schema | validates | rule | error message |
| --- | --- | --- | --- |
| `bindAddressSchema` | `bind_address` | `numericSocket(v) !== null` (required) | `Use numeric IP:port (bracket IPv6), port 1–65535` |
| `httpProxyAddressSchema` | `http_proxy_address` | empty OK, else `numericSocket` | same `socketMessage` |
| `engineTorBindSchema` | `engine_tor_bind` | **alias of `httpProxyAddressSchema`** (line 165) | same |
| `upstreamSchema` | `upstream_proxy` | optional scheme `socks5h?://`/`https?://`, optional `user@`, optional bracketed IPv6, optional `:port` validated with `isValidPort`; no whitespace | `Invalid upstream proxy` |
| `wiwPeersSchema` | `wiw_peers` | `validPeers(v, false)` (no `"auto"`) | `Provide one or two numeric IP:port endpoints with different IP addresses` |
| `mimPeersSchema` | `mim_peers` | `validPeers(v, true)` (`"auto"` allowed) | `Use 'auto' or one or two numeric IP:port endpoints with different IP addresses` |
| `dnsServersSchema` | `dns_servers` | comma tokens, none containing whitespace | `DNS entries must not contain spaces` |
| `routeRuleSchema` | each of `route_block`/`route_direct` | non-empty, no whitespace | `Rule must not be empty` / `Rules can't contain spaces — separate entries with commas or new lines.` |
| `ztTeamSchema` | `zt_team` | no whitespace | `Team name must not contain spaces` |
| `fwMarkSchema` | `fw_mark` | `0x…` hex ≤ `0xffffffff` or decimal integer `0..4294967295` | `Mark must be 0..4294967295 or 0x hex` |
| `countrySchema` | `engine_tor_country`, `psiphon_region` | `/^[A-Za-z]{2}$/` after trim | `Country must be 2-letter code` |

#### Imperative `validate*` wrappers (return `string | null`)

All are thin `safeParse` wrappers returning `issues[0].message` (fallback in parentheses): `validateBindAddress` ("Invalid bind address"), `validateUpstream` ("Invalid upstream proxy"), `validateWiwPeers` ("Invalid WARP-in-WARP peers"), `validateDnsServers` ("Invalid DNS servers"), `validateRouteRules(rules: string[])` (loops, fallback `` `"${r}" is invalid` ``), `validateZtTeam` ("Invalid team name"), `validateMimPeers` ("Invalid MiM peers"), `validateFwMark` ("Invalid mark"), `validateEngineTorBind` ("Invalid Tor bind address"), `validateCountry` ("Invalid country").

Non-Zod ones:
- `validateRouteSniffMs(v: number | null)` — `null` OK; else integer (`Must be an integer`), `≥ 0` (`Must be ≥ 0`), `≤ 10000` (`Must be ≤ 10000`).
- `validateUint32(value: number | null)` — `null` OK; else integer `0..0xffffffff` → `Must be an integer from 0 to 4294967295`.

#### Profile shape

`profileShape` (line 247-312) is a strict-ish `z.object(...).passthrough()` covering **every** `ConnectionProfile` key. Notable enums/transforms:
- `protocol: ["auto","masque","wireguard","gool"]`
- `scan_mode: ["turbo","balanced","thorough","verified","ironclad","stealth"]` with `.transform` → `"stealth"` becomes `"verified"`.
- `ip_version: ["v4","v6","both"]`, `masque_noize: ["firewall","gfw","light","off"]`, `wg_noize: ["balanced","aggressive","light","off"]`
- `log_level: ["error","warn","info","debug","trace"] | null`, `perf: ["low","medium","high"] | null`
- `capture_mode: ["proxy","tun","both"]`, `dns_mode: ["forward","direct"]`
- `engine_tor_mode: ["disabled","tor","tor-reverse","tor-only","tor_reverse","tor_only"]` → underscore spellings normalized to hyphenated.
- `engine_psiphon_mode: ["disabled","psiphon","psiphon-reverse","psiphon-only","psiphon_reverse","psiphon_only"]` → same normalization.
- `psiphon_shape: ["auto","cdn","direct"]`, `engine_tor_relay_ports: ["web","any"] | null`
- arrays: `route_block`, `route_direct`, `engine_tor_bridges`; numbers nullable: `route_sniff_ms`, `engine_tor_direct_secs`, `engine_tor_stall_secs`, `exit_loc_secs`, `stats_secs`, `max_clients`, `half_close_secs`, `tcp_keepalive_secs`, `tcp_connect_secs`.

`connectionProfileSchema = z.preprocess(fn, profileShape)` — the preprocessor merges `defaultConnectionProfile()` **minus** `protocol`/`scan_mode`/`ip_version` under the incoming value (so callers must supply those three explicitly), i.e. `{ ...defaults, ...value }` for non-object/array input passthrough otherwise (line 314-319).

#### `validateActiveProfile(p: ConnectionProfile): string | null` (line 331-407)

Cross-field rules, in order:
1. **Listener set**: always `bind_address`; `http_proxy_address` when non-blank; `engine_tor_bind` (defaulting to `127.0.0.1:1820`) when `engine_tor_mode` is `tor`/`tor-reverse`; `engine_psiphon_bind` (default `127.0.0.1:1821`) when `engine_psiphon_mode` is `psiphon`/`psiphon-reverse`.
   - parse failure → `` `${name}: Use numeric IP:port (bracket IPv6), port 1–65535` ``
   - collision (same port and same IP, or either is `[::]`, or same-family wildcard `0.0.0.0`) → `` `${name} conflicts with ${other.name}; choose separate listener addresses/ports` ``
2. **Engine compatibility** (exact strings):
   - `tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`
   - `psiphon-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)`
   - `psiphon-only cannot be combined with engine Tor — both claim the primary listener`
   - `tor-only cannot be combined with engine Psiphon — both claim the primary listener`
   - `tor-reverse and psiphon-reverse cannot both run — each needs MASQUE as its sole outer tunnel`
3. **Conditional field checks** collected as `[field, error]`, rendered as `` `${field}: ${error}` ``:
   - `wiw_peers` only when WARP active (`engine_tor_mode !== "tor-only" && engine_psiphon_mode !== "psiphon-only"`) **and** `protocol === "gool"`
   - `mim_peers` only when WARP active and MASQUE (`auto`/`masque`) and `p.mim`
   - `fw_mark` only when `supportsFirewallMark()`
   - `route_sniff_ms` only when `p.route_sniff`
4. **TUN**: when `capture_mode !== "proxy"` — `tun_address` must be `ip/prefix` with no extra segment and prefix ≤ 32 (v4) / 128 (v6) → `tun_address: use a valid IP/prefix`; `tun_dns` must parse → `tun_dns: invalid IP`.
5. **Tor bridges policy**: conflict among `engine_tor_force_bridges`, manual entries/`engine_tor_bridges_file`, `engine_tor_no_bridges` → `Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled`; `engine_tor_country` via `validateCountry`; `engine_tor_relays` must be `auto`/`only`/`off`/a number → `engine_tor_relays: use auto, only, off, or a number`.
6. `psiphon_region` validated when Psiphon enabled.
7. `exit_loc` → `exit_loc: comma-separated two-letter country codes, optional leading ! (e.g. "DE,SE,!IR")`.
8. Uint32 sweep over `route_sniff_ms, engine_tor_direct_secs, engine_tor_stall_secs, exit_loc_secs, stats_secs, max_clients, half_close_secs, tcp_keepalive_secs, tcp_connect_secs`.

`validateProfile(profile: unknown)` — schema parse (issues joined as `path: message; …`) then `validateActiveProfile`. **No consumer in `src/`** (grep found only its definition); the store/import paths call `connectionProfileSchema.parse` + `validateActiveProfile` directly.

### `src/lib/theme.ts`

- Persistence keys exported here: `PRIMARY_KEY = "aether-custom-primary"`, `SECONDARY_KEY = "aether-custom-secondary"` (localStorage, written by `ColorTheme.tsx`/`ThemeToggle.tsx`). The dark/light **mode** key is `"aether-theme"` — defined elsewhere (`ThemeToggle.tsx:9` `THEME_KEY`, `App.tsx:269`, `usePaletteItems.ts:633`), values `"dark"`/`"light"` (`ThemeToggle` also cycles `"system"`).
- `SECONDARY_DEFAULT = "#242424"`.
- `PRIMARY_COLORS: [string, string][]` (12, hex→name): `#f2711c` Orange, `#ea580c` Deep Orange, `#dc2626` Red, `#e11d48` Rose, `#a855f7` Purple, `#6366f1` Indigo, `#3b82f6` Blue, `#06b6d4` Cyan, `#14b8a6` Teal, `#22c55e` Green, `#84cc16` Lime, `#eab308` Yellow.
- API: `applyColors(primary, secondary, dark?)`, `initThemeColors()`, `clearCustomColors()`, `getLastColors()` (**no consumer found in `src/`**).
- `isDarkMode()` = `!document.documentElement.classList.contains("light")`.
- Tokens set by `applyColors` (always): `--primary`, `--ring`, `--color-primary`, `--color-ring`, `--color-sidebar-primary`, `--color-sidebar-ring`, `--primary-foreground` (`#0d0d0f` when primary L>50 else `#f2f2f2`), `--status-connecting`, `--color-status-connecting`.
  - **Dark branch**: `--secondary`/`--color-secondary`, `--card`, `--popover`, `--muted`, `--accent` all = `secondary`; foregrounds `#f2f2f2` (card/popover/secondary/accent) and `--muted-foreground #a3a3a3`; surfaces `--surface-1..4` + `--color-surface-1..4` from `deriveSurfaces` (same hue, saturation capped 20/18/15/12%, lightness 10/12/15/18%).
  - **Light branch**: `--secondary`/`--muted` = `lightenForLight(secondary)` (sat ≤15%, L≥85%), `--card`/`--popover` = `#ffffff`, foregrounds `#171717`, `--muted-foreground #525252`; surfaces from `deriveLightSurfaces` (sat ≤10/8/6/5%, lightness 98/94/90/85%).
- `resetColors()` (exposed via `clearCustomColors`) removes exactly that property list; `initThemeColors()` observes `class` on `<html>` and re-applies `lastPrimary`/`lastSecondary`.

### `src/lib/toast.ts`

`export const toast = Object.assign(fn, {success, error, info, warning, loading, message, promise, custom, dismiss})`. Only `success`/`error` are wrapped: they call `cue("success")` / `cue("error")` before delegating to `sonner`.

### `src/lib/profile-defaults.ts`

`defaultConnectionProfile(): ConnectionProfile` — verbatim object (lines 4-21):

```ts
protocol: "auto", scan_mode: "turbo", ip_version: "v4",
quick_reconnect: true, masque_http2: false, masque_noize: "firewall", wg_noize: "balanced",
bind_address: "127.0.0.1:1819", http_proxy_address: null, upstream_proxy: null, wiw_peers: null,
log_level: null, perf: null, capture_mode: "proxy", dns_mode: "forward",
tun_address: "10.0.0.2/24", tun_dns: "8.8.8.8", dns_servers: null,
route_block: [], route_direct: [], route_sniff: true, route_sniff_ms: null, auto_reprovision: true,
zt_team: null, zt_access_email: null, zt_access_id: null, zt_access_secret: null, zt_access_token: null, zt_gateway: false,
mim: false, mim_peers: null, quic_v2: true, fw_mark: null,
engine_tor_mode: "disabled", engine_tor_bind: null, engine_tor_dir: null,
engine_tor_bridges: [], engine_tor_force_bridges: false, engine_tor_bridges_file: null,
engine_tor_no_bridges: false, engine_tor_pt: null, engine_tor_pt_dir: null,
engine_tor_country: null, engine_tor_direct_secs: null, engine_tor_stall_secs: null,
engine_psiphon_mode: "disabled", engine_psiphon_bind: null, psiphon_shape: "auto",
psiphon_region: null, engine_tor_relays: null, engine_tor_relay_ports: null,
exit_loc: null, exit_loc_secs: null, stats: false, stats_secs: null,
max_clients: null, half_close_secs: null, tcp_keepalive_secs: null, tcp_connect_secs: null,
```

`supportsFirewallMark(): boolean` — `navigator.platform` matches `/linux/i` **or** `navigator.userAgent` matches `/android/i`.

### `src/lib/sound.ts`

- Keys: `SOUND_ENABLED_KEY = "aether-sound-enabled"`, `SOUND_VOLUME_KEY = "aether-sound-volume"`. Defaults: `DEFAULT_ENABLED = true`, `DEFAULT_VOLUME = 0.5`.
- API: `setSoundEnabled(next: boolean)`, `setSoundVolume(next: number)` (clamped 0–1), `cue(name?: SoundName, options?: {volume?: number})`, `initSound()`, `useSoundPrefs()` → `{ enabled, volume }` via `useSyncExternalStore`.
- `initSound()` reads localStorage, pushes into `cuelume` (`setEnabled`, `setVolume`) and `bind(document)` (delegates `data-cuelume-*` attributes used by `ui/button.tsx:61`, `ui/switch.tsx:12`, `ui/toggle.tsx:39`, `ui/toggle-group.tsx:74`, `AppMenu.tsx:55`).
- Backend package: `cuelume@0.2.2` (17 sounds: `chime, sparkle, droplet, bloom, whisper, tick, press, release, toggle, success, error, page, loading, ready, pulse, scan, arrival`; `play()` defaults to `"chime"`).

**All `cue()` call sites and triggers in `src/`:**

| cue | trigger (file) |
| --- | --- |
| `success` / `error` | `toast.success/error` (any caller); copy SOCKS/PAC (`CopyProxyButton.tsx:20`, `PacUrl.tsx:22,26`, `LogViewer.tsx:39`, `usePaletteItems.ts:212-213,225-226`) |
| `bloom` | connection → `Connected` (`useConnectionSound.ts:17`) |
| `error` | connection → `Error` (`:18`); IP changer → `error` (`useIpChangerSound.ts:18`) |
| `loading` | connection → `Reconnecting` (`useConnectionSound.ts:19`) |
| `ready` | connection → `Idle` after a previous state (`:20`) |
| `arrival` | IP changer status → `running` (`useIpChangerSound.ts:17`) |
| `pulse` | Connect button click (`ConnectButton.tsx:124`) |
| `scan` | scan-mode change (`ScanModeToggle.tsx:41`) |
| `sparkle` | accent color picked (`ColorTheme.tsx:47`) |
| `chime` | theme toggled (`ThemeToggle.tsx:52`) |
| `droplet` | window minimize (`TitleBar.tsx:50`) |
| `page` | dialog opened (`ui/dialog.tsx:58`) |
| `whisper` | popover opened (`ui/popover.tsx:17`) |
| `tick` | select option chosen (`ui/select.tsx:115`) |
| `release` | volume slider committed (`SoundSettings.tsx:32`) |

### `src/lib/motion.ts`

`SPRING` `{type:"spring", bounce:0, duration:0.4}`; `SPRING_FAST` `…0.25`; `SPRING_SHEET` `{bounce:0.15, duration:0.5}`; `SPRING_HERO` `{bounce:0.3, duration:0.6}`; `FADE_UP` (y 8→0, exit y -4/0.15s); `SCREEN_FADE` (y 6→0, exit opacity/0.12s).
Consumers: `SPRING`/`SPRING_FAST` are used across components (`ConnectButton`, `GlassAccordion`, `LeakBanner`, `QuickConnect`, `QuickProtocol`, `ConnectionStatusLine`, …); `SCREEN_FADE` + `SPRING` in `App.tsx:52,320,330`. **`SPRING_SHEET`, `SPRING_HERO`, `FADE_UP` have no consumer in `src/`** (grep over `src/` found only their definitions).

### `src/lib/log-window.ts`

`LOG_WINDOW_LABEL = "log-window"` (module-private). `openLogWindow(): Promise<void>`: if a cached `WebviewWindow` exists and `isVisible()` → `setFocus()`; stale handle (throw) resets it; otherwise creates `new WebviewWindow("log-window", { url: "/log-window.html", title: "Aether - Live Log", width: 860, height: 560, minWidth: 400, minHeight: 300, center: false, decorations: false, transparent: false, backgroundColor: "#09090b", resizable: true, dragDropEnabled: false })`. Listens `tauri://error` (logs + clears handle) and `tauri://close-requested` (clears handle).
Callers: `AdvancedPanel.tsx:420`, `ConnectionStatusLine.tsx:149`, `usePaletteItems.ts:245`.

### `src/lib/close.ts` ↔ backend

- `CLOSE_DIALOG_REQUEST_EVENT = "aether:request-close-dialog"`, `CLOSE_CHOICE_KEY = "aether-close-choice"`, `type CloseChoice = "close" | "tray" | null`.
- `tauriWindow()` — `getCurrentWindow()` wrapped in try/catch (null outside Tauri); module-level `appWindow = tauriWindow()`.
- `handleClose()` — reads `localStorage["aether-close-choice"]`: `"tray"` → `appWindow.hide()`; `"close"` → `appWindow.close()`; unset/invalid → dispatch `aether:request-close-dialog`.
- `syncCloseChoice(enabled: boolean)` — writes `"tray"`/`"close"`.
- `setCloseToTray(enabled)` → `invoke("set_close_to_tray", { enabled })`.
- `CloseDialog.tsx` (listener at `:25`): on choice, `localStorage.setItem(CLOSE_CHOICE_KEY, choice ?? "close")`, then `setCloseToTray(true/false)` + `hide()`/`close()`. `CloseToTrayToggle.tsx:34-39` and `SettingsIO.tsx:28` keep localStorage and backend in sync (SettingsIO's command map: `close_to_tray`, `always_on_top`, `minimize_on_startup` → `set_close_to_tray`, `set_always_on_top`, `set_minimize_on_startup`).

### `src/hooks/useWindowPersist.ts` ↔ backend

- Guard `isTauriEnv2()`: `window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_IPC__`; non-Tauri (browser dev) → hook does nothing.
- On mount: `invoke<[number,number,number,number] | null>("get_window_position")` → `[x, y, w, h]`; applied only if `x >= -100 && y >= -100 && w > 100 && h > 100` via `win.setPosition` + `win.setSize` (sanity clamp keeps off-screen restores from resurrecting).
- Save path: reads `win.outerPosition()` + `win.outerSize()` → `invoke("save_window_position", { x, y, width, height })`, debounced **500 ms**; triggered by `window "resize"` and Tauri `getCurrentWindow().onMoved()`. All errors swallowed; cleanup removes listener, unlistens move, clears timer.

### `src/hooks/useKeyboardShortcuts.ts` — every binding

Single `window keydown` listener (registered in `useEffect`, App-level):

| keys | condition | action |
| --- | --- | --- |
| `Ctrl+Shift+C` (`e.code === "KeyC"`) | always | `preventDefault`; if state `Idle`/`Error` → `connect()`, else if `Connected`/`Connecting`/`Reconnecting`/`Launching` → `disconnect()` (from `useConnectionStore.getState()`) |
| `Meta+K` or `Ctrl+K` (`e.key.toLowerCase() === "k"`) | always | `preventDefault`; dispatch `CustomEvent("aether:toggle-palette")` (listened at `App.tsx:81`) |
| `?` **or** `Meta+/` / `Ctrl+/` | target is **not** `INPUT`/`TEXTAREA`/contentEditable | `preventDefault`; dispatch `CustomEvent("aether:open-shortcuts")` (listened at `ShortcutsDialog.tsx:16`) |

### `src/hooks/usePaletteItems.ts` — command palette inventory

Exports: `usePaletteItems(setPanel: (v: PanelId | null) => void): PaletteItem[]` and `recordPaletteRecent(id: string)`. `PaletteItem` (from `components/CommandPalette.tsx:8`) = `{ id, label, hint?, keywords?, group, icon, run }`.

Persistence: `RECENT_KEY = "aether:palette:recent"` (JSON array, newest first, capped at 3), `PINNED_KEY = "aether:palette:pinned"` (JSON array → `Set`). Every `run` is wrapped by `wrapRun(id, fn)` → `recordPaletteRecent(id)` then the action. Output is `[...Pinned, ...Recent, ...rest]`, with pinned items re-grouped as `"Pinned"` and recent as `"Recent"` (recent sorted by recorded order).

Helpers: `openAdvanced(fieldId?)` = `setPanel("advanced")` + `scrollToField(fieldId)` (rAF + 80 ms timeout → `document.getElementById(id).scrollIntoView({behavior:"smooth", block:"center"})`); `openSettings(fieldId?)` same with `setPanel("settings")`.

Store inputs: `useConnectionStore` (`status, profile, logs, leakStatus, connect, disconnect, setProtocol, setScanMode, setIpVersion, setMasqueHttp2, setMasqueNoize, setWgNoize, setLogLevel, setPerf, setQuickReconnect, setAutoReprovision, setRouteSniff, setCaptureMode, setDnsMode, setZtGateway, runPublicIpCheck`) and `useIpChangerStore` (`status, start, stop, rotate, autoRotateEnabled, setAutoRotate`). Derived: `locked = state !== "Idle" && state !== "Error"`, `connected = state === "Connected"`, `torRunning = status === "running"`.

**Groups and items (exact ids → behavior):**

- **Panels** — `panel-advanced`, `panel-presets`, `panel-ipchanger`, `panel-history`, `panel-settings`: each `setPanel(<id>)`.
- **Actions**
  - `action-disconnect` (only when `Connected|Connecting|Reconnecting|Launching`) → `disconnect()`; else `action-connect` → `connect()`.
  - `action-copy-socks` → clipboard `writeText(socksAddr)` (`@tauri-apps/plugin-clipboard-manager`) + `cue("success"|"error")`; `socksAddr` = `status.bridge_addr` when connected else `"127.0.0.1:1819"`.
  - `action-copy-pac` → builds an inline PAC (`FindProxyForURL` … `return "SOCKS5 ${socksAddr}; DIRECT";` with LAN bypass for `127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`) and copies `data:application/x-ns-proxy-autoconfig,<encoded>`.
  - `action-recheck-ip` (label flips to `Re-check IP — leak detected` when `leakStatus === "leak"`) → `runPublicIpCheck()`.
  - `action-open-log` (hint `${logs.length} lines`) → `openLogWindow()`.
- **Protocol & tuning** — `tuning-turbo|balanced|thorough|verified` → `setScanMode(mode)` (labels: Fast/Balanced/Secure/Verified); `tuning-ironclad` shown only when `scan_mode === "ironclad"` with **no-op** `run: () => {}`. `protocol-auto|masque|wireguard|gool` → `setProtocol(value)` (gool labeled "WARP-in-WARP").
- **Advanced** — `ipver-v4|v6|both` → `setIpVersion` (gated: `toast.error("Disconnect first to change IP version")`), then `openAdvanced()`; `masque-http3` → `setMasqueHttp2(false)`, `masque-http2` → `setMasqueHttp2(true)` (gated: `"Disconnect first to change transport"`); obfuscation items: MASQUE protocol → `noize-firewall|gfw|light|off` → `setMasqueNoize`, else WireGuard → `noize-wg-balanced|aggressive|light|off` → `setWgNoize` (gated: `"Disconnect first to change this setting"`), all followed by `openAdvanced()`.
- **Network** — `field-socks` → `openAdvanced("aether-field-socks-port")`, `field-http-proxy` → `openAdvanced("aether-field-http-proxy")`, `field-upstream` → `openAdvanced("aether-field-upstream")`, `field-dns` → `openAdvanced("aether-field-dns")`. (Navigation only; values shown in `label`/`hint`.)
- **Routing** — `field-route-block` → `openAdvanced("aether-field-route-block")`, `field-route-direct` → `openAdvanced("aether-field-route-direct")`, `toggle-sniff` → `setRouteSniff(!route_sniff)` (locked-gated), `field-sniff-ms` → `openAdvanced("aether-field-sniff-ms")`, `field-wiw` → `openAdvanced("aether-field-wiw-peers")`.
- **Zero Trust** — `field-zt-team` → `openAdvanced("zt-team")`, `toggle-zt-gateway` → `setZtGateway(!zt_gateway)` (locked-gated), `field-zt-email` → `openAdvanced("zt-email")`.
- **Behavior** — `toggle-quick-reconnect` → `setQuickReconnect`, `toggle-reprovision` → `setAutoReprovision` (both locked-gated); `loglevel-auto|error|warn|info|debug|trace` → `setLogLevel` + `openAdvanced("aether-field-log-level")`; `perf-auto|low|medium|high` → `setPerf` + `openAdvanced("aether-field-perf")` (all locked-gated with `"Disconnect first to change this setting"`).
- **Settings** — `capture-proxy|tun|both` → `setCaptureMode` + `openSettings()`; `dnsmode-forward|direct` → `setDnsMode` + `openSettings()`; `settings-always-on-top`, `settings-autostart`, `settings-minimize-startup`, `settings-close-tray`, `settings-accent`, `settings-export`, `settings-import`, `settings-update` → **`openSettings()` only** (navigation, no IPC from the palette); `settings-theme` → `openSettings()` **and** toggles `localStorage["aether-theme"]` (`light`↔`dark`) swapping `documentElement` classes `dark`/`light`.
- **IP Changer** — when `torRunning`: `tor-stop` → `torStop()`, `tor-rotate` → `torRotate()`; else `tor-start` → `torStart()`. Always: `tor-auto-rotate` → `setTorAuto(!autoRotateEnabled)`, `tor-open-panel` → `setPanel("ipchanger")`.
- **Pinned** / **Recent** — synthetic groups only (items copied from above with `group` replaced).

IPC boundary note: the palette itself issues only clipboard `writeText`; every other action delegates to store actions (`connectionStore`/`ipChangerStore`) or UI navigation — the actual Tauri commands live behind those stores/backend slices.

### `src/hooks/useConnectionSound.ts` / `useIpChangerSound.ts`

Both subscribe to their store, keep `lastXRef`, skip no-op transitions and skip everything while `document.hidden`, then:
- connection `status.state`: `Connected` → `cue("bloom")`, `Error` → `cue("error")`, `Reconnecting` → `cue("loading")`, `Idle` (with a previous state) → `cue("ready")`.
- ip changer `status`: `"running"` → `cue("arrival")`, `"error"` → `cue("error")`.

### `src/hooks/useLocked.ts`

`useLocked(): boolean` = `useConnectionStore` selector `s.status.state !== "Idle" && s.status.state !== "Error"`. Consumers: `AdvancedPanel.tsx:75`, `QuickConnect.tsx:61`, `QuickProtocol.tsx:48`. The palette duplicates this expression inline (`usePaletteItems.ts:116`) rather than calling the hook.

### `src/hooks/useSquircleMask.ts`

Exported name is **`useSquircleClip(radius?: number | {tl,tr,br,bl})`** (file name ≠ export name). Constants `IOS_R1 = 0.0586`, `IOS_R2 = 0.332` (corner-path control-point ratios, iOS continuous-curvature style).
- Radii resolution: explicit arg → per-corner object → else read CSS custom props from the element: `--window-radius-tl`/`--window-radius-tr` fallback to `--window-radius` fallback **18**; `--window-radius-br`/`--window-radius-bl` fallback **30** (with `|| <default>` guard for zero).
- Native path: if `CSS.supports("corner-shape", "squircle")` → set `border-radius` + `corner-shape: squircle`, clear `clip-path`.
- Fallback: build an SVG-path `clip-path: path('M 0,tl2 C … Z')` (one cubic per corner, radii clamped to `min(w,h)/2`), recompute on `ResizeObserver` (skip when `0×0`).
- Returns a `RefObject<HTMLDivElement>`; mounted on the App root (`App.tsx:46`).

### `src/lib/location.ts`, `src/lib/format.ts`, `src/lib/utils.ts`

- `location.ts`: `COUNTRY_NAMES: Record<string,string>` with **112** two-letter keys (AD…ZW, no PR/AK-style extras beyond the listed set). `countryName(code: string | null): string` → `"Unknown"` when falsy, else map lookup or `code.toUpperCase()`. Consumers: `PublicLocation.tsx:8`, `ip-changer/IpDisplay.tsx:3`.
- `format.ts`: `formatBytes(bytes)` → `<1024` `${b} B`, `<1MB` `1` decimal KB, `<1GB` `1` decimal MB, else `2` decimal GB; `formatRate(bps)` → `B/s`, `1` decimal `KB/s`, `1` decimal `MB/s`. Consumer: `TrafficStats.tsx:5`.
- `utils.ts`: `cn(...inputs: ClassValue[]) = twMerge(clsx(inputs))` — used in ~40 component files.

## Links to other sections

- **Backend / IPC commands touched from this slice**: `set_close_to_tray` (`close.ts:42`), `save_window_position` + `get_window_position` (`useWindowPersist.ts:22,34`) → backend lifecycle/window slice; `writeText` from `@tauri-apps/plugin-clipboard-manager` (`usePaletteItems.ts:211,224`).
- **Stores**: `state/connectionStore.ts` (imports `profile-defaults`, `validators`; drives `useLocked`, both sound hooks, palette) and `stores/ipChangerStore.ts` (drives `useIpChangerSound`, palette IP-Changer group) → stores slices.
- **Components consuming this slice**: `App.tsx` (hooks + `SCREEN_FADE` + dynamic `applyColors`), `CommandPalette.tsx` (`PaletteItem`, `recordPaletteRecent` interplay), `ShortcutsDialog.tsx` / `TitleBar.tsx` / `CloseDialog.tsx` / `CloseToTrayToggle.tsx` (keyboard + close flow), `ColorTheme.tsx` / `ThemeToggle.tsx` (theme keys), `SoundSettings.tsx` (sound prefs), all `*Field.tsx` + `AdvancedPanel.tsx` + `SettingsIO.tsx` (validators), `PublicLocation.tsx` / `IpDisplay.tsx` (location), `TrafficStats.tsx` (format) → frontend component/chrome slices.
- **Types**: `types/connection.ts` (`ConnectionProfile`, `ScanMode`, `Protocol`, …) and `components/AppMenu.tsx` (`PanelId`) are the contracts this slice compiles against → shell/types slice.
- **Dead/unused exports worth knowing** (grep-verified over `src/`): `validators.hostPortRegex`, `validators.hostRegex`, `validators.validateProfile`, `theme.getLastColors`, `motion.SPRING_SHEET`, `motion.SPRING_HERO`, `motion.FADE_UP`, `usePaletteItems.recordPaletteRecent` (only its own internal `wrapRun` uses it).
