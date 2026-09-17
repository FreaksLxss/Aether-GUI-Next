# Aether-GUI

[![Release](https://img.shields.io/github/v/release/MatinSenPai/Aether-GUI?sort=semver)](https://github.com/MatinSenPai/Aether-GUI/releases)
[![License: AGPL v3](https://img.shields.io/github/license/MatinSenPai/Aether-GUI)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)

**English** · [فارسی](README_fa.md)

A one-click desktop GUI for [**Aether**](https://github.com/CluvexStudio/Aether), a censorship-circumvention tunnel built for heavily restricted networks. Aether itself is a terminal tool: it discovers a working route out, establishes an encrypted tunnel, and exposes a local SOCKS5 proxy. Aether-GUI wraps that terminal tool in a small, animated desktop app so you don't have to touch a command line to use it — press Connect, and everything else (identity provisioning, route discovery, prompt answering) happens automatically in the background.

This project does not reimplement any of Aether's tunneling logic. It drives the real `aether` binary in a pseudo-terminal, answers its interactive setup prompts on your behalf, and watches its output to tell you what's happening. All the actual censorship-circumvention work — MASQUE/QUIC obfuscation, WireGuard, route probing — is [Aether's](https://github.com/CluvexStudio/Aether), not this repo's.

<p align="center">
  <img
    width="418"
    alt="Aether-GUI screenshot"
    src="https://github.com/user-attachments/assets/7e94275a-b94c-430e-ace4-2f8a4d788c5c"
  />
</p>

## Versions and engine repair

**Aether-GUI 0.17.0** is the desktop app version; **Aether 2.0.0** is the separately versioned engine it requires. [`src-tauri/aether-release.json`](src-tauri/aether-release.json) pins the upstream repository, version, asset names and SHA-256 checksums for development fetches, CI and in-app engine repair. Engine repair installs that approved release, not whatever upstream labels `latest`.

If the engine is missing, incompatible or missing its `pt/lyrebird` companion, stop Aether and use the app's engine install/repair action. It installs the complete, checksum-verified payload into `<app-data>/binaries/engine-2.0.0/`. The resolver prefers a compatible versioned download over bundled or legacy copies, so a stale engine cannot shadow a repaired installation. Replacement is staged; the previous directory is preserved as a sibling backup. Legacy binaries, identity files and the independent IP Changer Tor bundle are not deleted. About reports the detected engine version separately from the GUI version.

## Features

- **Auto mode** — the default screen is just a single button. No configuration is required; it connects using your last-successful settings (or sensible defaults on first run).
- **Advanced panel** — for when you want control, a collapsible panel exposes the real options Aether's setup supports:
  - **Protocol**: MASQUE (disguises traffic as normal HTTPS), WireGuard (lighter, faster), or WARP-in-WARP/gool (two nested WireGuard tunnels for extra security at a speed cost)
  - **Scan Mode**: Turbo, Balanced, Thorough, Stealth, or Ironclad — trading route-discovery speed against how much probe traffic it generates; Ironclad opens a real tunnel through each candidate and sends a real HTTP request before trusting it (slower; not a guarantee of connectivity on your network)
  - **IP Version**: IPv4, IPv6, or both
  - **MASQUE Transport**: HTTP/3 (QUIC — fastest handshake) or HTTP/2 (TCP — looks like ordinary HTTPS, works where UDP is blocked or throttled)
  - **Obfuscation**: how heavily the handshake is disguised from DPI — profiles adapt to the selected protocol; escalate if the default can't get through
  - **Quick reconnect**: remember the last working gateway and re-test it first, skipping the full scan when it still works
  - **Tunnel DNS**: choose the DNS resolvers used inside the tunnel (default 1.1.1.1, 1.0.0.1)
  - **Upstream proxy**: chain Aether behind another proxy or VPN app already running on the machine (`--upstream`) — SOCKS5 upstreams carry every transport, HTTP ones carry MASQUE over HTTP/2 only
  - **Routing**: block-list and direct-list rules (domains, networks, ports) to refuse destinations outright or send them straight out, bypassing the tunnel
  - **Zero Trust**: enrol into a Cloudflare Zero Trust organization by team name, with email, service-token, or JWT sign-in, plus optional Gateway routing
  
  Each option has an explanation on hover.
- **Live progress** — while Aether searches for a working route, the GUI shows real elapsed time and, once Aether reports its own scan budget, an actual percentage and progress bar — not just a spinner.
- **Automatic reconnect** — if the tunnel drops unexpectedly mid-session (observed occasionally with WARP-in-WARP, but handled the same way for every protocol), the GUI retries automatically with backoff, shown as a visible "Reconnecting… (attempt N of 3)" rather than silently dying or dumping you back to a bare error. A user-requested disconnect is never retried.
- **Egress location & leak check** — while connected, a small pill shows the public IP, country, and city your traffic is actually exiting through (the tunnel's egress), and a one-click refresh fettches it again. Every connect, the GUI also compares that exit IP against your real, direct IP — if they match, it raises a visible "Leak detected" warning, so you immediately know the tunnel isn't actually masking your traffic.
- **Connection history** — every session is recorded (protocol, scan mode, duration, time, success/failure) in a collapsible panel with a clear-history action, so you can see what's been working.
- **Live log window** — Aether's full log stream can be popped open in a separate, resizable window that stays live even when you're not watching the main screen — useful for digging into what a connection attempt actually did.
- **Native engine Tor (Aether 2.0.0)** — built into the engine via arti, with **Tor** (WARP → Tor), **Tor-Reverse** (Tor → WARP) and **Tor-Only** (no WARP) modes, bridge policy and pluggable-transport settings. Tor mode has a separate SOCKS listener (default `127.0.0.1:1820`) whose readiness is reported separately from the primary listener (`127.0.0.1:1819` by default). Tor-Only serves on the primary listener; Tor-Reverse uses Tor internally and requires MASQUE over HTTP/2, not WireGuard/gool. The engine's `pt/lyrebird` is a transport helper, not the IP Changer's Tor binary. Enabling one Tor subsystem does not start the other.
- **IP Changer** — an optional, self-contained Tor subprocess that gives you a fresh public egress IP on demand or on a schedule. Start Tor from the panel to see your current exit IP (country, city, ISP) resolve through the tunnel, hit **Rotate IP** to request a new identity (NEWNYM), or enable **Auto-rotate** to do it automatically every 1–60 minutes. Runs entirely independently of Aether on its own SOCKS5/control ports, with a live log stream in the panel.

## Settings

Beyond the connect screen and the advanced profile, a Settings panel houses the app-level wiring:

- **Capture mode** — route captured traffic through your **system proxy** (only apps that respect it), or, on Windows, through a **TUN** virtual adapter that catches everything (currently gated off in the UI until fully wired). DNS resolution mode follows.
- **System niceties** — keep the window always on top, launch the app at sign-in, minimize to tray on startup, and close to tray instead of quitting.
- **Appearance** — light/dark theme plus your own accent color, tailored per profile.
- **Import/export** — save your whole setup to a file and restore it on another machine, and check for new releases from inside the app.

## Installing

Grab the latest installer from the [Releases page](https://github.com/MatinSenPai/Aether-GUI/releases):

- `Aether-GUI_x.y.z_x64-setup.exe` — standard installer (recommended)
- `Aether-GUI_x.y.z_x64_en-US.msi` — MSI package, for scripted or enterprise installs

Windows x64 only for now — see [Building from source](#building-from-source) for other platforms.

## Building from source

1. **Prerequisites**
   - [Node.js](https://nodejs.org/) and npm
   - [Rust](https://rustup.rs/) (stable toolchain)
   - Tauri's platform prerequisites — see the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/) (on Windows this is the MSVC C++ Build Tools + WebView2 Runtime, both usually already present; macOS needs Xcode Command Line Tools; Linux needs `webkit2gtk` and friends)

2. **Install frontend dependencies**

   ```sh
   npm install
   ```

3. **Fetch the Aether binary**

   Aether-GUI bundles the prebuilt engine from [CluvexStudio/Aether releases](https://github.com/CluvexStudio/Aether/releases). Use the shared Python helper (Python 3.9+; no extra Python packages), from the repository root:

   ```sh
   python src-tauri/binaries/fetch-aether.py
   ```

   On Windows, the PowerShell wrapper invokes that same helper:

   ```powershell
   ./src-tauri/binaries/fetch-aether.ps1
   ```

   On Linux/macOS, use `python3 src-tauri/binaries/fetch-aether.py` or `bash src-tauri/binaries/fetch-aether.sh`. The manifest selects Windows x86_64, Linux x86_64/aarch64 (musl), or macOS x86_64/aarch64 assets. `AETHER_ASSET` may select another pinned asset for the current OS, such as the macOS x86_64 cross-build asset; it is not an arbitrary release override.

   The helper checks the archive against the manifest's SHA-256, rejects unsafe/unexpected archive members, validates both executable architectures, and stages the complete payload in `src-tauri/binaries/engine/`. Keep `aether.exe` beside `pt/lyrebird.exe` on Windows, or `aether` beside `pt/lyrebird` on Unix — copying only the main executable is incomplete. On the native architecture the helper also checks `aether --version`; that is not a live connection test. Previous engine directories are retained as sibling backups; root-level legacy binaries, identity/state files, Wintun and `binaries/tor/` are left alone. Do not read or commit provisioned identity TOMLs.

4. **Provide the separate Tor expert bundle (for the IP Changer only)**

   The IP Changer panel drives a bundled [Tor](https://www.torproject.org/) expert bundle rather than Tor Browser. Download the `tor-expert-bundle-*-<version>.zip` for your platform from the [Tor project downloads](https://www.torproject.org/dist/), and extract the `tor.exe` binary into `src-tauri/binaries/tor/` (e.g. `binaries/tor/windows/x86_64/tor.exe` on Windows, `binaries/tor/linux/x86_64/tor` on Linux, `binaries/tor/macos/aarch64/tor` on Apple Silicon). The panel simply shows "Tor binary not found" until a matching binary is present.

5. **Run in development mode**

   ```sh
   npm run tauri dev
   ```

6. **Build a release installer**

   ```sh
   npm run tauri build
   ```

   Bundle configuration targets NSIS `.exe` and `.msi` on Windows, `.dmg`/`.app` on macOS, and `.deb`/`.AppImage`/`.rpm` on Linux. Outputs normally land under `src-tauri/target/release/bundle/` (or a target-specific subdirectory when `--target` is used). Each platform must be built on its own OS or corresponding CI runner. The manifest and platform configurations describe intended support; this documentation does not claim successful builds, platform verification or live network connectivity.

## How it works

- **Frontend**: React 19 + Tailwind v4, state managed with Zustand, animated with [Motion](https://motion.dev/) — all talking to the Rust backend over Tauri's IPC. Deliberately lightweight: the ambient background is two compositor-only CSS gradient orbs, and every looping animation freezes while the window is unfocused, so the app costs next to nothing sitting in the background.
- **Backend**: Rust, using [`portable-pty`](https://docs.rs/portable-pty) to spawn the real `aether` binary (pinned to v2.0.0) in a genuine pseudo-terminal. Your chosen profile — protocol, scan mode, IP version, MASQUE transport (HTTP/3 or HTTP/2), obfuscation profile, quick reconnect, upstream proxy, WARP-in-WARP endpoints, in-tunnel DNS, routing rules, Zero Trust enrolment — is passed as CLI flags/environment up front, so Aether's interactive prompts normally never appear; a background thread still watches the output and can answer any prompt that does, while forwarding every line live to the GUI's log panel. The **IP Changer** is a fully separate subsystem: `ip_changer.rs` spawns a bundled Tor on its own SOCKS5 (9050) + control (9051) ports, talks [Tor's control protocol](https://spec.torproject.org/control-spec/) over loopback with cookie auth (`SIGNAL NEWNYM` / `SIGNAL SHUTDOWN`), and reuses the leak-check's `net.rs` endpoints through a `socks5h` proxy to display the live exit IP.
- **Ground truth for "connected"**: the GUI probes the profile's primary local SOCKS5 listener (default `127.0.0.1:1819`), rather than relying on fragile log wording. This establishes local listener readiness, not proof of end-to-end internet connectivity or leak protection. Native Tor's secondary listener has its own readiness state; IP Changer is independent of both.
- **State machine**: `Idle → Launching → Connecting → Connected`, with `Reconnecting` and `Error` as the two ways a connection attempt can end up needing your attention — `Reconnecting` retries automatically (with backoff, capped at 3 attempts), `Error` is the final word once retries are exhausted or something isn't retriable (e.g. the binary itself is missing).

## About Aether

[Aether](https://github.com/CluvexStudio/Aether) is the actual censorship-circumvention engine this app wraps — a standalone terminal tool that discovers reachable routes and establishes the tunnel, independent of any GUI. If you'd rather use it directly from a terminal, or want to understand exactly what it's doing under the hood, that's the repo to read. Aether-GUI exists purely to make that tool one click away for people who don't want to live in a terminal.

## License

[GNU Affero General Public License v3.0](LICENSE).
