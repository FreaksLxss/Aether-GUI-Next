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

- `src-tauri/aether-release.json` is the shared source of truth for the approved engine release, asset names and SHA-256 checksums. The GUI release is **1.18.0**; the pinned Aether engine is **2.1.0**. These are separate versions.
- Run `python src-tauri/binaries/fetch-aether.py` with Python 3 (3.9+); Windows also has `./src-tauri/binaries/fetch-aether.ps1`, and Linux/macOS have `bash src-tauri/binaries/fetch-aether.sh` (uses `python3`). CI and runtime repair use the same manifest, not upstream `latest`. The helper verifies the archive checksum, validates archive members and both executable architectures, and stages the complete payload into gitignored `src-tauri/binaries/engine/`: `aether.exe` + `pt/lyrebird.exe` + `pt/psiphon-tunnel-core.exe` on Windows, `aether` + `pt/lyrebird` + `pt/psiphon-tunnel-core` on Unix. Never flatten or omit `pt/`. Native fetches also inspect `--version`; this is not a connectivity check.
- Runtime install/repair writes to `<app-data>/binaries/engine-<pinned-version>/`. `src-tauri/src/aether/engine.rs` prioritizes a compatible versioned download over bundled/development/legacy candidates, so a stale bundle cannot shadow a repaired engine. A compatible candidate must report the pinned version and have an executable PT companion. Repair preserves the previous directory as a sibling backup rather than deleting existing state. Stop Aether before repair.
- About obtains the app version from `get_app_version` and engine information from `get_engine_info`; do not hardcode a core version in the UI. Check the manifest, resolver and platform resource configurations together when upgrading. Configured assets/build jobs are not evidence that a platform or live connection was verified.
- `src-tauri/binaries/wintun.dll` IS committed (needed for TUN mode). Never commit fetched engine payloads or identity/state `*.toml` files. Do not read, copy or delete provisioned identity files (private keys/tokens) during an engine upgrade; fetching/repair must leave legacy binaries, the independent Tor bundle and identity state alone.

## Non-obvious architecture facts

- **"Connected" ground truth** is a successful TCP connect to the profile's primary local SOCKS5 listener (default `127.0.0.1:1819`; see `src-tauri/src/aether/status.rs`), NOT Aether's log wording. This establishes local listener readiness, not end-to-end internet connectivity or leak protection.
- **Native engine Tor is not IP Changer**: Aether 2.1.0 provides Tor / Tor-Reverse / Tor-Only modes via arti and the bundled PT companion, plus Psiphon / Psiphon-Reverse / Psiphon-Only (Aether ≥2.1.0). Tor mode reports its secondary listener separately (default `127.0.0.1:1820`), Psiphon chain its own (default `127.0.0.1:1821`); only-modes use the primary listener, and reverse modes use their tool internally with MASQUE over HTTP/2 (not WireGuard/gool). The independent `ip_changer.rs` subsystem runs its own Tor expert bundle on SOCKS5/control ports 9050/9051; do not conflate their binaries, state, ports or readiness.
- `src/types/three.d.ts` is a hand-written ambient `declare module "three"` that **shadows the real `@types/three`** for the app build (added to fix a CI issue). When using a new three.js API, extend this file with its minimal type.
- Two HTML entry points (multi-input in `vite.config.ts`): `index.html` (main window) and `log-window.html` (separate log window).
- Settings persist via `tauri-plugin-store` in `settings.json` under the app data dir. `minimize_on_startup` is only honored when `close_to_tray` is also enabled (see `main.rs`); window position is persisted there too.
- On startup the backend reaps orphaned Aether processes / TUN adapters from prior crashes (`aether::orphan`, `tun::cleanup`) — keep that behavior intact when touching process handling.
