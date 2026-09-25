# Connection & profile-config UI components (slice 03)

All components below live in `src/components/` unless noted. Every one of them reads/writes the single Zustand store `useConnectionStore` (`src/state/connectionStore.ts`) and never talks to Tauri IPC directly — exceptions are called out explicitly. The profile object they mutate is `ConnectionProfile` (`src/types/connection.ts:25-85`); defaults come from `defaultConnectionProfile()` (`src/lib/profile-defaults.ts:3-22`).

## File inventory

| path | ~size | purpose |
|---|---|---|
| `src/components/ConnectButton.tsx` | 8.8 KB | Big round connect/cancel/disconnect/retry button; maps `ConnectionStatus.state` to a 4-phase UI (idle/connecting/connected/error) with lucide icon, error shake, lazy `MagicRings` animation |
| `src/components/QuickConnect.tsx` | 5.6 KB | "Tuning" pill row (Fast/Balanced/Secure/Verified) writing `scan_mode` only, plus a chevron that opens the Advanced panel |
| `src/components/QuickProtocol.tsx` | 4.7 KB | "Protocol" pill row (Auto/MASQUE/WireGuard/WARP-in-WARP) writing `protocol` |
| `src/components/ProtocolSelect.tsx` | 2.2 KB | Dropdown for `protocol` (labelled `aria-label="Protocol"`) used inside AdvancedPanel |
| `src/components/PerfSelect.tsx` | 2.2 KB | Dropdown for `perf` with an `"auto"` display sentinel mapped to `null` |
| `src/components/DnsModeSelect.tsx` | 2.3 KB | Dropdown for `dns_mode` (`forward`/`direct`), mounted in SettingsPanel |
| `src/components/CaptureModeSelect.tsx` | 2.7 KB | Segmented control for `capture_mode`; `tun`/`both` buttons are hard-disabled by `DISABLED_MODES` |
| `src/components/ScanModeToggle.tsx` | 3.0 KB | 5-way segmented control for `scan_mode`, plays `cue("scan")` on change |
| `src/components/NoizeProfileToggle.tsx` | 4.7 KB | Segmented control writing `masque_noize` or `wg_noize` depending on `protocol` |
| `src/components/MasqueTransportToggle.tsx` | 2.5 KB | HTTP/3 ⇄ HTTP/2 segmented control mapping to boolean `masque_http2`; disabled unless protocol is masque/auto |
| `src/components/IpVersionToggle.tsx` | 1.6 KB | Segmented control for `ip_version` (`v4`/`v6`/`both`) |
| `src/components/LogLevelSelect.tsx` | 2.4 KB | Dropdown for `log_level` with `"auto"` → `null` sentinel |
| `src/components/RouteRulesField.tsx` | 2.5 KB | List field for `route_block` / `route_direct` (`kind` prop), comma/newline-separated |
| `src/components/RouteSniffMsField.tsx` | 1.8 KB | Numeric field for `route_sniff_ms` |
| `src/components/BindAddressField.tsx` | 3.6 KB | Port field + LAN switch composing `bind_address` (`127.0.0.1` ⇄ `0.0.0.0`, default port `1819`) |
| `src/components/HttpProxyAddressField.tsx` | 1.8 KB | `host:port` field for `http_proxy_address` |
| `src/components/UpstreamProxyField.tsx` | 1.8 KB | URL field for `upstream_proxy` (`validateUpstream`) |
| `src/components/TunnelDnsField.tsx` | 1.8 KB | Server-list field for `dns_servers` |
| `src/components/MimPeersField.tsx` | 1.8 KB | Peer-list field for `mim_peers` |
| `src/components/WiwPeersField.tsx` | 1.8 KB | Peer-list field for `wiw_peers` (WARP-in-WARP) |
| `src/components/MarkField.tsx` | 2.1 KB | Firewall-mark field for `fw_mark`, disabled off Linux/Android via `supportsFirewallMark()` |
| `src/components/AdvancedPanel.tsx` | 25.1 KB | The whole Advanced settings panel: sections Protocol/Proxy/Routing/Zero Trust/Behavior/Engine Tor/Psiphon/Logs, validation banner, log viewer |
| `src/components/EngineTorPanel.tsx` | 17.4 KB | Built-in arti (Tor) settings block: `engine_tor_*` keys, mode select, bridges, status line |
| `src/components/PsiphonPanel.tsx` | 9.5 KB | Built-in Psiphon settings block: `engine_psiphon_*` keys, shape/region, conflict banners |
| `src/components/ZeroTrustPanel.tsx` | 7.7 KB | Cloudflare Zero Trust fields (`zt_*`) incl. sign-in-code form that pipes into the engine stdin |
| `src/components/ProfilePresets.tsx` | 9.2 KB | Save/apply/delete named profile snapshots via `get_presets`/`save_preset`/`delete_preset` |
| `src/components/LeakBanner.tsx` | 2.1 KB | `role="alert"` banner shown when public IP leaks; Disconnect-now / Re-check actions |
| `src/components/SidecarErrorScreen.tsx` | 2.4 KB | Full-screen "Aether engine failed to start" with download-repair or retry |
| `src/components/SystemProxyToggle.tsx` | 1.9 KB | Switch toggling OS proxy via `get_system_proxy_state` / `set_system_proxy_addr` |
| `src/components/ConnectionStatusLine.tsx` | 6.2 KB | Centered two-line status text + elapsed timer, scan progress bar, error actions |
| `src/components/ActiveConnections.tsx` | 3.6 KB | Per-app connection list (exe/pid/proto/state) with show-all expander |
| `src/components/TrafficStats.tsx` | 5.7 KB | Rates/totals card plus address, protocol, scan mode, TUN badge, app count |

Total: 152 509 bytes across the 32 files (`wc -c`).

## Architecture / data flow

### 1. One store, no local config state
Every config component follows the same shape:

```
useConnectionStore((s) => s.profile.<field>)          // read
useConnectionStore((s) => s.set<Field>)               // write
locked = status.state !== "Idle" && status.state !== "Error"   // or useLocked() from src/hooks/useLocked.ts
<Control disabled={locked} onValueChange={…} />
```

`src/hooks/useLocked.ts` is literally `useConnectionStore((s) => s.status.state !== "Idle" && s.status.state !== "Error")`. Some components inline the same expression instead of calling the hook (e.g. `ProtocolSelect.tsx:23`, `ScanModeToggle.tsx:32`, `PsiphonPanel.tsx:26`, `ZeroTrustPanel.tsx:18`) — same predicate, two spellings.

### 2. Persist path (debounced)
Store setters are created by `createPersistSetter` (`connectionStore.ts`): mutate `state.profile[key]`, then `schedulePersist()` → 500 ms debounce → `invoke("set_default_profile", { profile })`. So typing in any field does not hit disk until it stops changing for half a second.

### 3. Connect path
```
ConnectButton.handleClick / Ctrl+Shift+C (src/hooks/useKeyboardShortcuts.ts:7-16)
  → store.connect()                      connectionStore.ts:187-205
      connectionProfileSchema.parse(profile)   (src/lib/validators.ts:314)
      validateActiveProfile(profile)           (src/lib/validators.ts:331)
        └─ error → status = { state:"Error", message, phase:"validation" }   (no IPC)
      → invoke("connect", { profile: profileOverride })
      catch: /binary not found|engine incompatible|engine_incompatible/i → set({ sidecarError: message })
             /already running/i                                          → ignored (stay as-is)
             otherwise → status = { state:"Error", message, phase:"launching" }
  → backend emits "aether://status" → initConnectionListeners → status re-renders
     button, status line, banners, quick rows (all disabled while locked)
```
`store.disconnect()` → `invoke("disconnect")`, errors swallowed (`async () => {}`).

### 4. Event path (all registered in `initConnectionListeners`, store ~L420-470)
| event | payload | effect |
|---|---|---|
| `aether://status` | `ConnectionStatus` | replaces `status`; on `Launching` resets `scanBudgetSecs`/`traffic`/`activeConns`; on `Idle`/`Error` clears `traffic`+`activeConns`; desktop notification on state change |
| `aether://log` | log line batch | appends to `logs` (cap 500); regex `BUDGET_RE = /budget=(\d+)s/` extracts `scanBudgetSecs` |
| `aether://traffic` | `TrafficStats` | sets `traffic` → `TrafficStats.tsx` |
| `aether://tor-status` | `EngineTorStatus` | sets `engineTorStatus` → `EngineTorPanel` status line |
| `aether://psiphon-status` | `EngineTorStatus` (aliased) | sets `enginePsiphonStatus` → `PsiphonPanel` status line |

### 5. Derived polling owned by App.tsx
- **Active conns**: `App.tsx:72-77` — `refreshActiveConns()` immediately, then `window.setInterval(refresh, 2000)` while `status.state === "Connected"`. Calls `invoke("get_active_connections")`. `ActiveConnections.tsx` itself does no I/O.
- **Leak detection**: `PublicLocation.tsx:21-31` runs `runPublicIpCheck()` on first mount and on every transition into/out of `Connected`. The store compares tunnel IP vs direct IP and sets `leakStatus: "leak" | "none" | "unavailable"`. `App.tsx:60-62` renders `LeakBanner` only when `leakStatus === "leak" && status.state === "Connected"`.

### 6. Mount points (src/App.tsx)
- `MainScreen`: `ConnectButton` (L105), `LeakBanner` (L114, conditional), `ConnectionStatusLine` (L115, with `onTryVerified` → `setScanMode("verified")` + open Advanced), `PublicLocation` (L121), `TrafficStats` (L122, `onOpenActive` opens the active-apps dialog), `QuickConnect` (L142, `onMoreOptions` = same highlight-scan-mode opener), `QuickProtocol` (L143), `ActiveConnections compact` in a Dialog (L176).
- `PanelDialog` "advanced": lazy `AdvancedPanelContent` with `highlightScanMode` (L18-19, L194); "presets": lazy `ProfilePresetsContent` inside `<ErrorBoundary label="presets">` (L21-22, L207-209).
- App-level: `sidecarError ? <SidecarErrorScreen …/> : <MainScreen/>` (L319-333) — the error screen **replaces the entire main screen**, not a banner.
- `openAdvancedHighlightScan` (L85-89): sets `highlightScanMode=true`, opens panel `"advanced"`, clears the flag after 2000 ms; `AdvancedPanelContent` uses it to `scrollIntoView` the ScanMode row (`AdvancedPanel.tsx:100-104`).

## Key details

### Connect flow
- `type Phase = "idle" | "connecting" | "connected" | "error"` derived by `phaseOf(status)`: `"Launching"|"Connecting"|"Reconnecting"|"Disconnecting"` → connecting, `"Connected"` → connected, `"Error"` → error, else idle.
- ARIA labels (`ConnectButton.tsx:61-66`): `Connect (Ctrl+Shift+C)`, `Cancel connecting (Ctrl+Shift+C)`, `Disconnect (Ctrl+Shift+C)`, `Retry connection (Ctrl+Shift+C)`.
- Click: `cue("pulse")`, then idle/error → `connect()`, otherwise `disconnect()`. Button `disabled` only while `status.state === "Disconnecting"`.
- Icons: idle `Power`, connecting `Loader2`, connected `Check`, error `AlertTriangle`; connecting also lazy-loads `MagicRings` (reads CSS var `--primary`, fallback `#f2711c`); error shake; accent `lightenHex(raw, 0.35)`; animations paused when the window is unfocused (`useWindowFocused`).
- Keyboard: `src/hooks/useKeyboardShortcuts.ts:7-16` — `ctrl+shift+KeyC` → connect when `Idle`/`Error`, disconnect when `Connected`/`Connecting`/`Reconnecting`/`Launching` (no-op in `Disconnecting`). Same file also owns Ctrl/Cmd+K palette and `?`/`⌘/` shortcut help. Documented in `ShortcutsDialog.tsx:6` as `Ctrl+Shift+C — Connect / Disconnect`.
- Guards, in order: zod `connectionProfileSchema.parse` + `validateActiveProfile` (errors set `status.phase = "validation"`, no IPC); backend-side `sidecarError` (`binary not found`/`engine incompatible`) replaces the screen; `already running` errors are silently swallowed so a duplicate connect never surfaces as an error. **TUN elevation prompts are not handled in the frontend** — the UI only shows them as `Launching` → "Starting Aether…" / "Answering setup prompts" (`ConnectionStatusLine.tsx:78-81`), and `CaptureModeSelect` hard-disables TUN anyway (below).

### ConnectionStatusLine
- `useElapsed(sinceMs)` ticks locally; attempt clock starts on `"Launching"` and resets to `null` on `"Idle"` (`ConnectionStatusLine.tsx:57-60`).
- `scanPercent = scanBudgetSecs != null ? min(99, round(attemptSeconds/scanBudgetSecs*100)) : null` — `scanBudgetSecs` comes from the log regex, not from IPC.
- Status text map: Idle `Disconnected`/`Click to connect`; Launching `Starting Aether…`/`Answering setup prompts`; Connecting `Finding a route…`/`Still searching · <elapsed>[ · <pct>%]`; Reconnecting `Reconnecting…`/`The tunnel dropped — getting you back · attempt N of M`; Connected `Connected`/`""`; Disconnecting `Disconnecting…`; Error `Couldn't connect`/`status.message`.
- Error adds `role="alert"`/`aria-live="assertive"` on the secondary line plus two buttons: **Try Verified mode** (`onTryVerified`) and **View log** (`openLogWindow()` from `@/lib/log-window`). Connecting shows `<ScanProgressBar>` (44×4 px, also window-focus aware).

### Quick action rows
- `QuickConnect` presets (`QuickConnect.tsx:19-48`): Fast → `scanMode: "turbo"`, Balanced → `"balanced"`, Secure → `"thorough"`, Verified → `"verified"`; **onClick only calls `setScanMode(p.scanMode)`** — the preset's `protocol: "auto"` field is declared but never applied.
- Active-pill map `ACTIVE_PRESET` (`:50-56`): `turbo→"Fast"`, `balanced→"Balanced"`, `thorough→"Secure"`, `verified→"Verified"`, `ironclad→"Secure"` (so Ironclad lights up the Secure pill).
- Locked tooltips are prefixed `Disconnect first — …`; `aria-pressed={active}`; animated underline via `layoutId="quick-connect-underline"`. Chevron button `aria-label="More tuning options"` → `onMoreOptions()`.
- `QuickProtocol` options (`QuickProtocol.tsx:18-43`): `auto`/Auto ("Aether picks the best protocol"), `masque`/MASQUE ("Disguised as ordinary HTTPS"), `wireguard`/WireGuard ("Lighter and faster"), `gool`/WARP-in-WARP ("Double tunnel, maximum security"). Same locked-tooltip and `layoutId="quick-protocol-pill"` pattern.

### Selects & toggles — exact written values
| component | profile key | values (UI label → stored value) | notes |
|---|---|---|---|
| `ProtocolSelect` | `protocol` | Auto→`auto`, MASQUE→`masque`, WireGuard→`wireguard`, WARP-in-WARP→`gool` | `aria-label="Protocol"`, `id` prop passed by AdvancedPanel (`aether-field-protocol`) |
| `ScanModeToggle` | `scan_mode` | Turbo→`turbo`, Balanced→`balanced`, Thorough→`thorough`, Verified→`verified`, Ironclad→`ironclad` | `cue("scan")` before set; `aria-label="Scan mode"` |
| `IpVersionToggle` | `ip_version` | IPv4→`v4`, IPv6→`v6`, IPv4+6→`both` | |
| `MasqueTransportToggle` | `masque_http2` (bool) | HTTP/3→`false`, HTTP/2→`true` | whole group `disabled={locked \|\| notMasque}` where `notMasque = protocol === "wireguard" \|\| protocol === "gool"` |
| `NoizeProfileToggle` | `masque_noize` **or** `wg_noize` | masque map: `firewall`/`gfw`/`light`/`off`; wg map: `balanced`/`aggressive`/`light`/`off` | chooses map by `isMasque = protocol === "auto" \|\| protocol === "masque"` |
| `DnsModeSelect` | `dns_mode` | forward / direct | mounted in SettingsPanel |
| `CaptureModeSelect` | `capture_mode` | Proxy→`proxy`, TUN→`tun`, Both→`both` | **`const DISABLED_MODES: CaptureMode[] = ["tun", "both"]` (line 22) unconditionally disables TUN and Both** (line 42/51) — only Proxy is selectable in this build |
| `PerfSelect` | `perf` | sentinel `auto`→`null`, `low`, `medium`, `high` | |
| `LogLevelSelect` | `log_level` | sentinel `auto`→`null`, `error`, `warn`, `info`, `debug`, `trace` | |

### Field components — shared pattern
Every `*Field` component: `<Input type="text|number">` bound to `profile.<field>`; `locked` disables it; `onChange` stores `e.target.value.trim() || null` (numbers: parsed or `null`); `onBlur` runs the named validator from `@/lib/validators`; error rendered as `<p className="text-[11px] text-status-error">` next to `aria-invalid`; errors auto-clear 2500 ms later via a `setTimeout` kept in a `timerRef`.

| component | key | validator | placeholder / details |
|---|---|---|---|
| `RouteRulesField` | `route_block` / `route_direct` (via `kind: "block" \| "direct"`) | `validateRouteRules` | `string[]` — value split on `/[,;\n]/`, joined with `", "`; placeholder `blocked.example.com, 10.0.0.0/8, port:25`; fixed error "Rules can't contain spaces — separate entries with commas or new lines."; validation only on blur |
| `RouteSniffMsField` | `route_sniff_ms` | `validateRouteSniffMs` (`Must be an integer`, `Must be ≥ 0`) | placeholder `auto`; only rendered when `route_sniff` is on |
| `BindAddressField` | `bind_address` | `validateBindAddress` | `DEFAULT_PORT = "1819"`, `LOOPBACK = "127.0.0.1"`, `ANY = "0.0.0.0"`; port input + "Allow connections from the LAN" switch (`lan = host === ANY`); invalid port resets to 1819 |
| `HttpProxyAddressField` | `http_proxy_address` | `validateDnsServers` | placeholder `127.0.0.1:1818 (off)` — reuses the DNS host:port-list validator (observed, likely intentional overlap) |
| `UpstreamProxyField` | `upstream_proxy` | `validateUpstream` | placeholder `socks5://127.0.0.1:1080 (off)` |
| `TunnelDnsField` | `dns_servers` | `validateDnsServers` | placeholder `1.1.1.1, 1.0.0.1 (default)` |
| `MimPeersField` | `mim_peers` | `validateMimPeers` | placeholder `auto or 203.0.113.1:2408, 198.51.100.1:2408` |
| `WiwPeersField` | `wiw_peers` | `validateWiwPeers` | placeholder `162.159.192.1:2408, 188.114.96.1:2408` |
| `MarkField` | `fw_mark` | `validateFwMark` | `disabled={!supportsFirewallMark()}` (`profile-defaults.ts:24-27`: `/linux/i.test(navigator.platform) \|\| /android/i.test(navigator.userAgent)`); placeholder `100 or 0x64` else `Linux/Android only`; helper "Linux/Android only — needs CAP_NET_ADMIN (SO_MARK)." |

### AdvancedPanel
Exports two symbols: `AdvancedPanelContent({ highlightScanMode })` — the real panel — and `AdvancedPanel(props: { open, onToggle, highlightScanMode })` which **ignores `open`/`onToggle`** and just renders the content (`AdvancedPanel.tsx:454-456`). App.tsx lazy-loads `AdvancedPanelContent`.

Validation banner: `hasValidationError` ORs `validateActiveProfile`, `validateUpstream(upstream_proxy)`, `validateDnsServers(dns_servers)`, `validateRouteRules(route_block)`, `validateRouteRules(route_direct)`, `validateZtTeam(zt_team)` → `InlineErrorBanner` with `profileValidationError ?? "Some fields have errors — fix them before connecting"`.

Section order (all from `Section`/`FieldRow`/`SwitchRow` in `src/components/ui/panel-section.tsx`):
1. **Protocol** — `ProtocolSelect` (`aether-field-protocol`), `ScanModeToggle` (highlight-able wrapper `scanModeRef`), `IpVersionToggle`, `MasqueTransportToggle`, `NoizeProfileToggle`, `WiwPeersField` (`aether-field-wiw-peers`) only when `protocol === "gool"`, SwitchRow `mim` "MASQUE-in-MASQUE" for masque/auto, `MimPeersField` (`aether-field-mim-peers`) when `mim && (masque|auto)`.
2. **Proxy** — `BindAddressField` (`aether-field-socks-port`), `HttpProxyAddressField` (`aether-field-http-proxy`), `UpstreamProxyField` (`aether-field-upstream`), `TunnelDnsField` (`aether-field-dns`).
3. **Routing** — `RouteRulesField` block (`aether-field-route-block`) / direct (`aether-field-route-direct`), SwitchRow `route_sniff` "Domain sniffing", `RouteSniffMsField` (`aether-field-sniff-ms`) when on, amber syntax note listing `example.com`, `full:example.com`, `keyword:ad`, `regexp:^ad[0-9]+`, `10.0.0.0/8`, `port:25`, `private`.
4. **Zero Trust** — `ZeroTrustPanel`.
5. **Behavior** — SwitchRows `quick_reconnect`, `auto_reprovision`; Inputs `exit_loc` (placeholder `DE,SE or !IR,AZ,RU`) and `exit_loc_secs` (disabled unless `exit_loc` non-empty); SwitchRow `stats` + conditional `stats_secs`; SwitchRow `quic_v2` disabled when `masqueHttp2 || protocol === "wireguard" || protocol === "gool" || engine_tor_mode ∈ {tor-reverse, tor-only} || engine_psiphon_mode ∈ {psiphon-reverse, psiphon-only}` (plus conditional helper notes); `MarkField` (`aether-field-fw-mark`); `LogLevelSelect` (`aether-field-log-level`); `PerfSelect` (`aether-field-perf`); `<details>` "Proxy Tuning (env-only, Aether ≥2.0.0)" with `max_clients`, `half_close_secs`, `tcp_keepalive_secs`, `tcp_connect_secs` — tooltips name env vars `AETHER_MAX_CLIENTS`, `AETHER_HALF_CLOSE_SECS`, `AETHER_TCP_KEEPALIVE_SECS`, `AETHER_TCP_CONNECT_SECS`.
6. **Engine Tor (arti) — Built-in** — `EngineTorPanel`.
7. **Psiphon — Built-in (Aether ≥2.1.0)** — `PsiphonPanel`.
8. **Logs** — `LogSearch`, "Full Log" button → `openLogWindow()`, `VirtualLogList` in fake window chrome labelled `aether.log` with `{filteredLogs.length} lines`.

### EngineTorPanel
- Banner distinguishes arti from "IP Changer Tor (9050)"; arti listens on **1820**.
- `engine_tor_mode` options: `disabled` / `tor` (WARP → Tor, 1819+1820) / `tor-reverse` (Tor → WARP, forces MASQUE over HTTP/2) / `tor-only`.
- Fields: `engine_tor_bind` (placeholder/default `127.0.0.1:1820`, `validateEngineTorBind`, hidden for `tor-only`), `engine_tor_dir`, `engine_tor_country` (`validateCountry`, `maxLength={2}`, env `AETHER_TOR_COUNTRY`), `engine_tor_relays` (placeholder `auto`, maps to `--tor-relays`), `engine_tor_relay_ports` (`"web" | "any" | null`, displayed `web` when `null`), `engine_tor_bridges` textarea (split on `\n`; editing also clears `engine_tor_no_bridges`/`engine_tor_force_bridges`), `engine_tor_pt`, `engine_tor_bridges_file`, `engine_tor_pt_dir`, plus `<details>` `engine_tor_direct_secs` (`AETHER_TOR_DIRECT_SECS`, default 75) and `engine_tor_stall_secs` (`AETHER_TOR_STALL_SECS`, default 75).
- Bridge policy select is derived, not stored: `engine_tor_no_bridges` → "none", `engine_tor_bridges.length > 0` → "manual", `engine_tor_force_bridges` → "force", else "auto".
- Status line `role="status"` when mode is `tor` and connected: `Ready`/`Waiting` + `(engineTorStatus.address ?? bind ?? "127.0.0.1:1820")`.
- `reverseConflict` warning when `tor-reverse` with `protocol` wireguard/gool.

### PsiphonPanel
- `MODE_OPTIONS` (`PsiphonPanel.tsx:10-15`): `disabled` / `psiphon` ("you → WARP → Psiphon → internet (1819+1821)") / `psiphon-reverse` ("you → Psiphon → WARP → internet, runs MASQUE over HTTP/2") / `psiphon-only` ("you → Psiphon → internet, no WARP").
- `SHAPE_OPTIONS`: `auto` / `cdn` / `direct` → `psiphon_shape`.
- Fields: `engine_psiphon_bind` (placeholder `127.0.0.1:1821`, `validateEngineTorBind`, hidden for `psiphon-only`), `psiphon_region` (`validateCountry`, `maxLength={2}`, placeholder `US`).
- Live status when mode is `psiphon` and session active: `Engine Psiphon listener: Ready|Waiting (address ?? profile.engine_psiphon_bind ?? "127.0.0.1:1821"). Separate from the primary tunnel, engine Tor and IP Changer.`
- Conflict banners: `reverseConflict` = `psiphon-reverse` + wireguard/gool; `primaryConflict` = (`psiphon-only` && `engine_tor_mode !== "disabled"`) || (`tor-only` && `engine_psiphon_mode !== "disabled"`) || (`tor-reverse` && `psiphon-reverse`).

### ZeroTrustPanel
Local `Field({label, tooltip, htmlFor})` subcomponent (not `FieldRow`). Keys and controls: `zt_team` (`--team`, id `zt-team`, placeholder `your-org`), `zt_access_email` (`--access-email`, `type="email"`), conditional **sign-in code** form shown only when `zt_access_email` is set — submits with `invoke("send_input", { line: trimmed })` only when `sessionActive` (`status.state !== "Idle" && "Error"`), then shows "Code sent to Aether."; `zt_access_id` (`--access-id`), `zt_access_secret` (`--access-secret`, `type="password"`), `zt_access_token` (`--access-token`, JWT, `type="password"`), and a `Switch` "Route through Gateway" → `zt_gateway` (`--gateway`). This is one of only three config components that call `invoke` itself.

### ProfilePresets
- Type: `interface ProfilePreset { name: string; profile: ConnectionProfile; created_at: number }` — **user-saved snapshots only; there are no built-in preset payloads.**
- IPC: `invoke<ProfilePreset[]>("get_presets")` on mount and after mutations; `invoke("save_preset", { name, profile })`; `invoke("delete_preset", { name })`.
- Apply: `applyPreset` → store `applyProfile(p.profile)` (schema + `validateActiveProfile`, throws) — catch shows `toast.error`; success shows `toast.success('Applied "<name>"')`.
- Save disabled when `locked || !newName.trim()`; Enter in the input saves. Delete is two-step confirm with a 2500 ms auto-cancel `setTimeout` in `deleteTimerRef`.
- Errors render `<InlineErrorBanner message={error} onRetry={…loadPresets}>`; empty state "No presets yet".
- Exports `ProfilePresetsContent` (what App lazy-loads) and a wrapper `ProfilePresets(props: {open, onToggle})` that does `void props` and renders the content — same "props ignored" quirk as `AdvancedPanel`.

### LeakBanner / SidecarErrorScreen
- `LeakBanner`: `role="alert"` motion div; heading "Leak detected — your real IP is visible"; primary **Disconnect now** → `disconnect()`; secondary **Re-check** → `runPublicIpCheck()`, disabled + spinner (`anim-spin`) while `publicIpLoading`. Mounted only at `App.tsx:114` under `isLeaking = leakStatus === "leak" && status.state === "Connected"`.
- `SidecarErrorScreen({ message, onRetry })`: heading "Aether engine failed to start", mono message. `repairable = /binary not found|engine incompatible/i.test(message)` → primary **Install / repair Aether** → `invoke("download_aether")` then `onRetry()`; otherwise an outline **Retry** button. Focuses the primary button on mount. Rendered by `App.tsx:319-328` in place of `MainScreen`; `onRetry` = `retryAfterSidecarError()` (store: `set({ sidecarError: null })`) + `connect()`.

### Status widgets
- `TrafficStats({ onOpenActive })`: reads `traffic` (`{ tx_bytes, rx_bytes, tx_rate, rx_rate }` from `aether://traffic`), `status`, `profile`, `activeConns.length`. Address line = `status.bridge_addr` when Connected else `127.0.0.1:1819`. Derived labels: `protocol = profile.protocol === "auto" ? "MASQUE" : profile.protocol.toUpperCase()`; scan mode via local `SCAN_LABELS`; IP version via `IP_LABELS` (`v4→IPv4`, `v6→IPv6`, `both→IPv4+6`); firewall label = capitalized `profile.masque_noize`; TUN badge when `capture_mode` is `tun`/`both`. `role="status"` + `aria-live="polite"` with a spoken aria-label of rates/totals. Shows "not connected" when not connected. No polling of its own.
- `ActiveConnections({ compact })`: header "Active apps" + `{conns.length} conns` (or "not connected"); prefers `state === "ESTABLISHED"` rows, falls back to all; shows 6 rows (32 when expanded); row = `c.exe || "unknown"`, `# c.pid`, `c.proto + (c.state || "—")`; expander "Show all"/"Show less" appears when `conns.length > 6`. Data arrives from the App.tsx 2 s interval.
- `SystemProxyToggle`: `invoke<SystemProxyState>("get_system_proxy_state")` on mount → `enabled = s.enabled && s.owner === "main"`; renders `null` until loaded; toggle → `invoke("set_system_proxy_addr", { addr, enabled: on })` with `addr = status.state === "Connected" && "socks_addr" in status ? status.socks_addr : "127.0.0.1:1819"`; on rejection it reverts the switch and shows the error text. `SystemProxyState` is imported from `@/components/ProxyIndicator` (another slice). `aria-label` is "Set Windows system proxy to tunnel".

### Shared types & defaults (src/types/connection.ts, src/lib/profile-defaults.ts)
- `ConnectionStatus` = `Idle | Launching | Connecting | {Connected, socks_addr, bridge_addr, connected_at_ms} | {Reconnecting, attempt, max_attempts} | Disconnecting | {Error, message, phase}`.
- Key default profile values: `protocol: "auto"`, `scan_mode: "turbo"`, `ip_version: "v4"`, `quick_reconnect: true`, `masque_http2: false`, `masque_noize: "firewall"`, `wg_noize: "balanced"`, `bind_address: "127.0.0.1:1819"`, `capture_mode: "proxy"`, `dns_mode: "forward"`, `tun_address: "10.0.0.2/24"`, `tun_dns: "8.8.8.8"`, `route_sniff: true`, `auto_reprovision: true`, `mim: false`, `quic_v2: true`, `engine_tor_mode: "disabled"`, `engine_psiphon_mode: "disabled"`, `psiphon_shape: "auto"`, `stats: false`; everything else `null`/`[]`.
- `EngineTorStatus` = `{ enabled, ready, address: string | null }`; `EnginePsiphonStatus` is an alias of it. `ActiveConn` = `{ pid, exe, local, remote, state, proto }`.
- Validators used by these components all live in `src/lib/validators.ts` and return `string | null`: `validateBindAddress`, `validateUpstream`, `validateWiwPeers`, `validateDnsServers`, `validateRouteRules`, `validateZtTeam`, `validateRouteSniffMs`, `validateMimPeers`, `validateFwMark`, `validateEngineTorBind`, `validateCountry`, `validateUint32`, `validateActiveProfile`, `validateProfile`, plus `connectionProfileSchema`.

### Quirks worth knowing
- `AdvancedPanel` and `ProfilePresets` each export a wrapper that accepts `{open, onToggle}` and discards it; the real entry points are `AdvancedPanelContent` / `ProfilePresetsContent`.
- `CaptureModeSelect` permanently disables TUN/Both, so `capture_mode` can only be `proxy` from the UI even though the type and backend support all three.
- `HttpProxyAddressField` validates with `validateDnsServers` rather than a proxy-specific validator.
- `QuickConnect` presets carry a `protocol` field that is never applied — only `scan_mode` changes.
- Two spellings of the locked predicate: `useLocked()` vs the inlined `status.state !== "Idle" && status.state !== "Error"`.
- `ironclad` maps to the "Secure" pill, so Ironclad is not independently visible in the Tuning row.

## Links to other sections
- **App shell / panel chrome (slice 04)** — `src/App.tsx` mounts every component here (lazy `AdvancedPanelContent`, `ProfilePresetsContent`, `SidecarErrorScreen` gate, 2 s `refreshActiveConns` interval), plus `PanelDialog`, `ErrorBoundary`, `SettingsPanel` (host of `SystemProxyToggle`, `CaptureModeSelect`, `DnsModeSelect`), `ShortcutsDialog`, `usePaletteItems` (command-palette toggles for `quick_reconnect`, `runPublicIpCheck`, etc.).
- **State layer (slice on `state/`)** — `src/state/connectionStore.ts` is the single source of truth: `connect`/`disconnect`/`applyProfile`/`runPublicIpCheck`/`refreshActiveConns`, `createPersistSetter` → `set_default_profile`, all `aether://` event subscriptions, `retryAfterSidecarError`.
- **Lib/validators (slice on `lib/`)** — `@/lib/validators` (schemas + `validate*`), `@/lib/profile-defaults` (`defaultConnectionProfile`, `supportsFirewallMark`), `@/lib/log-window` (`openLogWindow`), `@/lib/sound` (`cue`), `@/lib/format` (`formatBytes`, `formatRate`), `@/lib/motion` (`SPRING_FAST`).
- **Shared UI primitives** — `src/components/ui/panel-section.tsx` (`FieldRow`, `Section`, `SwitchRow`), `ui/select`, `ui/toggle-group` + `ui/segment` (`SegIndicator`), `ui/input`, `ui/switch`, `ui/inline-alert` (`InlineErrorBanner`), `ui/tooltip`, `ui/button`.
- **Related components outside the slice** — `PublicLocation.tsx` (drives `runPublicIpCheck` → `leakStatus` consumed by `LeakBanner`), `ProxyIndicator.tsx` (owns `SystemProxyState` used by `SystemProxyToggle`), `LogSearch`/`VirtualLogList` (Logs section), `ConnectionHistoryContent` (separate panel).
- **Backend commands consumed** (for the backend section): `connect`, `disconnect`, `get_default_profile`, `set_default_profile`, `get_active_connections`, `get_presets`, `save_preset`, `delete_preset`, `send_input`, `download_aether`, `get_system_proxy_state`, `set_system_proxy_addr`.
