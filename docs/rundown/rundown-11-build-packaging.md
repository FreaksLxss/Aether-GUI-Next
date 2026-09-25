# Build, packaging, CI, repo tooling (slice 11)

## File inventory

| path | ~size | purpose |
|---|---|---|
| `package.json` | 1,878 B | npm package `aether-gui` v1.18.0, `type: module`; scripts + deps (React 19, Tauri 2 APIs, Tailwind 4, Vite 8, TS ~6, ESLint 10, Prettier 3) |
| `vite.config.ts` | 939 B | Vite config: React + Tailwind plugins, `@` alias, **two HTML inputs**, manual chunks, dev server 1420/strictPort, watches ignore `src-tauri` |
| `tsconfig.json` | 205 B | Solution root: `"files": []`, references `tsconfig.app.json` + `tsconfig.node.json`, `@/*` path alias |
| `tsconfig.app.json` | 713 B | App (browser) program: ES2023+DOM, `strict`, `noEmit`, `jsx: react-jsx`, includes `src` |
| `tsconfig.node.json` | 615 B | Tooling program: ES2023, `types: ["node"]`, includes only `vite.config.ts` |
| `eslint.config.js` | 828 B | Flat config: TS+React Hooks+React Refresh recommended, ignores `dist`/`src-tauri/target`/`.claude` |
| `.prettierrc` | 264 B | Prettier style (no semicolons, double quotes, LF) + tailwindcss plugin config |
| `.prettierignore` | 102 B | Excludes deps dirs and all lockfiles from formatting |
| `components.json` | 576 B | shadcn CLI config: style `radix-nova`, lucide icons, `@/` aliases, `@react-bits` registry |
| `src-tauri/Cargo.toml` | 1,241 B | Rust crate `aether-gui` v1.18.0, edition 2021, rust-version 1.98, Tauri 2 + plugins, portable-pty, Windows-only deps |
| `src-tauri/build.rs` | 42 B | One line: `tauri_build::build()` — generates `gen/` schemas and bundles resources |
| `src-tauri/tauri.conf.json` | 1,297 B | Main Tauri config: identifier, window, CSP, bundle targets/resources, NSIS mode, build hooks |
| `src-tauri/tauri.macos.conf.json` | 141 B | macOS platform overlay: replaces `bundle.resources` with non-.exe engine paths |
| `src-tauri/tauri.linux.conf.json` | 141 B | Linux platform overlay: identical resources list to the macOS overlay |
| `src-tauri/capabilities/default.json` | 761 B | Capability `default` → window `main`: 17 permissions (core window/webview, notification, autostart, shell, dialog, clipboard) |
| `src-tauri/capabilities/log-window.json` | 250 B | Capability `log-window` → window `log-window`: `core:event:default` + `core:window:allow-close` only |
| `src-tauri/aether-release.json` | 875 B | Pinned engine release manifest: version 2.1.0, repo, 5 assets with sha256 |
| `src-tauri/binaries/fetch-aether.py` | 7,354 B | Stdlib-only engine fetcher: download → sha256 → arch check → safe extract → atomic activate |
| `src-tauri/binaries/fetch-aether.sh` | 482 B | POSIX wrapper: `exec python3 "$SCRIPT_DIR/fetch-aether.py" "$@"` (CI Linux/macOS path) |
| `src-tauri/binaries/fetch-aether.ps1` | 319 B | PowerShell wrapper: runs `python fetch-aether.py`, throws on non-zero exit (CI Windows path) |
| `src-tauri/binaries/test_fetch_aether.py` | 5,061 B | `unittest` fixture suite (10 tests) for the fetcher — no network |
| `src-tauri/binaries/run-aether.bat` | 269 B | Windows launch helper shipped *inside the engine archive* (allowed member): runs `aether.exe %*`, `pause`s on exit |
| `setup.bat` | 2,787 B | Interactive first-time Windows setup: checks node/npm/cargo, `npm install`, `npx vite build`, then dev/build menu |
| `.github/workflows/build.yml` | 5,144 B | The **only** workflow: 4-OS matrix, fetch engine, test, prune Tor, `tauri-action`, optional Windows signing, upload bundles |
| `.gitignore` | 1,228 B | Excludes deps, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, engine payloads, identity `.toml`, logs, IDE/OS junk |
| `src-tauri/gen/` (generated) | 745 KB | **Gitignored**, produced by `tauri_build::build()`: `gen/schemas/{desktop,mobile,windows,android}-schema.json` (163,815 B each), `acl-manifests.json` (89,374 B), `capabilities.json` (824 B) |
| `rel210.json` | 55,969 B | Raw GitHub API release object for upstream `CluvexStudio/Aether` **v2.1.0** (release id 393702833) — source of `aether-release.json` |
| `skills-lock.json` | 3,268 B | Lockfile for 13 externally-installed agent skills (`version: 1`), each with `source`, `skillPath`, `computedHash` |
| `src-tauri/Cargo.lock` (present) | 156,506 B | Locked Rust deps (committed) |
| `package-lock.json` (present) | 319,736 B | Locked npm deps (committed; CI uses `npm ci`) |

Note: the assignment's `fetch-aether.ps1`, `fetch-aether.sh`, `test_fetch_aether.py`, `run-aether.bat` all live under **`src-tauri/binaries/`**, not the repo root. There is no root-level `run-aether.bat`. `.github/workflows/` contains exactly one file: `build.yml`.

## Architecture / data flow

### dev/build/lint pipeline

`package.json` scripts (verbatim):

```json
"dev": "vite",
"build": "tsc -b && vite build",
"lint": "eslint .",
"format": "prettier --write \"**/*.{ts,tsx}\"",
"typecheck": "tsc --noEmit",
"preview": "vite preview",
"tauri": "tauri"
```

- `npm run dev` → Vite dev server on port **1420** (`strictPort: true`, so it fails rather than shifting); `server.watch.ignored = ["**/src-tauri/**"]` so Vite never reload-loops on Rust/asset changes; `clearScreen: false` keeps Tauri CLI output visible.
- `npm run build` → `tsc -b` (solution build against `tsconfig.app.json` + `tsconfig.node.json`, `noEmit`, buildinfo in `node_modules/.tmp/`) then `vite build`. This is the only typecheck gate that runs in CI.
- `npm run typecheck` → `tsc --noEmit` (same compiler options, no bundling).
- `npm run lint` → `eslint .` over `**/*.{ts,tsx}`; **not run by CI**.
- `npm run format` → Prettier write over `**/*.{ts,tsx}`; not run by CI.
- Tauri wires these via `tauri.conf.json` → `build.beforeDevCommand: "npm run dev"`, `build.beforeBuildCommand: "npm run build"`, `build.devUrl: "http://localhost:1420"`, `build.frontendDist: "../dist"`.

### Vite multi-input

`build.rollupOptions.input`:
- `main` → `index.html` (repo root)
- `log-window` → `log-window.html` (repo root)

So `dist/` contains two HTML entrypoints: the main window and the separate log-viewer window. `manualChunks` splits `three`, `motion`, and `radix-ui`/`radix` out of the main bundle. `resolve.alias["@"` → `./src`.

### Engine payload flow (fetch → verify → stage → activate)

```
src-tauri/aether-release.json  (pinned version + 5 sha256 asset pins)
        │ read by
src-tauri/binaries/fetch-aether.py          ← invoked via fetch-aether.sh / fetch-aether.ps1
        │ 1. select_asset: platform.system()/machine() → "windows|linux|macos"-"x86_64|aarch64"
        │    env AETHER_ASSET overrides (must match a pinned asset for the current OS)
        │ 2. GET https://github.com/{repository}/releases/download/v{version}/{name}
        │    User-Agent "Aether-GUI", 30s timeout, 64 MiB / 180 s download limits
        │ 3. verify_checksum: sha256 hex == pinned sha256
        │ 4. extract_payload into temp dir ".engine-stage-*" inside binaries/
        │    zip (windows) or tar.gz; member allow-list + arch check per binary
        │ 5. engine --version smoke test (native arch only) == "aether {version}"
        │ 6. activate(): rename old engine/ → .engine-backup-<uuid>, rename stage → engine/
        ▼
src-tauri/binaries/engine/{aether[.exe], pt/lyrebird[.exe], pt/psiphon-tunnel-core[.exe]}
        │ listed in tauri.conf.json bundle.resources
        ▼
Tauri bundle (tauri-action in CI) → dist installers under src-tauri/target/**/bundle/
```

Committed, *not* fetched: `src-tauri/binaries/tor/` (per-OS/arch Tor bundles with `data/geoip`, `data/geoip6`, `data/torrc-defaults`) and `src-tauri/binaries/wintun.dll`.

### CI flow (`.github/workflows/build.yml`)

checkout → setup-node 22 (npm cache) → setup-python 3.12 → rust-toolchain@stable (+matrix target) → [Linux: apt system deps] → fetch engine (sh/ps1) → run fetcher unit tests → prune non-target Tor dirs → `npm ci` → `tauri-apps/tauri-action@v0` (build + draft release) → [Windows: conditional signtool] → upload-artifact bundles.

## Key details

### Tauri config (`src-tauri/tauri.conf.json`)

- `productName`: `Aether-GUI`, `version`: `1.18.0`, `identifier`: `com.cluvexstudio.aethergui` (schema `https://schema.tauri.app/config/2`).
- Single window, **no `label`** → Tauri default label `main` (this is why capabilities target `windows: ["main"]`). Fields: `title: "Aether-GUI"`, `width: 420`, `height: 640`, `minWidth: 320`, `minHeight: 400`, `resizable: true`, `center: true`, `decorations: false`, `transparent: true`, `shadow: false`. The `log-window` window is **not** in config — it is created at runtime from the main webview (`core:webview:allow-create-webview-window`) and gets its own capability.
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.
- Bundle: `active: true`, `targets: "all"`, `publisher: "Aether-GUI"`, icons `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`.
- Windows: `bundle.windows.nsis.installMode: "perMachine"`.
- **No updater block and no `tauri-plugin-updater` dependency → there are no updater endpoints/artefacts anywhere in the repo** (grep for `updater|endpoints|createUpdaterArtifacts` across `tauri*.json`, `Cargo.toml`, `package.json`, workflow: zero matches).

`bundle.resources` (base, i.e. Windows):
`binaries/engine/aether.exe`, `binaries/engine/pt/lyrebird.exe`, `binaries/engine/pt/psiphon-tunnel-core.exe`, `binaries/tor`, `binaries/wintun.dll`

`tauri.macos.conf.json` and `tauri.linux.conf.json` are byte-identical overlays providing:
`binaries/engine/aether`, `binaries/engine/pt/lyrebird`, `binaries/tor`, `binaries/wintun.dll`
(they override `bundle.resources` — note no `psiphon-tunnel-core` entry on macOS/Linux, while `wintun.dll` is still listed; exact array-merge semantics of Tauri's platform overlay are [UNCERTAIN], but the base list would otherwise ship Windows `.exe` paths on Unix).

### Capabilities / permissions granted

`capabilities/default.json` → identifier `default`, windows `["main"]`, description "Capability for the main window":
`core:event:default`, `core:window:allow-is-focused`, `core:window:allow-start-dragging`, `core:window:allow-close`, `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-show`, `core:window:allow-hide`, `core:window:allow-set-always-on-top`, `core:window:allow-is-always-on-top`, `core:webview:allow-create-webview-window`, `notification:default`, `autostart:default`, `shell:allow-open`, `dialog:default`, `clipboard-manager:allow-write-text`, `clipboard-manager:allow-read-text`.

`capabilities/log-window.json` → identifier `log-window`, windows `["log-window"]`, description "Capability for the log viewer window":
`core:event:default`, `core:window:allow-close`.

Both declare `"$schema": "../gen/schemas/desktop-schema.json"`. The resolved merged view is emitted to `src-tauri/gen/schemas/capabilities.json` (`"local": true` on both).

### Cargo (`src-tauri/Cargo.toml`)

- package `aether-gui` 1.18.0, `edition = "2021"`, `rust-version = "1.98"`, description "One-click GUI for the Aether censorship-circumvention tunnel".
- `[lib] name = "aether_gui_lib"`, `crate-type = ["staticlib", "cdylib", "rlib"]`.
- **No `[profile]` sections and no `[features]`** — stock release profile.
- build-dep: `tauri-build = { version = "2", features = [] }`.
- deps: `tauri = { version = "2", features = ["tray-icon"] }`; plugins `tauri-plugin-store`, `-notification`, `-autostart`, `-shell`, `-dialog`, `-clipboard-manager` (all `"2"`); `serde 1 (derive)`, `serde_json 1`, `thiserror 1`; `reqwest 0.12` with `default-features = false` + `json, socks, rustls-tls`; `zip 2`, `tar 0.4`, `flate2 1`, `log 0.4`, `base64 0.22`, `sha2 0.10`.
- `cfg(not(target_os = "android"))`: `portable-pty = "0.8"` (the PTY used for engine/log streaming).
- `cfg(windows)`: `windows-sys 0.59` (features `Win32_Foundation`, `Win32_UI_WindowsAndMessaging`, `Win32_Networking_WinInet`, `Win32_System_Threading`, `Win32_Security`, `Win32_NetworkManagement_IpHelper`, `Win32_NetworkManagement_Ndis`), `winreg 0.55`, `wintun 0.5`, `pnet_packet 0.35`, `parking_lot 0.12`.
- `src-tauri/build.rs` exists solely to call `tauri_build::build()` (codegen + resource embedding).
- `src-tauri/Cargo.lock` is committed (156,506 B).

### `aether-release.json` (pinned engine manifest)

```json
{ "version": "2.1.0", "repository": "CluvexStudio/Aether",
  "assets": { "<target>": { "name": "<asset file>", "sha256": "<64 hex>" } } }
```

| key | name | sha256 |
|---|---|---|
| `windows-x86_64` | `aether-windows-x86_64.zip` | `16221819f57b1519302dec4488ff2890a1e64ebab233ed27a289be167138677b` |
| `linux-x86_64` | `aether-linux-x86_64-musl.tar.gz` | `db70a0f5258ae27695d4f14e98f88049e761c1985908582a941d25e57febbf5b` |
| `linux-aarch64` | `aether-linux-aarch64-musl.tar.gz` | `8bbc8ba5dcbe01d08a63424793d55a23002e1220eb2752ab46bb61e09a5e15e9` |
| `macos-x86_64` | `aether-macos-x86_64.tar.gz` | `d80e4bd11125b7b4511de454d7baf51470f7e377691b6a9ca30d29fad2685b54` |
| `macos-aarch64` | `aether-macos-arm64.tar.gz` | `4cb73361301ccf87f6b15eedb1c058a7cc0fb41508dc1943f307439ed6774881` |

Note the key is `macos-aarch64` but the asset filename says `arm64`. URLs are constructed, not stored: `https://github.com/CluvexStudio/Aether/releases/download/v2.1.0/<name>`. All five sha256 values match the `digest` fields of the corresponding assets in `rel210.json`.

### `fetch-aether.py` behaviour (180 lines, Python 3 stdlib only)

- Header docstring: "Fetch the pinned engine payload set (aether + pt/lyrebird + pt/psiphon-tunnel-core) into binaries/engine (Python 3, no packages)." Guarantees: root binaries, Tor, Wintun and identity/state files are never modified; a replaced engine folder is retained as a sibling backup, "never recursively deleted".
- Constants: `MAX_ARCHIVE = 64 * 1024 * 1024`, `MAX_FILE = 128 * 1024 * 1024`; `ROOT` = script's directory.
- `select_asset`: maps `platform.system()` (`Windows/Linux/Darwin` → `windows/linux/macos`) and `platform.machine()` (`AMD64|x86_64` → `x86_64`, `aarch64|arm64` → `aarch64`); key `{system}-{arch}` must exist in the manifest, else `ValueError("Unsupported platform: …")`. Env **`AETHER_ASSET`** overrides by asset *name*, but must match exactly one pinned asset whose key starts with `{system}-`.
- `verify_checksum`: sha256 of downloaded bytes must equal the pin → else `ValueError("SHA256 mismatch: …")`.
- `check_architecture` per target, on the *extracted binary*:
  - windows: `MZ` magic, PE offset at 0x3C, `PE\0\0\x64\x86` (x86-64 machine) and arch must be `x86_64`.
  - linux: `\x7fELF\x02\x01` and `e_machine` at offset 18 == 62 (x86_64) / 183 (aarch64).
  - macos: `\xcf\xfa\xed\xfe` (MH_MAGIC_64) and `cputype` at offset 4 == `0x01000007` (x86_64) / `0x0100000C` (arm64).
- `extract_payload(data, target, dest)`:
  - Required members: `aether[.exe]`, `pt/lyrebird[.exe]`, `pt/psiphon-tunnel-core[.exe]`.
  - Allow-list = those three + directory `pt` (+ `run-aether.bat` on Windows, accepted but **not written**: `if name not in required: return`).
  - Rejects: unexpected names, duplicates, directory/file mismatch, non-regular entries, symlink/`flag_bits & 1` zip entries, per-file > `MAX_FILE`, total > `2 * MAX_FILE`, short reads ("Truncated archive member").
  - Each required payload gets `check_architecture`, is written with `open("xb")` (exclusive create) and `chmod(0o755)`.
  - Completeness: `if not required.issubset(seen)` → `ValueError("Incomplete engine archive: …")`.
  - Windows → `zipfile` from memory; Unix → `tarfile.open(mode="r:gz")` reading `MAX_FILE + 1` capped members.
- `activate(stage, dest)`: refuses a symlink/file destination; renames existing `engine/` → `.engine-backup-<uuid4hex>`, renames stage into place, and on failure restores the backup; prints `Previous installation preserved at <backup>`.
- `main()`: reads `../aether-release.json` (`ROOT.parent`), builds URL, downloads with `User-Agent: Aether-GUI`, enforces 180 s deadline and 64 MiB cap, verifies sha256 and prints `"<asset> SHA256 <digest>"`, extracts into `.engine-stage-*` under `binaries/`, then — only when `target.endswith(f"-{native_arch}")` — runs `<stage>/<engine> --version` (10 s timeout, `cwd=stage`) and requires stdout to equal `aether 2.1.0`; finally `activate()` → `Complete engine ready at …/binaries/engine/<engine>`; stage removed in `finally`.
- Platform matrix: 5 manifest targets; only `windows-x86_64`, `linux-x86_64`, `linux-aarch64`, `macos-x86_64`, `macos-aarch64`. Actual checkout on this machine: `binaries/engine/{aether.exe, pt/lyrebird.exe, pt/psiphon-tunnel-core.exe}` (~60 MB, gitignored).

### Wrappers

- `fetch-aether.sh`: `#!/usr/bin/env bash`, `set -euo pipefail`, `exec python3 "$SCRIPT_DIR/fetch-aether.py" "$@"`. Comment: "Run before `tauri dev` / `tauri build`; CI invokes this for Linux/macOS." Also documents `AETHER_ASSET` "retains the macOS cross-build override (pinned assets only)".
- `fetch-aether.ps1`: `$ErrorActionPreference = 'Stop'`, runs `python (Join-Path $PSScriptRoot 'fetch-aether.py')`, `throw "Aether fetch failed (exit $LASTEXITCODE)"` on non-zero. Comment: "Python 3 is required; CI supplies it with `actions/setup-python`."

### `test_fetch_aether.py` coverage (10 tests, `unittest`, no network)

Loaded via `importlib.util.spec_from_file_location("fetch_aether", …/fetch-aether.py)`. Synthetic PE bytes (`MZ` + `PE\0\0\x64\x86`) and zip/tar builders.

| test | asserts |
|---|---|
| `test_complete_pt_layout` | full zip extracts `pt/lyrebird.exe` + `pt/psiphon-tunnel-core.exe`; `run-aether.bat` is accepted but **not** written |
| `test_checksum_mismatch` | `ValueError` matching `SHA256 mismatch` |
| `test_missing_pt` | missing psiphon, or missing lyrebird+psiphon → `Incomplete` |
| `test_unsafe_paths_and_unexpected_files` | `../aether.exe`, `/aether.exe`, `C:/aether.exe`, `pt\lyrebird.exe`, `evil/aether.exe`, `aether.toml`, `./aether.exe`, `PT/lyrebird.exe` all rejected |
| `test_duplicate_and_conflicting_paths` | duplicate `aether.exe`, file named `pt`, directory-shaped `aether.exe/` rejected |
| `test_zip_symlink` | zip entry with `external_attr = 0o120777 << 16`, `create_system = 3` rejected |
| `test_tar_links_rejected` | `tarfile.SYMTYPE` and `LNKTYPE` with `../target` rejected |
| `test_architecture_mismatch` | PE bytes against `linux-x86_64` rejected |
| `test_failed_activation_rolls_back` | patched `Path.rename` fails on the stage → old `engine/aether.exe` intact |
| `test_success_preserves_previous_install` | new content live, old content kept in `.engine-backup-*/aether.exe` |

CI invocation: `python -m unittest discover -s src-tauri/binaries -p "test_fetch_aether.py"`.

### CI — `.github/workflows/build.yml`

- `name: build`.
- Triggers: `workflow_dispatch:` and `push:` with `tags: ["v*"]`. `permissions: contents: write`.
- Single job `build`, `strategy.fail-fast: false`, matrix `include` (verbatim):

| name | os | target | aether_asset |
|---|---|---|---|
| `linux-x86_64` | `ubuntu-22.04` | `""` | `""` |
| `macos-arm64` | `macos-latest` | `aarch64-apple-darwin` | `""` |
| `macos-x86_64` | `macos-latest` | `x86_64-apple-darwin` | `aether-macos-x86_64.tar.gz` |
| `windows-x86_64` | `windows-latest` | `""` | `""` |

- Steps, in order: `actions/checkout@v4` → `actions/setup-node@v4` (`node-version: 22`, `cache: npm`) → `actions/setup-python@v5` (`python-version: "3.12"`) → `dtolnay/rust-toolchain@stable` (`targets: ${{ matrix.target }}`) → **Install Linux system dependencies** (`if: runner.os == 'Linux'`): `sudo apt-get update` + `sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libevent-2.1-7 libfuse2 patchelf` → **Fetch Aether core (Linux/macOS)** (`if: runner.os != 'Windows'`, env `AETHER_ASSET: ${{ matrix.aether_asset }}`, `bash src-tauri/binaries/fetch-aether.sh`) → **Fetch Aether core (Windows)** (`shell: pwsh`, `./src-tauri/binaries/fetch-aether.ps1`) → **Test safe engine archive installation** (`python -m unittest discover -s src-tauri/binaries -p "test_fetch_aether.py"`) → **Prune other-platform Tor bundles** (bash, `cd src-tauri/binaries/tor`, keeps `{linux,macos,windows}` dir and `keep_arch` subdir — `x86_64` for Linux/Windows, matrix-target-derived for macOS — deleting the rest) → `npm ci` → `tauri-apps/tauri-action@v0` → **Sign Windows binaries** (conditional) → `actions/upload-artifact@v4`.
- Engine fetch therefore happens **before** `npm ci`/build so `bundle.resources` (which point at `binaries/engine/…`) resolve.
- `tauri-apps/tauri-action@v0` env: `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `NO_STRIP: "true"`, `APPIMAGE_EXTRACT_AND_RUN: "1"`; with `tagName`/`releaseName` = `github.ref_name` when the ref is a tag (empty string otherwise), `releaseDraft: true`, `args: --target <matrix.target>` only when `matrix.target != ''`. So tag pushes build **and create a draft GitHub release**; `workflow_dispatch` builds without a release.
- **Sign Windows binaries** runs only `if: runner.os == 'Windows' && env.WINDOWS_CERT_BASE64 != ''` (secrets `WINDOWS_CERT_BASE64`, `WINDOWS_CERT_PASSWORD`): writes `code-signing-cert.pfx` to `$env:RUNNER_TEMP`, locates newest `signtool.exe` under `C:\Program Files (x86)\Windows Kits\10\bin\*\x64\`, signs every `*.exe|*.dll|*.msi` under `src-tauri\target` whose path matches `\bundle\` with `/tr http://timestamp.digicert.com /td sha256 /fd sha256`, throws on failure, then `gh release upload "$env:GITHUB_REF_NAME" "$file" --clobber` for each signed file **only when the ref is a tag**. With no cert secret configured the step is skipped entirely — i.e. signing is opt-in by secret presence.
- **No macOS codesigning/notarization step exists** (no `notarytool`, no `APPLE_*` secrets, no hardened-runtime step anywhere in the workflow).
- Artifacts: `actions/upload-artifact@v4` name `bundles-${{ matrix.name }}`, paths `src-tauri/target/**/bundle/**/*.dmg`, `**/*.AppImage`, `**/*.deb`, `**/*.rpm`, `**/*setup.exe`, `**/*.msi`.
- **Caching:** only `cache: npm` in setup-node. No Cargo/rust-cache action, no pip cache, no `actions/cache`.

### `rel210.json` — what it is

A raw, unmodified `GET https://api.github.com/repos/CluvexStudio/Aether/releases/393702833` response for upstream tag **`v2.1.0`** (`html_url: https://github.com/CluvexStudio/Aether/releases/tag/v2.1.0`), committed at repo root. Schema: `url`/`assets_url`/`upload_url`/`html_url`, `id`, `author` (the `github-actions[bot]` object), `node_id`, `tag_name: "v2.1.0"`, `target_commitish: "main"`, `name`, `draft: false`, `immutable: false`, `prerelease: false`, `created_at: "2026-09-22T11:56:01Z"`, `updated_at`/`published_at: "2026-09-22T12:13:11Z"`, `assets[]`, `tarball_url`, `zipball_url`, `body` (release notes), `reactions`.

`assets[]` = 25 entries, each `{url, id, node_id, name, label, uploader, content_type, state, size, digest, download_count, created_at, updated_at, browser_download_url}`. The 25 names: 12 archives × 12 `.sha256` sidecars + `SHA256SUMS.txt`:
`aether-android-arm64.tar.gz`, `aether-android-armv7.tar.gz`, `aether-android-x86_64.tar.gz`, `aether-linux-aarch64-musl.tar.gz`, `aether-linux-arm64.tar.gz`, `aether-linux-armv7-musl.tar.gz`, `aether-linux-armv7.tar.gz`, `aether-linux-x86_64-musl.tar.gz`, `aether-linux-x86_64.tar.gz`, `aether-macos-arm64.tar.gz`, `aether-macos-x86_64.tar.gz`, `aether-windows-x86_64.zip`, plus `SHA256SUMS.txt` (1,131 B).
Its `digest: "sha256:…"` values for the five targets are exactly the pins copied into `src-tauri/aether-release.json`, so `rel210.json` is the upstream snapshot from which that manifest was hand-derived (the 10 other platform assets are not pinned). `body` documents upstream Aether v2.1.0 features and states "The crate needs Rust 1.98" — matching `rust-version = "1.98"` in `Cargo.toml`.

### `setup.bat` — purpose

Windows-first-time onboarding script (title `Aether-GUI Setup`). Steps `[1/4]`–`[4/4]`:
1. Checks `node`, `npm`, `cargo` on PATH (prints version; errors with install hints — `winget install Rustlang.Rustup` / https://rustup.rs/, https://nodejs.org/), then probes `npx --yes @tauri-apps/cli --version` (`[WARN] Tauri CLI not found, will be used via npx.`).
2. `call npm install`.
3. `call npx vite build`.
4. Menu: `[1] Start in DEV mode` → `call npx tauri dev`; `[2] Build for PRODUCTION` → `call npx tauri build`, reporting output at `src-tauri\target\release\bundle\`; `[3] Exit`.
Every failure path does `pause` + `exit /b 1`. It does **not** fetch the engine — `binaries/engine/` must already exist before `tauri build` resolves `bundle.resources`.

### Repo hygiene — `.gitignore`

Grouped and verbatim keys:
- Dependencies: `node_modules/`, `.pnpm-store/`.
- Build output: `dist/`, `dist-ssr/`, `*.local`, `*.tsbuildinfo`.
- Env/secrets: `.env`, `.env.*`, `!.env.example`.
- Logs: `*.log`, `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*`, `pnpm-debug.log*`.
- Tauri/Rust: `src-tauri/target/`, `src-tauri/gen/`, `*.pdb`, `*.d`.
- **Engine payloads** (never committed): `src-tauri/binaries/aether`, `src-tauri/binaries/aether.exe`, `src-tauri/binaries/aether-*`, `src-tauri/binaries/*.tar.gz`, `src-tauri/binaries/*.zip`, `src-tauri/binaries/SHA256SUMS.txt`, `src-tauri/binaries/engine/`, `src-tauri/binaries/pt/`, `src-tauri/binaries/.engine-*/`, `src-tauri/binaries/__pycache__/`, `src-tauri/binaries/android/`.
- **Identity**: `src-tauri/binaries/*.toml` with the inline comment: "Aether writes its provisioned device identity (private keys, access tokens) here when run with binaries/ as its cwd (e.g. manual testing) — must never be committed."
- IDE/OS: `.vscode/*` (with `!.vscode/extensions.json`), `.idea/`, `*.swp`, `*.swo`, `*~`, `.DS_Store`, `Thumbs.db`, `ehthumbs.db`, `Desktop.ini`.
- Testing: `coverage/`, `.nyc_output/`.
- Misc: `.mimocode/`, `/ci-artifacts/`, `.claude/worktrees/`.

Consequently the only things *kept* under `src-tauri/binaries/` in git are the fetch scripts, the tests, `run-aether.bat`, `wintun.dll/`… and the whole `tor/` tree (`tor/{macos/{aarch64,x86_64},linux/{i686,x86_64},windows/x86_64}` each with `data/{geoip,geoip6,torrc-defaults}`); `engine/` is present locally (~60 MB) but ignored. `src-tauri/gen/` is likewise generated-but-ignored.

### Other tooling notes

- `skills-lock.json` — `"version": 1`, 13 skills each `{source, sourceType: "github", skillPath, computedHash}`; all from repo `Leonxlnx/taste-skill` (e.g. `brandkit` → `skills/brandkit/SKILL.md`, `design-taste-frontend` → `skills/taste-skill/SKILL.md`, plus `gpt-taste`, `full-output-enforcement`, `high-end-visual-design`, `image-to-code`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `industrial-brutalist-ui`, `minimalist-ui`, `redesign-existing-projects`, `stitch-design-taste`, `design-taste-frontend-v1`). Unrelated to app build; it is agent-harness tooling metadata.
- `components.json` — shadcn config consumed by the `shadcn` npm dep: `$schema https://ui.shadcn.com/schema.json`, `style: "radix-nova"`, `rsc: false`, `tsx: true`, tailwind `css: "src/index.css"`, `baseColor: "neutral"`, `cssVariables: true`, `prefix: ""`, `iconLibrary: "lucide"`, `rtl: false`, aliases `components/@/components`, `utils/@/lib/utils`, `ui/@/components/ui`, `lib/@/lib`, `hooks/@/hooks`, `menuColor: "default"`, `menuAccent: "subtle"`, `registries: {"@react-bits": "https://reactbits.dev/r/{name}.json"}`.
- `.prettierignore`: `node_modules/`, `coverage/`, `.pnpm-store/`, `pnpm-lock.yaml` (listed twice), `package-lock.json`, `yarn.lock`.
- `.prettierrc`: `endOfLine: "lf"`, `semi: false`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: "es5"`, `printWidth: 80`, `plugins: ["prettier-plugin-tailwindcss"]`, `tailwindStylesheet: "src/index.css"`, `tailwindFunctions: ["cn", "cva"]`.
- ESLint `globalIgnores(['dist', 'src-tauri/target', '.claude'])`; presets `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs.flat.recommended`, `reactRefresh.configs.vite`; `globals.browser`; rule `'no-empty': 'off'`; `src/components/ui/**` turns off `react-refresh/only-export-components`.
- Version alignment: `package.json` 1.18.0 = `tauri.conf.json` 1.18.0 = `Cargo.toml` 1.18.0; engine version pinned separately at 2.1.0.
- `.github/workflows/` holds only `build.yml` (plus non-workflow `hooks/`, `agents/`, `skills/`, `ISSUE_TEMPLATE/`).

## Links to other sections

- **Slice: frontend shell / window creation** — how the `log-window` label is created at runtime via `core:webview:allow-create-webview-window`, and how the two Vite entries (`index.html`, `log-window.html`) map to the `main` and `log-window` windows.
- **Slice: engine core / Aether integration** — what `binaries/engine/aether` and `pt/{lyrebird,psiphon-tunnel-core}` do at runtime; `--version` output format `aether 2.1.0` is the fetcher's contract with the engine.
- **Slice: PT/Tor handling** — the committed `src-tauri/binaries/tor/` tree (per-OS/arch + `data/`) that CI prunes before bundling.
- **Slice: tray / autostart / shell / dialog / clipboard / notifications** — the plugins whose `:*` permissions appear in `capabilities/default.json`.
- **Slice: terminal/PTY (portable-pty)** — the only non-Android conditional Rust dependency.
- **Slice 12: README/docs** — user-facing setup instructions; `setup.bat` is the scripted equivalent.
- **Slice: repo state / releases** — `rel210.json` (upstream v2.1.0 snapshot), `docs/releases/v0.17.1.md`, `.claude/release-notes-v0.17.0.md`.
