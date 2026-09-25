# Documentation & product context (slice 12)

Everything a future agent needs to know about what the repo's DOCS promise — without reading source. Repo-level agent/tooling config dirs are documented at the end so they can be dismissed as tooling noise.

## File inventory

| path | ~size | purpose |
|---|---|---|
| `README.md` | 16.2KB | English product pitch, feature list, install/build instructions, architecture claims |
| `README_fa.md` | 25.7KB | Persian mirror of README (bilingual-doc policy requires parity) |
| `AGENTS.md` | 5.4KB | Standing instructions for AI agents working in this repo (stack, commands, non-obvious facts) |
| `PRODUCT.md` | 6.2KB | Product brief: users, positioning, operating context, capabilities, principles (impeccable schema) |
| `DESIGN.md` | 8.3KB | Design system "Clear Signal": YAML front-matter tokens + prose rules |
| `SECURITY.md` | 1.6KB | Vulnerability reporting policy, scope split GUI vs upstream, censored-region reporting note |
| `CONTRIBUTING.md` | 1.2KB | Contributor setup + pre-PR check commands + AGPL sign-off |
| `docs/releases/v0.17.1.md` | 895B | Release notes for v0.17.1 (IP Changer panel resize fix; engine still 2.0.0) |
| `docs/screenshot-idle.png` | 86.9KB | Idle-state screenshot; referenced by `PRODUCT.md` evidence, NOT embedded in either README |
| `.claude/release-notes-v0.17.0.md` | 3.4KB | Draft release notes for v0.17.0 — Aether 2.0.0 engine integration; verification notes |
| `LICENSE` | 34.4KB | **AGPL-3.0** (GNU Affero General Public License v3.0) |
| `.claude/` | dir | Claude Code session config: permissions allowlist, design hooks, launch configs, worktrees, release-note draft, skills mirrors |
| `.claude/settings.local.json` | 6.8KB | Claude local permissions allowlist + PostToolUse/Stop hooks running the impeccable design checker |
| `.claude/launch.json` | 333B | Debug launch configs: `vite` (port 1420), `vite-session` (port 1421) |
| `.claude/flag-build.log`, `.claude/worktrees/` | 30.6KB + 3 dirs | Leftover build log and agent git worktrees — pure tooling residue |
| `.agents/skills/` | 15 skill dirs | Personal agent skill library (design-taste, imagegen, squircle, brandkit, …) — SKILL.md prompt packs, no product code |
| `.impeccable/design.json` | 21.3KB | Machine-readable design-system dump (schemaVersion 2): color metas with OKLCH tonal ramps, typography, components |
| `.impeccable/decision-payload.json` | 7.6KB | Design-direction choice record: "The Honest Dashboard" visual world (palette, materials, wireframe grid) + alternates |
| `.impeccable/` (rest) | — | `hook.cache.json` (12.2KB hook cache), `critique/`, `live/`, `questions/`, `config.local.json` — impeccable tool state |
| `.claude/settings.local.json` | (above) | see above |
| `.mimocode/` | small | Another agent tool's workspace: `plans/*.md` (2 plans), `package.json` (59B), `.cron-lock` — tooling only |
| `.github/agents/` | 4 files | Impeccable sub-agent prompt definitions: `impeccable-manual-edit-applier.agent.md`, `impeccable-finish-reviewer.agent.md`, `impeccable-documenter.agent.md`, `impeccable-asset-producer.agent.md` |
| `.github/skills/impeccable/` | SKILL.md 10.4KB | Impeccable design-review skill for Codex-style agents (`scripts/`, `reference/`) |
| `.github/hooks/impeccable.json` | 473B | postToolUse hook config running `hook.mjs` after edit/create/apply_patch (Node 22 gate) |
| `.github/workflows/build.yml` | 5.0KB | CI build workflow (owned/documented by the build slice) |
| `.github/ISSUE_TEMPLATE/` | 2 files | `bug_report.yml` (2.0KB), `feature_request.yml` (859B) |

Not in scope but adjacent tooling: root `skills-lock.json` (3.2KB) — skill install lockfile; `setup.bat` (2.7KB) — Windows setup helper (build slice); `rel210.json` (54.7KB) — release-related JSON (build slice).

## Architecture / data flow

How the doc set fits together — read in this order:

1. **`AGENTS.md`** is the agent-facing contract for *working on* the repo: stack (React 19 + TS + Tailwind v4 + Zustand + Motion frontend; Rust/Tauri 2 backend driving the `aether` binary via `portable-pty`), the six npm commands, the "no code comments" rule, the bilingual-doc rule (README edits must be mirrored in `README_fa.md`), and a "non-obvious architecture facts" section (connected-probe ground truth, Tor/Psiphon/IP-Changer separation, settings store, orphan reaping).
2. **`README.md`** is the *user-facing promise*: pitch → versions/repair → features → settings → install → build → how-it-works → attribution → license. `README_fa.md` is its Persian twin (same heading sequence, same versions/ports).
3. **`PRODUCT.md`** is the *why*: persona, positioning, operating context, capability list, product principles, evidence inventory.
4. **`DESIGN.md`** is the *look*: token front-matter (consumable by tooling) + named rules (One Accent, Status Trio, Readability Floor, Flat-By-Default). `.impeccable/design.json` is the machine-generated sibling of the same system.
5. **`SECURITY.md` / `CONTRIBUTING.md`** gate outside contributions; **`docs/releases/`** + `.claude/release-notes-*.md` record release history/drafts.
6. **Agent-config dirs** (`.claude`, `.agents`, `.impeccable`, `.mimocode`, `.github/agents|skills|hooks`) are AI-tooling state — never product source.

Data flow claimed by the docs (verbatim substance):

- Frontend talks to Rust backend over Tauri IPC; IPC commands registered in `src-tauri/src/main.rs` *(file exists — existence checked; registration contents owned by backend slices)*.
- Backend spawns the real `aether` binary (pinned **2.1.0**) in a pseudo-terminal via `portable-pty`; profile passed up front as CLI flags/env; a watcher thread answers leftover prompts and forwards every log line to the GUI.
- `"Connected"` = successful TCP connect to the profile's primary local SOCKS5 listener (default `127.0.0.1:1819`) — local listener readiness only, *not* end-to-end connectivity or leak protection.
- Three separate Tor/Psiphon subsystems: engine Tor (`1820` secondary listener), engine Psiphon (`1821` chained), IP Changer's own Tor expert bundle (`9050` SOCKS5 / `9051` control, `SIGNAL NEWNYM`/`SIGNAL SHUTDOWN` over loopback with cookie auth). Enabling one never starts another.
- State machine: `Idle → Launching → Connecting → Connected`, plus `Reconnecting` (backoff, capped at 3 attempts; user-requested disconnect never retried) and `Error`.
- Engine lifecycle: `src-tauri/aether-release.json` pins repo/version/assets/SHA-256; fetch helpers stage into `src-tauri/binaries/engine/`; runtime repair installs to `<app-data>/binaries/engine-2.1.0/`, preferring a compatible versioned download over bundled/legacy, preserving the previous dir as a sibling backup.

## Key details

### Versions stated verbatim

- `README.md`: "**Aether-GUI 1.18.0** is the desktop app version; **Aether 2.1.0** is the separately versioned engine it requires." (README_fa: identical — `Aether-GUI 1.18.0` / `Aether 2.1.0`.)
- `AGENTS.md`: "The GUI release is **1.18.0**; the pinned Aether engine is **2.1.0**. These are separate versions."
- `README.md` repair path: `<app-data>/binaries/engine-2.1.0/`; "pinned to v2.1.0" in How-it-works.
- `PRODUCT.md`: "GUI **0.17.1** and engine **2.0.0** are separate versions" — **stale vs README/repo** (see flags).
- `docs/releases/v0.17.1.md`: "The bundled Aether engine remains **2.0.0**" (historical note for that release).
- `.claude/release-notes-v0.17.0.md`: engine upgrade 1.9.0 → **2.0.0** (historical draft).
- Feature-gate wording: "Native engine Tor (Aether ≥2.0.0)", "Native engine Psiphon (Aether ≥2.1.0)", "Aether ≥2.1.0 renamed Stealth → Verified".

### Ports / endpoints (as documented)

| claim | value |
|---|---|
| Primary SOCKS5 listener ("connected" probe) | `127.0.0.1:1819` |
| Engine Tor secondary listener | `127.0.0.1:1820` |
| Engine Psiphon chained listener | `127.0.0.1:1821` |
| IP Changer Tor SOCKS5 / control | `9050` / `9051` |
| Vite dev server | port `1420`, `strictPort: true` (AGENTS.md: don't change); `.claude/launch.json` alt session port `1421` |
| Default tunnel DNS | `1.1.1.1`, `1.0.0.1` |

### Commands & requirements (as documented)

- npm scripts (AGENTS.md, CONTRIBUTING.md): `npm run dev` (Vite only), `npm run tauri dev`, `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint .`), `npm run build` (`tsc -b && vite build`), `npm run tauri build` → `src-tauri/target/release/bundle/`.
- Rust checks (AGENTS.md/CONTRIBUTING.md, run from `src-tauri/`): `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` (tests live in `aether/*.rs` and `tun/adapter.rs`; no frontend test suite).
- Engine fetch: `python src-tauri/binaries/fetch-aether.py` (Python 3.9+, no extra packages), Windows wrapper `./src-tauri/binaries/fetch-aether.ps1`, Unix `bash src-tauri/binaries/fetch-aether.sh` / `python3 …`. Env: `AETHER_ASSET` selects another *pinned* asset for the current OS (not a release override).
- Tor expert bundle (IP Changer only): manual download `tor-expert-bundle-*-<version>.zip` from torproject.org/dist, extract to `src-tauri/binaries/tor/<os>/<arch>/tor` (e.g. `binaries/tor/windows/x86_64/tor.exe`); panel shows "Tor binary not found" otherwise.
- Build prerequisites: Node.js + npm, Rust stable, Tauri v2 platform prerequisites (MSVC C++ Build Tools + WebView2 on Windows; Xcode CLT on macOS; `webkit2gtk` on Linux).
- Installers: `Aether-GUI_x.y.z_x64-setup.exe` (recommended), `Aether-GUI_x.y.z_x64_en-US.msi`; Windows x64 only today. Bundles: NSIS `.exe`/`.msi` (Windows), `.dmg`/`.app` (macOS), `.deb`/`.AppImage`/`.rpm` (Linux).
- `src-tauri/binaries/wintun.dll` IS committed (TUN mode); never commit fetched engine payloads or identity `*.toml` files.

### README organization (no FAQ exists)

Heading sequence of `README.md`: badges/language switch → pitch → **Versions and engine repair** → **Features** (Auto mode; Advanced panel: Protocol, Scan Mode, IP Version, MASQUE Transport, Obfuscation, Quick reconnect, Tunnel DNS, Upstream proxy, Routing, Zero Trust; Live progress; Automatic reconnect; Egress location & leak check; Connection history; Live log window; Native engine Tor; Native engine Psiphon; IP Changer) → **Settings** (Capture mode, System niceties, Appearance, Import/export) → **Installing** → **Building from source** (6 steps) → **How it works** → **About Aether** → **Attribution & trademark** (incl. DMCA route) → **License**. There is **no FAQ section**; screenshots are not embedded anywhere (only shields.io badges; `docs/screenshot-idle.png` exists standalone).

Key README claims worth remembering: TUN capture mode is "currently gated off in the UI until fully wired"; leak check compares exit IP vs real direct IP each connect and raises "Leak detected"; auto-reconnect shows "Reconnecting… (attempt N of 3)"; ambient background is "two compositor-only CSS gradient orbs" frozen while unfocused; "The manifest and platform configurations describe intended support; this documentation does not claim successful builds, platform verification or live network connectivity."

### README_fa parity (confirmed, not translation-reviewed)

`README_fa.md` (25.7KB) mirrors `README.md` structure one-to-one: same badges, language switch (**English** · **فارسی**), same heading sequence in Persian (`نسخه‌ها و ترمیم موتور`, `امکانات`, `تنظیمات`, `نصب`, `ساختن از روی سورس`, `پشت صحنه چطور کار می‌کند`, `درباره‌ی Aether`, `انتساب و نشان تجاری`, `مجوز`), same versions (`1.18.0`, `2.1.0`), same ports (`1819`, `1820`, `1821`, `9050`), same engine path `<app-data>/binaries/engine-2.1.0/`. This is a structural/parity confirmation only — Persian wording quality not reviewed.

### PRODUCT.md digest

- **Platform field:** `web` (per impeccable schema — a desktop webview app; WebView2 on Windows).
- **Personas / users:** non-technical users in heavily restricted networks, primarily Persian-speaking, who need circumvention without a command line.
- **Positioning:** "The single button, not the terminal … Same engine, zero threshold."
- **Product principles (5):** One click over configuration; Trust the mechanism, not the wording (TCP probe + real IP comparison, never decorative state); Resilience without noise (auto-retry, backoff, orphan reaping); No reimplementation (orchestrate, never replace the upstream binary); Quiet in the background (compositor-only effects, frozen when unfocused).
- **Success metrics:** *none recorded* — PRODUCT.md contains no quantitative metrics; "Evidence on Hand" instead states no testimonials/case studies/press exist and must not be fabricated. [UNCERTAIN] whether metrics were intentionally omitted.
- **Accessibility:** bilingual Persian surface, copy must stay translatable; "No product-specific accessibility standard recorded".
- **Noted quirk:** "Windows Defender false-positive reduction is an explicit past concern (proxy notify, Program Files install, signing)."

### DESIGN.md digest ("Clear Signal")

- **Front-matter tokens:** colors — ember `#f2711c`, ember-deep `#ea580c`, ember-ink `#0d0d0f`, canvas `#0b0b0c`, paper `#fafafa`, surface-1…4 `#101012`/`#151517`/`#1b1b1e`/`#212124`, ash `#a1a1aa`, line `rgba(255,255,255,0.09)`, connected `#2dd4bf`, error `#ef4444`, idle `#6b7280`, light-canvas `#f4f4f5`, light-card `#ffffff`; typography — Geist Variable body 14px/1.5, label 11px/500/+0.08em, JetBrains Mono Variable 12px; radii — sm 6 / md 8 / lg 10 / xl 14 / window 18 / window-base 30 / pill 999 px; spacing — xs 6 / sm 10 / md 12 / lg 20 px; components — button-primary (ember-deep fill, ink text, 32px), button-outline, input (surface-3, mono), hero-disc (160px pill), panel (surface-2, 14px, hairline border).
- **Named rules:** One Accent Rule (accent <10% of screen; selection = hairline ring + dot, never filled pill); Status Trio Rule (connecting amber / connected teal / error red / idle gray regardless of accent); Readability Floor (no text <11px, no secondary text <85% opacity in dark); Tabular Telemetry (JetBrains Mono `tabular-nums` for ticking numbers); Flat-By-Default (hover +1px, press 0.98, only light-theme shadow allowed; **zero `backdrop-filter`** — glass is banned).
- **Layout:** 420×640 window, 18px top / 30px bottom rounding, TitleBar + five tabs (Tunnel · Advanced · IP Changer · History · Settings), one full-height surface each; Tunnel tab = 160px connect disc + status sentence + location chip + actions + mode row, nothing else.
- **Motion:** sonar rings while connecting, one drifting wash, all paused when unfocused; `prefers-reduced-motion` honored (decorative loops stop, connection feedback may run); `:lang(fa)` collapses Latin letter-spacing.

### SECURITY.md

- **Reporting:** do NOT open public issues; use GitHub Security Advisories → `https://github.com/FreaksLxss/Aether-GUI-Next/security/advisories/new`; acknowledgement "as soon as possible", coordinated fix + disclosure.
- **Scope split:** this repo owns Tauri IPC surface, spawning/prompt-answering of `aether`, checksum-pinning of the bundled binary, the app's Content-Security-Policy, and the auto-update/release pipeline; upstream CluvexStudio/Aether owns protocols/route discovery/encrypted-connection mechanics. Uncertain reports → report here, they route.
- **Censored-region note:** reporters must not include identifying data (real IPs, hostnames, city/ISP, unredacted logs).
- **Supported versions:** "Only the latest release receives security fixes."

### CONTRIBUTING.md

- Repo is GUI-only; tunnel/protocol changes go upstream.
- Setup = README "Building from source" + `npm install` + fetch Aether binary into `src-tauri/binaries/` + `npm run tauri dev`.
- Pre-PR gate (must pass locally): `npm run typecheck`, `npm run lint`, `npm run build`, `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings`.
- Target `main`, one change per PR, describe how behavior changes were tested; contributions licensed AGPL v3.0.

### docs/ contents

- `docs/` holds exactly two things: `releases/v0.17.1.md` (patch notes: IP Changer panel width fix, log-wrapping fix, shared panel-dialog sizing fix; explicitly "UI layout only"; compare link `v0.17.0...v0.17.1`) and `screenshot-idle.png`.
- `.claude/release-notes-v0.17.0.md` lives outside `docs/`: draft notes for the Aether 2.0.0 engine integration — engine+`pt/lyrebird` bundling, manifest pinning, versioned app-data preference, profile validation/migration (bridge-file → bridge lines warning), native-Tor secondary-listener readiness, verification stats ("85 Rust tests passed, strict Clippy passed, frontend production build passed, ESLint … one existing TanStack Virtual warning. Engine packaging tests: 10 passed"), platform targets (Windows x64, Linux x64, macOS Apple Silicon + Intel; no Android), and explicit caveats (CI must succeed before publishing; real WARP/Tor connectivity not exercised).

### Agent/tooling config dirs — what's noise vs product

- **`.claude/`** — Claude Code project config: `settings.local.json` (tool-permission allowlist + PostToolUse/Stop hooks invoking `impeccable/scripts/hook.mjs` for design checks), `launch.json` (vite on 1420 / vite-session on 1421), `skills/` (design skill library; several 0-byte entries that appear to be pointer/marker files to `.agents/skills` [UNCERTAIN]), `worktrees/` (agent scratch worktrees), `flag-build.log`, the v0.17.0 release-note draft. **Not product source.**
- **`.agents/`** — `skills/` only: 15 personal skill packs (`squircle`, `design-taste-frontend`, `stitch-design-taste`, `redesign-existing-projects`, `minimalist-ui`, `industrial-brutalist-ui`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `image-to-code`, `high-end-visual-design`, `gpt-taste`, `full-output-enforcement`, `design-taste-frontend-v1`, `brandkit`, …). **Prompt packs, not code.**
- **`.impeccable/`** — state of the "impeccable" design-review tool: `design.json` (generated design-system JSON, `generatedAt 2026-09-12`), `decision-payload.json` (chosen visual world "The Honest Dashboard" — automotive instrument-cluster lineage, palette `#0c0d0f #141519 #f2f2f0 #f2711c #2dd4bf`, 12×10 wireframe regions incl. five-tab rail), `hook.cache.json`, `critique/`, `live/`, `questions/`, `config.local.json`. **Tool state.**
- **`.mimocode/`** — another agent tool's workspace: `plans/` (two 2-month-old plan `.md`s), minimal `package.json` (59B) + lockfile, `.cron-lock`. **Tooling residue.**
- **`.github/agents/`** — four impeccable sub-agent prompt files (manual-edit-applier, finish-reviewer, documenter, asset-producer). **Tooling.**
- **`.github/skills/impeccable/`** — the impeccable skill (`SKILL.md` 10.4KB + `scripts/` + `reference/`). **Tooling.**
- **`.github/hooks/impeccable.json`** — postToolUse hook (Node 22-gated `hook.mjs`). **Tooling.**
- **`.github/workflows/build.yml`**, **`.github/ISSUE_TEMPLATE/`** — real repo infrastructure (CI + issue forms), documented by the build slice.

### Doc-vs-repo claims to cross-check (flags)

Format: `claim → verify in <slice>`.

1. `GUI 1.18.0 / engine 2.1.0` (README, AGENTS.md) — **confirmed present** in `package.json` `version: 1.18.0`, `src-tauri/tauri.conf.json` `version: 1.18.0`, `src-tauri/aether-release.json` `version: 2.1.0` → **BuildPackaging** should confirm no drift elsewhere (Cargo.toml version, updater feed, `rel210.json`).
2. `PRODUCT.md says GUI 0.17.1 / engine 2.0.0` — stale vs README/repo → **Main** (doc fix) / BuildPackaging confirm current truth.
3. `docs/releases/v0.17.1.md and .claude/release-notes-v0.17.0.md say engine 2.0.0` — historical but unmarked-as-historical → **Main**.
4. `"Connected" = TCP connect to profile primary SOCKS5, default 127.0.0.1:1819` → **BackendAetherCore** (`src-tauri/src/aether/status.rs`).
5. `Engine Tor secondary listener default 1820; Psiphon chained 1821; only-modes use primary` → **BackendAetherCore**.
6. `IP Changer runs its own Tor on 9050/9051, control protocol over loopback with cookie auth, NEWNYM/SHUTDOWN, reuses net.rs endpoints via socks5h` → **BackendTunIpChanger**.
7. `State machine Idle→Launching→Connecting→Connected; Reconnecting backoff capped at 3; user-requested disconnect never retried; Error final` → **BackendLifecycle** + **FrontendConnUI**.
8. `Reconnect UI string "Reconnecting… (attempt N of 3)"` → **FrontendConnUI**.
9. `Leak check compares exit IP vs real direct IP every connect, raises "Leak detected"` → **BackendProxyNet** (`net.rs`) + **FrontendConnUI**.
10. `TUN capture mode "gated off in the UI until fully wired"; TUN Windows-only` → **BackendTunIpChanger** (`tun/`) + **FrontendConnUI** (Settings).
11. `System-proxy capture mode; upstream proxy --upstream semantics (SOCKS5 all transports, HTTP MASQUE-over-H2 only)` → **BackendProxyNet**.
12. `minimize_on_startup only honored when close_to_tray enabled (main.rs)` → **BackendLifecycle**.
13. `Settings persist via tauri-plugin-store in settings.json under app data; window position persisted` → **BackendLifecycle**.
14. `Startup reaps orphaned Aether processes/TUN adapters (aether::orphan, tun::cleanup)` → **BackendLifecycle**/**BackendAetherCore**.
15. `Engine repair path <app-data>/binaries/engine-2.1.0/; versioned-download preference; sibling backup; PT companion required; stop Aether before repair` → **BackendAetherCore** (`aether/engine.rs`) + **BuildPackaging** (fetch helpers).
16. `Fetch helper validates SHA-256, archive members, both executable architectures, `aether --version` on native arch; stages aether + pt/lyrebird (+ psiphon-tunnel-core) under src-tauri/binaries/engine/` → **BuildPackaging**.
17. `wintun.dll committed; identity TOMLs excluded from installers` → **BuildPackaging**.
18. `Vite port 1420 strictPort:true, watcher ignores src-tauri/**, two HTML entry points (index.html, log-window.html)` → **FrontendShell**.
19. `Two compositor-only CSS gradient orbs; looping animations freeze when unfocused; zero backdrop-filter` → **FrontendVisualUI**.
20. `src/types/three.d.ts hand-written ambient module shadows @types/three` — file exists → **FrontendLibHooks** confirm still shadowing.
21. `IPC commands registered in src-tauri/src/main.rs` — file exists → **BackendAetherCore** confirm registration list.
22. `Scan modes Turbo/Balanced/Thorough/Verified/Ironclad; Stealth→Verified rename at ≥2.1.0; Ironclad does real tunnel+HTTP probe` → **BackendAetherCore**/**BackendProfilesPty**.
23. `About uses get_app_version / get_engine_info, no hardcoded core version` → **BackendAetherCore** + **FrontendChromeUI** (AboutDialog).
24. `Connection history fields (protocol, scan mode, duration, time, success/failure) + clear-history` → **BackendLifecycle** (`history.rs`) + **FrontendConnUI**.
25. `Auto-rotate interval 1–60 minutes for IP Changer` → **BackendTunIpChanger**.
26. `Bundle formats NSIS/msi/dmg/app/deb/AppImage/rpm; outputs under src-tauri/target/release/bundle/` → **BuildPackaging**.
27. `npm run build = tsc -b && vite build; no frontend test suite; Rust tests in aether/*.rs + tun/adapter.rs` → **BuildPackaging**/**Main** (exact counts in release notes: "85 Rust tests", "Engine packaging tests: 10 passed" — likely stale).

## Links to other sections

- **BuildPackaging slice** — `.github/workflows/build.yml`, `package.json` scripts/version, `src-tauri/tauri.conf.json`, `aether-release.json`, `binaries/fetch-aether.*`, `rel210.json`, `setup.bat`, installer artifacts.
- **BackendAetherCore slice** — `aether/status.rs` (1819 probe), `aether/engine.rs` (repair/resolver), `aether/prompts.rs`, `main.rs` IPC registration, `get_app_version`/`get_engine_info`.
- **BackendTunIpChanger slice** — `ip_changer.rs` (9050/9051), `tun/*` (Windows-only TUN).
- **BackendProxyNet slice** — `net.rs` leak-check endpoints, `sysproxy.rs`, `httpproxy.rs`.
- **BackendLifecycle slice** — `state.rs`, `history.rs`, orphan reaping, settings store/`minimize_on_startup` gating, reconnect cap.
- **BackendProfilesPty slice** — `aether/profiles.rs`, `pty*.rs`, scan-mode/protocol flag serialization.
- **FrontendShell slice** — `vite.config.ts` (port 1420, multi-input), `index.html`/`log-window.html`, `main.tsx`.
- **FrontendConnUI slice** — connect flow, leak banner, reconnect UI, capture-mode settings, `ConnectButton`/`ConnectionStatusLine`.
- **FrontendVisualUI slice** — DESIGN.md compliance (accent rule, no backdrop-filter, freeze-on-blur, `:lang(fa)` guard), `index.css`, `ColorTheme`/`AmbientBackground`/`MagicRings`.
- **FrontendChromeUI slice** — TitleBar, AppMenu, AboutDialog, tray/window controls.
- **FrontendLibHooks slice** — `src/types/three.d.ts`, hooks, `lib/*`, validators/formatters.
