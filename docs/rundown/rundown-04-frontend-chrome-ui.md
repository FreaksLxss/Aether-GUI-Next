# Slice 04 — App chrome, settings, dialogs & UI primitives

Scope: `src/components/TitleBar.tsx`, `AppMenu.tsx`, `CommandPalette.tsx`, `SettingsPanel.tsx`, `SettingsIO.tsx`, `AboutDialog.tsx`, `ShortcutsDialog.tsx`, `CloseDialog.tsx`, `OnboardingTour.tsx`, `UpdateChecker.tsx`, the five Settings toggles, `ThemeToggle.tsx`, `ColorTheme.tsx`, `ErrorBoundary.tsx`, `PanelDialog.tsx`, all 22 files in `src/components/ui/`, plus `components.json`. Supporting wiring read for context: `src/App.tsx`, `src/hooks/usePaletteItems.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/lib/close.ts`, `src/lib/theme.ts`, `src/lib/sound.ts`.

## File inventory

### Chrome / settings / dialogs (`src/components/`)

| path | ~lines | purpose |
| --- | --- | --- |
| `src/components/TitleBar.tsx` | 78 | Header with `data-tauri-drag-region` drag area, live connection uptime (`hh:mm:ss` from `status.connected_at_ms`), `ProxyIndicator`, and Minimize/Maximize/Close window buttons. |
| `src/components/AppMenu.tsx` | 104 | "Options · 5" popover listing the 5 `PanelId`s (Advanced/Presets/IP Changer/History/Settings) + a Search icon button that opens the palette; exports `PanelId` type. |
| `src/components/CommandPalette.tsx` | 273 | ⌘K dialog: fuzzy-scores `PaletteItem[]`, groups them, keyboard/ARIA combobox listbox, highlighted matches; exports `PaletteItem` interface. |
| `src/components/SettingsPanel.tsx` | 68 | `SettingsContent()` composes the 5 Settings sections (System/Network/Appearance/Sound/About); `SettingsPanel()` is a dead wrapper (see Quirks). |
| `src/components/SettingsIO.tsx` | 258 | Export/import settings to a JSON file via Tauri file dialogs + `write_file`/`read_file`, with a diff-preview dialog and Undo toast. |
| `src/components/AboutDialog.tsx` | 111 | "About" button → dialog showing app version (`get_app_version`), engine version/compat (`get_engine_info`), 3 GitHub links, AGPL v3.0 notice. |
| `src/components/ShortcutsDialog.tsx` | 39 | Keyboard-shortcut cheat sheet; opens only on the `aether:open-shortcuts` window event. |
| `src/components/CloseDialog.tsx` | 77 | "Close Aether?" chooser (Minimize to tray / Close completely); opens on `aether:request-close-dialog` event. |
| `src/components/OnboardingTour.tsx` | 90 | First-run 3-step tour dialog gated by localStorage `aether:onboarded`. |
| `src/components/UpdateChecker.tsx` | 85 | Auto-checks `check_update` once per session; shows "Check for updates" button or an update-available Alert with a Download link. |
| `src/components/SoundSettings.tsx` | 37 | Settings "Sound" section: `SwitchRow` enable + volume `Slider` (0–1), driven by `useSoundPrefs()`. |
| `src/components/AutoStartToggle.tsx` | 48 | "Launch at startup" switch backed by `@tauri-apps/plugin-autostart` `isEnabled()/enable()/disable()`. |
| `src/components/CloseToTrayToggle.tsx` | 46 | "Minimize to tray" switch → `get_close_to_tray`/`set_close_to_tray` + `syncCloseChoice()` (localStorage). |
| `src/components/MinimizeOnStartupToggle.tsx` | 39 | "Start minimized" switch → `get_minimize_on_startup`/`set_minimize_on_startup`. |
| `src/components/AlwaysOnTopToggle.tsx` | 39 | "Always on top" switch → `get_always_on_top`/`set_always_on_top`. |
| `src/components/ThemeToggle.tsx` | 71 | Cycles dark → light → system; writes localStorage `aether-theme`, toggles root `dark`/`light` class, re-applies custom colors. |
| `src/components/ColorTheme.tsx` | 184 | "Accent color" popover: primary (12 presets) + secondary (8 presets) swatches, native `<input type="color">`, Reset; persists to `aether-custom-primary`/`aether-custom-secondary`. |
| `src/components/ErrorBoundary.tsx` | 53 | Class error boundary with `label` (console tag) + `onReset`; renders "Something went wrong" + Try again. |
| `src/components/PanelDialog.tsx` | 81 | Full-screen scrollable overlay shell for the 5 panels: sticky pill header (icon, title, description, X), content capped at 420px. |

### UI primitives (`src/components/ui/`, 22 files)

| path | ~lines | purpose |
| --- | --- | --- |
| `button.tsx` | 68 | `cva` button; variants `default/outline/secondary/ghost/destructive/link`, sizes `default/xs/sm/lg/icon/icon-xs/icon-sm/icon-lg`; `asChild` via `Slot.Root`; emits `data-cuelume-press="press"`. |
| `input.tsx` | 19 | Plain styled `<input>` wrapper (`data-slot="input"`). |
| `textarea.tsx` | 19 | Plain styled `<textarea>` wrapper (`min-h-[60px]`). |
| `badge.tsx` | 49 | `cva` badge, variants `default/secondary/destructive/outline/ghost/link`; `asChild` (`span`/`Slot.Root`). |
| `switch.tsx` | 30 | Radix Switch; thumb is a `motion.span` animated to `x: 22 / 2` with `SPRING_FAST`; `data-cuelume-toggle="toggle"`. |
| `toggle.tsx` | 46 | Radix Toggle + `cva` (variants `default/outline`, sizes `default/sm/lg`), exported `toggleVariants`. |
| `toggle-group.tsx` | 90 | Radix ToggleGroup with context (variant/size) + extra props `spacing` (default 2 → `--gap`) and `orientation`; spacing-0 items share rounded corners/borders. |
| `slider.tsx` | 35 | Radix Slider (track h-1.5, `bg-surface-3`; thumb size-4 white). |
| `dialog.tsx` | 171 | Radix Dialog suite; custom props `showCloseButton` (DialogContent, default `true`) and `DialogFooter.showCloseButton` (default `false`); overlay `bg-black/30 backdrop-blur-xl` with `--window-radius-*` corners; **plays `cue("page")` on mount**. |
| `popover.tsx` | 100 | Radix Popover (+ `PopoverHeader/Title/Description/Anchor`); **plays `cue("whisper")` on open**; glass `rounded-[22px] bg-popover/80` content. |
| `select.tsx` | 196 | Radix Select; `SelectTrigger` prop `size: "sm" | "default"`; `SelectContent` defaults `position="item-aligned"`, `align="center"`; **`SelectItem` plays `cue("tick")` on select**. |
| `alert.tsx` | 76 | `cva` alert (`default`/`destructive`) + `AlertTitle/AlertDescription/AlertAction` (`role="alert"`, action slot top-right). |
| `inline-alert.tsx` | 48 | Exports `InlineErrorBanner({message, onRetry})` — destructive Alert with Retry + "Copy diagnostics" (copies profile JSON + last 50 log lines to clipboard). |
| `separator.tsx` | 26 | Radix Separator (`orientation`, `decorative`). |
| `collapsible.tsx` | 33 | Radix Collapsible passthrough (`Collapsible/Trigger/Content`). |
| `progress.tsx` | 32 | Radix Progress; indicator is a `motion.div` animating `x: -100 + value%` with `SPRING`. |
| `scroll-area.tsx` | 60 | Radix ScrollArea with extra prop `viewportRef` (used by `PanelDialog`); thin 1.5 scrollbar, `scrollbar-gutter: stable`. |
| `tooltip.tsx` | 57 | Radix Tooltip; `TooltipProvider` defaults `delayDuration=300`, `skipDelayDuration=200`; dark pill content + arrow, `sideOffset=0`. |
| `segment.tsx` | 21 | Exports `SegIndicator({active, groupId})` — `motion.span` `layoutId={groupId}` sliding highlight used inside ToggleGroups. |
| `sonner.tsx` | 23 | Exports `Toaster` — sonner `<Toaster position="top-center" offset={40} theme="dark" richColors={false} closeButton>` with `--card` toast styling. |
| `panel-section.tsx` | 91 | Exports `FieldRow` (label + optional `htmlFor`), `Section` (pill title + card body), `SwitchRow` (label + info `Tooltip` + `Switch`). |
| `panel-skeleton.tsx` | 15 | Exports `PanelSkeleton` — pulsing placeholder shown as `Suspense` fallback while panels lazy-load. |
| `components.json` | 27 | shadcn/ui CLI config (see "shadcn/ui pattern" below). |

## Architecture / data flow

### Mounting (all chrome is rooted in `src/App.tsx`)

1. `App()` (App.tsx:258-340) renders `<TooltipProvider>` → `<Toaster />` (sonner) → `.window-shell` div (squircle clip via `useSquircleClip`) containing `<CloseDialog />`, `<AmbientBackground />`, `<TitleBar />`, then either `<SidecarErrorScreen />` or `<MainScreen />`.
2. `App()` also runs the global theme bootstrap `useLayoutEffect` (App.tsx:268-296): reads `localStorage["aether-theme"]`, sets `document.documentElement` class `dark`/`light`, and if `aether-custom-primary` + `aether-custom-secondary` exist dynamically imports `@/lib/theme` → `applyColors(p, s, dark)`. `system` listens to `prefers-color-scheme` changes.
3. `MainScreen()` (App.tsx:57-256) owns three pieces of UI state: `panel: PanelId | null`, `paletteOpen: boolean`, plus `activeOpen`/`highlightScanMode`. It builds palette items with `usePaletteItems(setPanel)`.
4. All five panels are one `PanelDialog` each, opened by `open={panel === "<id>"}` and `onOpenChange={(v) => !v && closePanel()}`; each wraps a `lazy()` content component in `<Suspense fallback={<PanelSkeleton />}>` + `<ErrorBoundary label="<id>" onReset={() => setPanel(null)}>`. Lazy targets (App.tsx:18-32): `AdvancedPanelContent`, `ProfilePresetsContent`, `ConnectionHistoryContent`, `IpChangerContent`, `SettingsContent`.
5. `<CommandPalette open={paletteOpen} …>`, `<OnboardingTour />`, `<ShortcutsDialog />` are mounted once in `MainScreen` (App.tsx:181-183).

### Window-event bus (three decoupled triggers)

There is no shared React context for dialogs; components coordinate through `window` events:

- `"aether:toggle-palette"` — dispatched by `useKeyboardShortcuts` on ⌘K/Ctrl+K (useKeyboardShortcuts.ts:18-21); `MainScreen` toggles `paletteOpen` (App.tsx:79-83). `AppMenu`'s Search button and footer icon call `onOpenPalette={() => setPaletteOpen(true)}` directly (App.tsx:152).
- `"aether:open-shortcuts"` — dispatched by `useKeyboardShortcuts` on `?` or ⌘/Ctrl+/ when not typing (useKeyboardShortcuts.ts:26-29) and by the "shortcuts ?" footer link (App.tsx:155); `ShortcutsDialog` listens (ShortcutsDialog.tsx:16).
- `CLOSE_DIALOG_REQUEST_EVENT = "aether:request-close-dialog"` (`src/lib/close.ts:5`) — dispatched by `handleClose()` when no close choice is saved; `CloseDialog` listens (CloseDialog.tsx:25).

### Title-bar close chain

`TitleBar` Close button → `handleClose()` (lib/close.ts:26-35): reads `localStorage["aether-close-choice"]` (`CLOSE_CHOICE_KEY`, value `"tray"` | `"close"` | absent) → `"tray"`: `getCurrentWindow().hide()`; `"close"`: `.close()`; absent: dispatch the close-dialog event. `CloseDialog.handleChoice` writes the choice, calls `setCloseToTray(bool)` (IPC `set_close_to_tray`) then `hide()` or `close()`.

### Settings read/write — three distinct patterns in this slice

1. **Per-toggle local state + IPC (system settings).** `AlwaysOnTopToggle`, `MinimizeOnStartupToggle`, `CloseToTrayToggle`, `AutoStartToggle` each keep `useState(loaded)` state, hydrate in `useEffect` (`invoke("get_*")` or `plugin-autostart.isEnabled()`), render `null` until loaded, and on change do optimistic `setEnabled(on)` → `invoke("set_*", { enabled })` → rollback `setEnabled(!on)` on rejection. These settings live **backend-side** (not in the zustand store) — no `useConnectionStore` involved.
2. **Zustand profile store (network settings).** Rows rendered by SettingsPanel that touch the tunnel profile (`CaptureModeSelect` → `s.profile.capture_mode`/`setCaptureMode`, `DnsModeSelect` → `s.profile.dns_mode`/`setDnsMode`, `SystemProxyToggle` → IPC `get_system_proxy_state`/`set_system_proxy_addr`) read via selector `useConnectionStore((s) => …)` and write via store actions; both selects are disabled while `locked = status.state !== "Idle" && status.state !== "Error"`.
3. **localStorage-only (presentation settings).** Theme (`aether-theme`), accent colors (`aether-custom-primary`/`aether-custom-secondary`), sound prefs (`aether-sound-enabled`/`aether-sound-volume`, exposed reactively through `useSyncExternalStore` in `lib/sound.ts:75-77`), onboarding flag, palette recents. These never touch the backend; React state mirrors localStorage and `applyTheme`/`applyColors` mutate the DOM immediately.

The pattern to copy for a new system toggle: **pattern 1** (mirrors `MinimizeOnStartupToggle` exactly) — hydrate with `get_`, optimistic `set_` with rollback, plus registering the key in `SettingsIO`'s `SETTING_COMMANDS` + `handleExport` if it should round-trip through export/import.

### SettingsIO round-trip

Export: `Promise.all` of `get_default_profile`, `get_presets`, `get_close_to_tray`, `get_always_on_top`, `get_minimize_on_startup` → `SettingsExport { version: 1, profile, presets, settings: { close_to_tray, always_on_top, minimize_on_startup } }` → `save()` dialog (default `aether-gui-settings.json`, filter `json`) → `invoke("write_file", { path, contents: JSON.stringify(data, null, 2) })`.

Import: `open()` dialog → `invoke("read_file", { path })` → `JSON.parse` → each profile normalized with `connectionProfileSchema.parse` + `validateActiveProfile` (throws on invalid) → current state fetched to `buildDiff()` → if rows exist, show "Import preview" dialog (max 80 rows, added=emerald / removed=red / changed=white) → Apply → `applyImport()`: `set_default_profile` + `reloadProfile()`, `save_preset` per preset, and each known `settings` key through `SETTING_COMMANDS` (`close_to_tray` also calls `syncCloseChoice(v)`). Toast "Settings imported" carries an **Undo** action that restores the `structuredClone`d pre-import profile via `set_default_profile` + `reloadProfile()` (presets/flags are not undone).

### Palette data flow (CommandPalette vs AppMenu vs usePaletteItems)

- `AppMenu` = static launcher. Its `ITEMS` (5 entries with `id: PanelId`) are hardcoded and call `onOpen(id)`; it never touches the palette item list. It has a hardcoded "· 5" count badge and a "Press ⌘K to search" footer.
- `usePaletteItems(setPanel)` (799 lines) = the single source of palette commands. It subscribes to `useConnectionStore` (status, profile, logs, leakStatus + 16 actions) and `useIpChangerStore` (status, start/stop/rotate, autoRotateEnabled) and `useMemo`s a `PaletteItem[]` whose `run()` closures call those actions (deps listed at usePaletteItems.ts:767-798).
- `CommandPalette` = dumb presentation: receives `items`, fuzzy-scores (`fuzzyScore` with word-boundary `[\s\-_/.:]`, consecutive bonus, `startsWith` +6), filters `score > 0`, sorts by score then label, regroups by `group`, renders ARIA combobox/listbox with Arrow/Home/End/Enter handling, closes then runs `it.run()` inside `requestAnimationFrame` with `toast.error` on throw.
- Cross-cutting: every `run` is wrapped by `wrapRun(id, fn)` → `recordPaletteRecent(id)` which writes at most 3 ids to `localStorage["aether:palette:recent"]`; ids in `localStorage["aether:palette:pinned"]` are re-bucketed into synthetic groups `Pinned` and `Recent` prepended to the list (usePaletteItems.ts:740-764).
- Palette groups produced: `Panels`, `Actions`, `Protocol & tuning`, `Advanced`, `Network`, `Routing`, `Zero Trust`, `Behavior`, `Settings`, `IP Changer` (+ `Pinned`/`Recent`). Panel-navigation items call `setPanel(...)`; field items call `openAdvanced("aether-field-…")`/`openSettings()` which set the panel then `scrollToField` (rAF + 80 ms `scrollIntoView`).

### Update flow

`UpdateChecker` mounts inside Settings → About section. On mount, if `sessionStorage["aether-update-checked"]` is unset it sets it and invokes `check_update` once, silently swallowing errors. Response shape `UpdateInfo = { available, latest_version, current_version, download_url }` (snake_case). If `available`, an animated `Alert` replaces the button: "Update available: v{latest_version}", **Download** → `open(download_url)` via `@tauri-apps/plugin-shell`, **Dismiss** → local state cleared (button returns). Manual "Check for updates" re-invokes with a spinning `RefreshCw`. There is no Tauri updater plugin usage, no updater events, and no install/download-in-place anywhere in the frontend — the browser is opened at `download_url`.

### Panel/error loading flow

`PanelDialog` → `ScrollArea` (viewportRef) → content; `Suspense` fallback `PanelSkeleton`; `ErrorBoundary` catches render errors per panel (logs `[ErrorBoundary:<label>]` + component stack) and `onReset` closes the panel.

## Key details

### TitleBar window controls

Drag region: `<header data-tauri-drag-region>` plus two nested divs carrying the same attribute (TitleBar.tsx:31,34,35) — Tauri's built-in drag attribute, no IPC for dragging.

| Button | aria-label | action |
| --- | --- | --- |
| `Minus` | `Minimize` | `cue("droplet")` then `tauriWindow()?.minimize()` |
| `Maximize2` | `Maximize` | `tauriWindow()?.toggleMaximize()` |
| `X` | `Close` | `handleClose()` (lib/close.ts:26 — hide / close / ask-dialog) |

`tauriWindow()` = `getCurrentWindow()` from `@tauri-apps/api/window`, null-safe in a try/catch. Left side renders `ProxyIndicator` + uptime string `hh:mm:ss` (1 s interval) only while `status.state === "Connected"` (from `status.connected_at_ms`).

### Settings panel — every row

`SettingsContent()` sections in order (SettingsPanel.tsx:23-60):

| Section (icon) | Row (component) | Store key / IPC | Notes |
| --- | --- | --- | --- |
| System (`Monitor`) | Always on top (`AlwaysOnTopToggle`) | `get_always_on_top` / `set_always_on_top { enabled }` | local state, optimistic + rollback |
| System | Launch at startup (`AutoStartToggle`) | none — `@tauri-apps/plugin-autostart`: `isEnabled()`, `enable()`, `disable()` | dynamic `import()`; renders `null` until loaded |
| System | Start minimized (`MinimizeOnStartupToggle`) | `get_minimize_on_startup` / `set_minimize_on_startup { enabled }` | label "Start minimized" |
| System | Minimize to tray (`CloseToTrayToggle`) | `get_close_to_tray` / `set_close_to_tray { enabled }` + `syncCloseChoice()` | writes `localStorage["aether-close-choice"]` = `"tray"`/`"close"`, so it also changes TitleBar Close behavior |
| Network (`Network`) | Capture mode (`CaptureModeSelect`) | `s.profile.capture_mode` / `setCaptureMode` | ToggleGroup `proxy`/`tun`/`both`; disabled when locked |
| Network | System proxy (`SystemProxyToggle`) — conditional | `get_system_proxy_state` / `set_system_proxy_addr { addr, enabled }` | shown only when `capture_mode === "proxy" \|\| "both"`; considers `s.enabled && s.owner === "main"` |
| Network | DNS resolution label + `DnsModeSelect` — conditional | `s.profile.dns_mode` / `setDnsMode` | shown only when `capture_mode !== "proxy"` |
| Appearance (`Palette`) | `ThemeToggle` | localStorage `aether-theme` | cycles dark → light → system |
| Appearance | `ColorTheme` | localStorage `aether-custom-primary`, `aether-custom-secondary` | accent picker popover |
| Appearance | `SettingsIO` (Export / Import buttons) | `write_file`, `read_file`, profile/preset/settings IPC | see import/export section |
| Sound (`Volume2`) | `SoundSettings` | localStorage `aether-sound-enabled` (default `"true"`), `aether-sound-volume` (default `0.5`) | slider 0–1 step 0.01, `cue("release")` on commit |
| About (`Info`) | `AboutDialog` | `get_app_version` (mount), `get_engine_info` (on open) | |
| About | `UpdateChecker` | `check_update` | once per session |

### Toggle → key/command reference (exact spellings)

| Component | IPC get | IPC set | arg | localStorage side-effect |
| --- | --- | --- | --- | --- |
| `AlwaysOnTopToggle` | `get_always_on_top` | `set_always_on_top` | `{ enabled }` | — |
| `MinimizeOnStartupToggle` | `get_minimize_on_startup` | `set_minimize_on_startup` | `{ enabled }` | — |
| `CloseToTrayToggle` | `get_close_to_tray` | `set_close_to_tray` | `{ enabled }` | `aether-close-choice` (`syncCloseChoice`) |
| `AutoStartToggle` | plugin `isEnabled()` | plugin `enable()`/`disable()` | — | — |

**Interactions — "minimize requires close-to-tray" is NOT enforced in frontend code.** A grep for `minimize_on_startup` across `src/` matches only `MinimizeOnStartupToggle.tsx` and `SettingsIO.tsx`; neither references `close_to_tray`, and `SettingsPanel` renders both switches independently with no disabled/derived logic. The only cross-toggle coupling that exists is `CloseToTrayToggle`/`SettingsIO` calling `syncCloseChoice()` so the TitleBar close button and the `CloseDialog` default follow the tray flag. [UNCERTAIN: whether the Rust side has any coupling — out of this slice's scope.]

### SettingsIO file format

```jsonc
{
  "version": 1,
  "profile": { /* ConnectionProfile, validated by connectionProfileSchema + validateActiveProfile */ },
  "presets": [ { "name": "…", "profile": { /* ConnectionProfile */ } } ],
  "settings": {            // only these three keys are exported
    "close_to_tray": true,
    "always_on_top": false,
    "minimize_on_startup": false
  }
}
```
- `SETTING_COMMANDS` (SettingsIO.tsx:27-31) maps import keys to setters: `close_to_tray` → `set_close_to_tray` + `syncCloseChoice(v)`; `always_on_top` → `set_always_on_top`; `minimize_on_startup` → `set_minimize_on_startup`. Unknown keys and non-boolean values are silently skipped.
- `buildDiff` row keys: `profile.<field>`, `preset:<name>` (added only — existing presets are never diffed as changed), `setting:<key>`.
- Diff dialog caps at `diffRows.slice(0, 80)`; "Apply" uses `pendingApplyRef.current ?? pendingData`.
- Undo restores **profile only**, not presets/settings.

### Dialog triggers & notable content

| Dialog | Trigger | Content of note |
| --- | --- | --- |
| `ShortcutsDialog` | window event `aether:open-shortcuts` (keys `?` or ⌘/Ctrl+/; footer "shortcuts ?" link) | 5 rows: `⌘K / Ctrl+K` Search everything · `Ctrl+Shift+C` Connect / Disconnect · `Esc` Close panel or palette · `?  ·  ⌘/ ` Open this help · `Enter` Connect when idle |
| `CloseDialog` | window event `aether:request-close-dialog` (fired by `handleClose()` when `aether-close-choice` is unset) | two buttons: "Minimize to tray" → IPC `set_close_to_tray(true)` + `hide()`; "Close completely" → `set_close_to_tray(false)` + `close()`; choice saved to `aether-close-choice` |
| `OnboardingTour` | self-triggering on mount: skipped if `localStorage["aether:onboarded"] === "1"` or `history.length > 0` (loads history first); otherwise 900 ms timer → open | 3 steps — "Hit Connect", "Fine-tune in Advanced", "Press ⌘K to search"; progress dots; Skip/Next/Got it all set `aether:onboarded = "1"` |
| `AboutDialog` | local `open_` state, "About" button in Settings → About section | versions: **`invoke<string>("get_app_version")`** on mount (default `"0.0.0"`) and **`invoke<EngineInfo>("get_engine_info")`** when opened — both command names confirmed verbatim (AboutDialog.tsx:31, 24). Engine row shows `v{engine.version}` / `"not installed"` and appends ` (needs v{engine.expected_version})` when `!engine.compatible`. Links: `https://github.com/MatinSenPai/Aether-GUI`, `https://github.com/CluvexStudio/Aether`, `https://github.com/FreaksLxss/Aether-GUI-Next`. Footer: "Licensed under AGPL v3.0" |
| `SettingsIO` preview | import produced diffs | see above |
| `CommandPalette` | `aether:toggle-palette` event, ⌘K/Ctrl+K, AppMenu Search/footer icons | placeholder "Search settings, presets, actions…"; footer "↑↓ navigate · ↵ open" + "N results" |
| Panels (5) | `AppMenu` item click or palette `setPanel` | full-screen `PanelDialog` |

### `CommandPalette` internals worth knowing

- `PaletteItem` shape (CommandPalette.tsx:8-16): `{ id, label, hint?, keywords?, group, icon, run }`.
- Reset on open via derived-state trick (`if (open !== wasOpen) { setQuery(""); setActive(0); }`) rather than `useEffect`.
- Scored search haystack: `label + hint + keywords + group` (lowercased).
- A11y: `role="combobox"` input with `aria-expanded/aria-controls/aria-activedescendant/aria-autocomplete="list"`, `role="listbox"` container (`id="palette-listbox"`), `role="option"` items with `aria-selected` and `data-active`.
- Highlighting: case-insensitive regex split on the escaped query.
- `DialogContent` is `showCloseButton={false}`, `aria-describedby={undefined}`, `sr-only` `DialogTitle` "Search".

### `PanelDialog` specifics

Uses `radix-ui` `Dialog.Portal` + its own `DialogOverlay` + `DialogPrimitive.Content` directly (not the `ui/dialog` `DialogContent`) to get a full-viewport, `bg-transparent`, non-centered surface; contains two leftover empty JSX expressions `{}` (PanelDialog.tsx:30,36). Backdrop click closes via `onClick` where `e.target === e.currentTarget` on the padded wrapper (line 44-46). Header pill is `sticky top-0 z-10`; `DialogPrimitive.Close` renders the X. Content wrapper: `max-w-[min(420px,calc(100%-1.5rem))]`.

### shadcn/ui pattern & `components.json`

`components.json` (`{components.json#160C}`): `$schema: https://ui.shadcn.com/schema.json`, **`style: "radix-nova"`**, `rsc: false`, `tsx: true`, tailwind `{ config: "", css: "src/index.css", baseColor: "neutral", cssVariables: true, prefix: "" }`, `iconLibrary: "lucide"`, `rtl: false`, aliases `{ components: @/components, utils: @/lib/utils, ui: @/components/ui, lib: @/lib, hooks: @/hooks }`, `menuColor: "default"`, `menuAccent: "subtle"`, `registries: { "@react-bits": "https://reactbits.dev/r/{name}.json" }`. It is the CLI config for adding/regenerating primitives (`npx shadcn add <component>`) and pins the conventions every primitive follows:

- imports `* as React`, primitives from the **single `radix-ui` package** (`import { Dialog as DialogPrimitive } from "radix-ui"`), `cn` from `@/lib/utils`, `cva` from `class-variance-authority` for variant files.
- every element carries `data-slot="…"`; Tailwind v4 syntax (`max-h-(--radix-…)`, `size-*`, `light:` variant).
- **App-level customizations on top of stock shadcn**: sound cues (`cue("page")` in `DialogContent`, `cue("whisper")` in `Popover`, `cue("tick")` in `SelectItem`); motion springs in `Switch`/`Progress`; `motion/react` `SPRING`/`SPRING_FAST` from `@/lib/motion`; `data-cuelume-press="press"` on `Button` and `data-cuelume-toggle="toggle"` on `Switch`/`Toggle` (hooks for the `cuelume` interaction-sound system, see `bind(document)` in `lib/sound.ts:72`); rounded-glass styling (`shadow-glass`, `rounded-[22px]`, `--window-radius-*` on the dialog overlay); non-stock extras (`ScrollArea.viewportRef`, `Dialog.showCloseButton`, `ToggleGroup.spacing/orientation`, `SelectTrigger.size`, `PopoverHeader/Title/Description`, `AlertAction`, `PanelSkeleton`, `Section/FieldRow/SwitchRow`, `SegIndicator`).

### localStorage / sessionStorage inventory owned by this slice

| key | writer(s) | reader(s) | values / default |
| --- | --- | --- | --- |
| `aether-close-choice` (`CLOSE_CHOICE_KEY`) | `CloseDialog`, `CloseToTrayToggle`/`SettingsIO` via `syncCloseChoice` | `handleClose` | `"close"` \| `"tray"` \| absent (absent → show dialog) |
| `aether-theme` | `ThemeToggle` | `ThemeToggle`, `ColorTheme`, `App.tsx` bootstrap | `"dark"` (default) \| `"light"` \| `"system"` |
| `aether-custom-primary` (`PRIMARY_KEY`) | `ColorTheme.pickPrimary`, `reset` removes | `ThemeToggle`, `ColorTheme`, `App.tsx`, `lib/theme` | hex, e.g. `#f2711c` |
| `aether-custom-secondary` (`SECONDARY_KEY`) | `ColorTheme.pickSecondary`/`reset` | same | hex; `SECONDARY_DEFAULT = "#242424"` |
| `aether:onboarded` | `OnboardingTour` | `OnboardingTour` | `"1"` = skip tour |
| `aether-sound-enabled` (`SOUND_ENABLED_KEY`) | `setSoundEnabled` | `initSound` | `"true"`/`"false"`; default `enabled = true` |
| `aether-sound-volume` (`SOUND_VOLUME_KEY`) | `setSoundVolume` | `initSound` | number string; default `0.5`, clamped 0–1 |
| `aether:palette:recent` | `recordPaletteRecent` (max 3 ids) | `getRecentIds` | JSON string[] of palette item ids |
| `aether:palette:pinned` | **never written anywhere in `src/`** (read-only `getPinnedIds`) | `usePaletteItems` | JSON string[]; the `Pinned` group can only appear if seeded externally |
| `aether-update-checked` (**sessionStorage**) | `UpdateChecker` mount | same | `"1"` = already auto-checked this session |

Other localStorage keys used by components of this slice indirectly: none — theme bootstrap also reads the two accent keys above.

### Notable quirks / footguns

- `SettingsPanel` (the named export with `{ open, onToggle }` props) is dead code: it `void`s its props and returns `<SettingsContent />`; nothing imports it — `App.tsx` lazy-imports **`SettingsContent`** (App.tsx:30-32).
- No frontend coupling between minimize-on-startup and close-to-tray (see toggle section) — if the product expects one, it does not exist yet in the GUI.
- `panel-section.tsx` `FieldRow` declares a `tooltip?: string` prop that is never rendered.
- `usePaletteItems` `PINNED_KEY` is read but has no writer → "Pinned" group is inert.
- `AboutDialog` fetches `get_engine_info` only when opened, but `get_app_version` once on mount; version falls back to `"0.0.0"` if the command fails.
- `UpdateChecker` swallows every error (`catch () {}`) — a failing backend looks identical to "no update".
- `TitleBar`'s maximize button has no sound cue (minimize plays `cue("droplet")`), unlike most other controls.
- `SettingsIO.applyImport`'s Undo restores only the profile.

## Links to other sections

- **`src/App.tsx` (shell / routing)** — owns `PanelId` panel state, mounts every dialog in this slice, lazy-loads panel content, boots the theme. Any change to panel ids or dialog triggers lands here first.
- **`src/components/AppMenu.tsx` → `PanelId` type** — imported by `usePaletteItems` (`src/hooks/usePaletteItems.ts`); the palette's five `panel-*` items and `setPanel` setter are contractually tied to these ids.
- **`src/components/CommandPalette.tsx` → `PaletteItem` interface** — imported by `usePaletteItems`; `src/hooks/useKeyboardShortcuts.ts` dispatches `aether:toggle-palette`.
- **`src/lib/close.ts`** — `handleClose`, `syncCloseChoice`, `CLOSE_CHOICE_KEY`, `setCloseToTray`; consumed by TitleBar, CloseDialog, CloseToTrayToggle, SettingsIO. Backend peer: the tray/close window commands and `set_close_to_tray` implementation (slice: backend lifecycle).
- **`src/lib/theme.ts`** (`PRIMARY_KEY`, `SECONDARY_KEY`, `PRIMARY_COLORS`, `SECONDARY_DEFAULT`, `applyColors`, `clearCustomColors`, `initThemeColors`) — used by `ColorTheme`, `ThemeToggle`, `App.tsx`.
- **`src/lib/sound.ts`** (`cue`, `useSoundPrefs`, `setSoundEnabled`, `setSoundVolume`) — used by SoundSettings, ThemeToggle, ColorTheme, TitleBar, and the `ui/dialog|popover|select` primitives.
- **`src/state/connectionStore`** — every palette action, Settings' Network rows, OnboardingTour history check, InlineErrorBanner diagnostics read from it (slices 03/05).
- **`src/stores/ipChangerStore`** — IP Changer palette group (other slice).
- **IPC commands referenced here that the backend must provide**: `get_always_on_top`, `set_always_on_top`, `get_minimize_on_startup`, `set_minimize_on_startup`, `get_close_to_tray`, `set_close_to_tray`, `get_default_profile`, `set_default_profile`, `get_presets`, `save_preset`, `read_file`, `write_file`, `get_app_version`, `get_engine_info`, `check_update` (with `UpdateInfo` snake_case fields), plus `get_system_proxy_state`/`set_system_proxy_addr` for the Settings Network section.
- **`src/types/engine.ts` (`EngineInfo`)** — consumed by AboutDialog; **`src/lib/validators.ts`** (`connectionProfileSchema`, `validateActiveProfile`) — consumed by SettingsIO import.
- **Other slices**: `SettingsPanel`'s Network rows (`CaptureModeSelect`, `DnsModeSelect`, `SystemProxyToggle`) belong to the connect/config slice; `ui/toggle-group` + `ui/segment` are the shared pattern for all mode pickers (scan/protocol/IP-version/noize) in the visuals slice.
