---
name: Aether-GUI
description: Clear Signal — a calm, solid, high-readability control panel for the Aether censorship-circumvention tunnel
colors:
  ember: "#f2711c"
  ember-deep: "#ea580c"
  ember-ink: "#0d0d0f"
  canvas: "#0b0b0c"
  paper: "#fafafa"
  surface-1: "#101012"
  surface-2: "#151517"
  surface-3: "#1b1b1e"
  surface-4: "#212124"
  ash: "#a1a1aa"
  line: "rgba(255, 255, 255, 0.09)"
  connected: "#2dd4bf"
  error: "#ef4444"
  idle: "#6b7280"
  light-canvas: "#f4f4f5"
  light-card: "#ffffff"
typography:
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  window: "18px"
  window-base: "30px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "12px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ember-deep}"
    textColor: "{colors.ember-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "32px"
  input:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    height: "32px"
  hero-disc:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ember}"
    rounded: "{rounded.pill}"
    size: "160px"
  panel:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    border: "1px solid {colors.line}"
---

# Design System: Aether-GUI — Clear Signal

## Overview

**Creative North Star: "Clear Signal"**

Aether-GUI is a solid, calm control panel for an anxious user in a hostile network. Where the old world hid behind frosted glass, this one is honest material: opaque planes on one ink-dark canvas, separated by hairline borders and single-step tonal raises. Nothing blurs; nothing floats; everything reads instantly at arm's length. Exactly one element carries the accent color per screen state — the connect disc when idle, the status when live — so attention always has exactly one place to go.

The voice stays instrument-precise: real elapsed time, real scan percentage, real leak checks. But the type got humane. Body text is 14px, secondary lines never dim below 85% opacity, and machine truths stay in JetBrains Mono with tabular numerals. The interface is designed for someone glancing over their shoulder.

Structure beats decoration: five flat tabs (Tunnel · Advanced · IP Changer · History · Settings), one full-height surface each. The Tunnel tab holds the disc, the mode row, and nothing else that competes.

**Key Characteristics:**

- Solid planes: `surface-1..4` tonal ramp + 1px hairline borders; zero `backdrop-filter` in the entire app.
- One accent slot: ember amber by default, user-changeable; active states are hairline rings + dots, never filled color chips.
- Status trio unchanged: connecting amber, connected teal, error red, idle gray.
- Humane ramp: 11px micro-labels, 12px mono values, 14px body, 16px emphasis numerals; opacity floor 85%.
- Compositor-only motion: sonar rings while connecting, one drifting background wash, all paused when unfocused.
- Light mode is an equal citizen — same structure, flipped neutrals, same contrast targets.

## Colors

Ink-dark canvas with one warm accent. Dark is default; light flips neutrals only.

### Primary

- **Ember** (`#f2711c`) / **Deep Ember** (`#ea580c`): the single accent. Focus rings, active dots, primary button, connecting state. Rare by rule — under 10% of any screen.
- **Ember Ink** (`#0d0d0f`): label color on filled accent surfaces.

### Neutral

- **Canvas** (`#0b0b0c`): window background.
- **Surfaces 1–4** (`#101012` → `#212124`): elevation is tonal only — panels sit on surface-2, inputs on surface-3, raised controls on surface-4.
- **Paper** (`#fafafa`) / **Ash** (`#a1a1aa`): primary / secondary text. Secondary text opacity floor: 85% in dark, 100% in light.
- **Line** (`rgba(255,255,255,0.09)`): every border and divider in dark; `rgba(0,0,0,0.10)` in light.

### Status

- **Tunnel Teal** (`#2dd4bf`, light `#0d9488`): connected.
- **Fault Red** (`#ef4444`, light `#dc2626`): error, leak warning.
- **Idle Gray** (`#6b7280`): at rest.

### Named Rules

**The One Accent Rule.** The accent appears as a dot, ring, icon, or one filled 32px control. Lists of choices mark selection with a hairline ring + accent dot, never a filled pill.

**The Status Trio Rule.** Connecting/connected/error/idle is always amber/teal/red/gray regardless of the chosen accent hue.

## Typography

**Font:** Geist Variable everywhere; JetBrains Mono Variable for machine truth.

### Hierarchy

- **Body** (400, 14px/1.5): controls, rows, explanations.
- **Section label** (500, 11px, +0.08em uppercase): group headers inside tabs.
- **Mono value** (400, 12–13px, tabular-nums): addresses, timers, counts, IPs.
- **Emphasis numeral** (500, 15–16px, mono): egress IP, big counters.

### Named Rules

**The Readability Floor.** No text below 11px; no secondary text below 85% opacity in dark mode. If it doesn't fit at 11px, cut words, not size.

**Tabular Telemetry.** Every number that ticks uses JetBrains Mono with `tabular-nums`.

## Layout

A 420×640 desktop window, rounded 18px top / 30px bottom, framed by an inset ring. Inside: a compact TitleBar (proxy indicator, window controls) above a persistent **tab bar** — Tunnel, Advanced, IP Changer, History, Settings — each tab a full-height scrollable surface. One surface visible at a time; nothing stacks in drawers.

**Tunnel tab anatomy:** connect disc (160px circle, fixed-height zone) → status sentence → location chip (only when meaningful) → connected actions → Mode row. That's all; everything else lives in its own tab.

**The Flat-By-Default Rule.** Hover lifts 1px; press scales 0.98; borders do the separating. The only shadow allowed is a faint cast in light theme for white-on-white separation.

## Components

### Connect Disc (signature)
- 160px circle on surface-2 with a hairline ring; icon centered (48px).
- Idle: gray power glyph. Connecting: amber spinner + two CSS sonar rings expanding past the rim (`.anim-sonar`, staggered 0/1.2s). Connected: teal check + accent ring. Error: red triangle, 0.4s shake, click retries.
- Press scale 0.95; focus ring 2px accent offset from background.

### Tab Bar
- Full-width segmented control directly under the TitleBar: icon + 11px label, 36px tall.
- Active tab: foreground text + 2px accent underline; inactive: ash text. Keyboard arrow navigation; `aria-current="page"` on the active tab.

### Buttons
- Heights 28/32/36px, radius 10px, weight 500.
- Primary: filled deep ember, ink text, hover = 90% opacity. Secondary: surface fill + hairline border. Ghost: transparent.
- Focus: 3px accent halo. Press: translateY(1px) + scale(0.97).

### Inputs / Fields
- Surface-3 fill, hairline stroke, 8px radius, mono for addresses/values.
- Focus replaces stroke with the accent halo. Labels sit ABOVE inputs; helper/error text BELOW at 11px.

### Panels & Cards
- Surface-2 fill, 1px Line border, 14px radius, 12px padding.
- Section headers inside panels: 11px uppercase label + hairline divider.

### Chips
- Translucent-neutral fill (white 8% dark / black 6% light), mono 11px counts. Never colored; selection borrows the accent as dot/ring only.

## Do's and Don'ts

### Do:
- Do separate with borders and tonal steps; reach for shadows only in light theme.
- Do announce every state change with color + icon + text together.
- Do keep machine numbers in mono with tabular figures.
- Do honor `prefers-reduced-motion`: decorative loops stop; connection feedback (spinner, sonar) may run.
- Do collapse Latin letter-spacing under `:lang(fa)` (global CSS guard exists).

### Don't:
- Don't reintroduce `backdrop-filter`/glass anywhere.
- Don't fill selection states with the accent; ring + dot only.
- Don't set type below 11px or dim dark-mode text below 85%.
- Don't introduce a second accent hue for status.
- Don't put more than one screen's worth of controls on the Tunnel tab.
