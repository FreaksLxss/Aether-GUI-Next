# AGENTS.md

Aether-GUI is a Tauri 2 desktop GUI wrapper for the [Aether](https://github.com/CluvexStudio/Aether) censorship-circumvention tunnel. This repo ships **only the GUI** — all tunnel/protocol logic lives upstream. Windows-first (Windows-only installers today), AGPL-3.0.

## Stack & layout

- Frontend `src/`: React 19 + TypeScript + Tailwind v4 + Zustand + Motion. Aliased as `@/*` → `src/*`.
- Backend `src-tauri/src/`: Rust, drives the real `aether` binary via `portable-pty`. Tauri IPC commands are registered in `src-tauri/src/main.rs`.
- The GUI bundles the prebuilt `aether` binary; it does not build it. TUN mode (`src-tauri/src/tun/`) is Windows-only.
- Docs are bilingual: changes to `README.md` must be mirrored in `README_fa.md`.

## Commands

```sh
npm run dev            # Vite only (no backend, no aether needed)
npm run tauri dev      # full app; requires the aether binary (see below)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run build          # tsc -b && vite build (frontend only)
npm run tauri build    # release installers -> src-tauri/target/release/bundle/
```

No frontend test suite exists. Rust has unit tests — run from `src-tauri/`:
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` (tests live in `aether/*.rs` and `tun/adapter.rs`).

Vite is pinned to port 1420 with `strictPort: true` and ignores `src-tauri/**` in its watcher (Cargo has its own rebuild loop) — don't change these.

## The `aether` binary (required before `tauri dev` works)

- The binary is gitignored; the bundled `src-tauri/binaries/aether.exe` on your machine is a local fetched copy.
- `src-tauri/binaries/fetch-aether.sh` pins `AETHER_VERSION` (currently `v1.4.0`) and verifies SHA256SUMS, but is **unix-only**. On Windows, download `aether-windows-x86_64.zip` + `SHA256SUMS.txt` from the pinned Aether release and extract `aether.exe` into `src-tauri/binaries/` (CI does this via the PowerShell block in `.github/workflows/build.yml`). Keep the pin in `fetch-aether.sh` in sync when bumping.
- `src-tauri/binaries/wintun.dll` IS committed (needed for TUN mode). Never commit `aether.exe` or the `*.toml` files — Aether writes its provisioned identity (private keys/tokens) there when run with `binaries/` as cwd.

## Non-obvious architecture facts

- **"Connected" ground truth** is a successful TCP connect to the local SOCKS5 port `127.0.0.1:1819` (`DEFAULT_SOCKS_ADDR` in `src-tauri/src/aether/status.rs`), NOT Aether's log wording. Preserve this invariant; log text is treated as fragile across releases.
- `src/types/three.d.ts` is a hand-written ambient `declare module "three"` that **shadows the real `@types/three`** for the app build (added to fix a CI issue). When using a new three.js API, extend this file with its minimal type.
- Two HTML entry points (multi-input in `vite.config.ts`): `index.html` (main window) and `log-window.html` (separate log window).
- Settings persist via `tauri-plugin-store` in `settings.json` under the app data dir. `minimize_on_startup` is only honored when `close_to_tray` is also enabled (see `main.rs`); window position is persisted there too.
- On startup the backend reaps orphaned Aether processes / TUN adapters from prior crashes (`aether::orphan`, `tun::cleanup`) — keep that behavior intact when touching process handling.
