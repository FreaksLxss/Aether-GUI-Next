# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Non-technical users in heavily restricted networks (primarily Persian-speaking users, per the `README_fa.md` mirror) who need censorship circumvention without touching a command line. The app exists to make the `aether` terminal tool one click away for people who don't want to live in a terminal.

## Product Purpose

A one-click desktop GUI for Aether, a censorship-circumvention tunnel built for heavily restricted networks. Press Connect; everything else — identity provisioning, route discovery, answering interactive setup prompts — happens automatically in the background. The GUI drives the real `aether` binary in a pseudo-terminal; it does not reimplement any tunneling logic.

## Positioning

The single button, not the terminal. Aether is a terminal tool that discovers a working route out, establishes an encrypted tunnel, and exposes a local SOCKS5 proxy; Aether-GUI wraps the whole flow so a non-technical user never sees a prompt, a flag, or a scan log. Same engine, zero threshold.

## Operating Context

- Desktop app on Windows (x64), with macOS/Linux builds possible per-platform; Windows-first.
- The bundled `aether.exe` runs in a real pseudo-terminal via `portable-pty`; the backend answers its interactive prompts and forwards its log live to the GUI.
- "Connected" is based on a successful TCP connect to the profile's primary local SOCKS5 listener (default `127.0.0.1:1819`), not fragile log wording. This means local listener readiness, not verified end-to-end connectivity or leak protection.
- State machine: `Idle → Launching → Connecting → Connected`, with `Reconnecting` (auto-retry with backoff, capped at 3) and `Error` as attention states.
- TUN mode is Windows-only. Native Aether Tor (arti) offers Tor (WARP → Tor), Tor-Reverse (Tor → WARP, MASQUE over HTTP/2 only) and Tor-Only (no WARP). Tor mode reports its secondary listener (default 1820) separately; Tor-Only uses the primary listener and Tor-Reverse uses Tor internally. The optional IP Changer runs a separate Tor expert bundle on SOCKS5/control ports 9050/9051; it shares neither engine binaries nor state and is enabled independently.

## Capabilities and Constraints

- Auto mode: connect with last-successful settings or sensible defaults.
- Advanced profile: protocol (MASQUE, WireGuard, WARP-in-WARP/gool), scan mode (Turbo→Ironclad), IP version, MASQUE transport (HTTP/3 vs HTTP/2), obfuscation profiles, quick reconnect, tunnel DNS, routing block/direct rules, Zero Trust enrolment — each option explained on hover.
- Live progress (elapsed time, real percentage once Aether reports a scan budget), automatic reconnect with visible attempt counter, egress location pill + one-click leak check, connection history, live log window, IP Changer (Tor, rotate IP, auto-rotate).
- Settings: capture mode (system proxy / TUN — gated off until fully wired), system niceties, appearance (theme + accent per profile), import/export, in-app update checks.
- GUI **0.17.1** and engine **2.0.0** are separate versions. `src-tauri/aether-release.json` pins the engine repository, version, platform assets and SHA-256 checksums for fetch helpers, CI and runtime repair; engine installation does not follow upstream `latest`. All tunnel/protocol logic remains upstream at CluvexStudio/Aether.
- The Python fetch helper (Python 3.9+, no additional packages), with PowerShell and Bash wrappers, validates checksums, archive members and executable architectures before staging `aether` plus `pt/lyrebird` (both `.exe` on Windows) under `src-tauri/binaries/engine/`. The PT companion is required; it is not the independent IP Changer Tor binary.
- Runtime repair installs the complete payload into `<app-data>/binaries/engine-2.0.0/`. A compatible versioned download takes precedence over stale bundled/legacy engines. Compatibility requires the pinned reported version and an executable PT companion. Repair requires Aether to be stopped, stages replacement and retains the previous directory as a sibling backup; legacy binaries and identity state are not deleted. About shows detected engine information, not a hardcoded core version.
- Windows Defender false-positive reduction is an explicit past concern (proxy notify, Program Files install, signing).
- AGPL-3.0 licensed; bilingual docs (README.md must be mirrored in README_fa.md).
- Persisted settings via `tauri-plugin-store`; window position persisted; `minimize_on_startup` only honored when `close_to_tray` is enabled.
- Startup reaps orphaned Aether processes / TUN adapters from prior crashes — keep intact.

## Brand Commitments

- Name: Aether-GUI (product name in UI, per README and repo identity).
- License: AGPL-3.0.
- Bilingual identity: English and Persian (`README_fa.md`).

## Evidence on Hand

- README.md / README_fa.md describe features, architecture and build instructions. The Aether 2.0.0 documentation update is grounded in the manifest, fetch helpers and engine resolver/repair implementation; it does not establish successful tests, verified platforms or actual network connectivity.
- docs/screenshot-idle.png (idle state screenshot).
- Feature claims in README are factual product claims, not fabricated testimonials or benchmarks. No testimonials, case studies, or press exist — future work must not fabricate them.

## Product Principles

- One click over configuration: the default surface is a single Connect button; everything else is progressively disclosed.
- Trust the mechanism, not the wording: connected is a real TCP probe to the SOCKS port, leaks are a real IP comparison — never decorative state.
- Resilience without noise: auto-retry, backoff, and reaping of orphaned processes are invisible until they're needed, then explicit.
- No reimplementation: the GUI orchestrates the upstream binary, never replaces it.
- Quiet in the background: compositor-only animated effects, animations frozen when unfocused, minimal idle cost.

## Accessibility & Inclusion

- Persian-speaking audience: bilingual product surface and docs; copy must stay translatable.
- No product-specific accessibility standard recorded; UI is a desktop webview (WebView2 on Windows).
