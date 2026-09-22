## Aether-GUI v0.17.0 — Aether 2.0.0 integration

This release upgrades the bundled engine from Aether 1.9.0 to **2.0.0** and aligns engine installation, profiles and startup diagnostics with the new release. The GUI and engine have separate version numbers.

### Engine installation and repair
- Bundle the engine together with its required `pt/lyrebird` transport companion.
- Pin development downloads, CI builds and in-app repair to the same release manifest and SHA-256 checksums. Validate archives and stage replacements before activation.
- Prefer a compatible versioned app-data installation over stale bundled or legacy copies. Reject unsupported engines before attempting a connection, fixing the old engine's rejection of `--mim`.
- Show the detected engine version in About and provide an install/repair action for missing or incompatible engines.
- Restrict packaged resources so identity TOMLs, logs and download helpers are not included in installers.

### Profiles and native Tor
- Correct Tor mode serialization, accepting legacy saved spellings while using canonical `tor-reverse` and `tor-only` values.
- Correct bridge arguments: automatic fallback, forced automatic bridges, repeated manual bridge lines and disabled bridges. Preserve multiline input while editing.
- Flag legacy bridge-file settings for migration instead of passing an unsupported argument. **If your profile contains a bridge-file path, replace it with bridge lines before connecting.**
- Validate active profiles before launch, including protocol conflicts, listener collisions, numeric settings and MiM endpoint constraints. Apply presets as complete validated profiles and normalize older imports with defaults.
- Clarify MiM's default HTTP/3 transport, show Tor-Reverse's effective HTTP/2 transport and disable irrelevant QUIC controls without discarding saved choices.
- Report native chain Tor's secondary SOCKS listener readiness separately from the primary listener, with a copyable proxy URL and mode-aware startup timeouts.

### Diagnostics and maintenance
- Preserve trailing engine output at EOF, including errors without a final newline.
- Stop retrying recognized permanent startup/configuration failures and show actionable fixed messages rather than misleading scan-mode advice.
- Resolve frontend lint and Rust Clippy issues and update the English and Persian setup documentation.

### Important distinctions
Native engine Tor remains separate from **IP Changer**, which retains its own Tor process, control socket and rotation controls. Local SOCKS listener readiness is not proof of end-to-end connectivity, leak protection or a guaranteed new exit IP.

### Build and verification
- Desktop workflow targets: Windows x64, Linux x64, macOS Apple Silicon and macOS Intel. No Android build is included.
- Local checks before release preparation: 85 Rust tests passed, strict Clippy passed, frontend production build passed, and ESLint reported no errors with one existing TanStack Virtual warning. Engine packaging tests: 10 passed.
- Windows installer packaging was verified locally before the version bump. **The v0.17.0 CI builds must succeed before publishing this draft.** Only use the assets attached by that workflow for this release.
- Real WARP/Tor connectivity and system-proxy changes were not exercised as part of this verification.

**Full changelog:** https://github.com/FreaksLxss/Aether-GUI-Next/compare/v0.16.1...v0.17.0
