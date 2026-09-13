---
name: squircle
description: Apply iOS/macOS-style continuous curvature (squircle / superellipse) rounded corners across the entire app. Use when the user wants squircle, iOS-like radius, superellipse corners, "more round" continuous curvature, or to fix/restore squircle rounding on any element.
version: 1.0.0
user-invocable: true
argument-hint: "[intensity · target]"
---

# Squircle — iOS Continuous Curvature Skill

Apply Apple's continuous curvature (squircle / superellipse) to every rounded element so corners feel like iOS/macOS, not plain circular arcs.

## Core Concept

- **Squircle** = `corner-shape: squircle` (Chromium reports it as `superellipse(2)`). Deforms a circular radius toward the corner midpoint — fabric-like, not a plain arc.
- **Global on `*` is the cleanest approach.** One declaration covers every `rounded-*` in the app. No per-element `useSquircleClip` or JS needed.
- **`rounded-full` + squircle conflict:** On a square element, `rounded-full` (9999px) with `corner-shape: squircle` becomes a superellipse, NOT a true circle. Override with `corner-shape: round` on circular elements.
- Falls back silently on unsupported browsers (plain radius).

## 1 — Inspect Current Tokens

Before editing, read these sources:

- `src/index.css` — `@theme inline` radius scale (`--radius` base), `:root` / `:root.light` window radius, `@layer base` global corner-shape
- `src/components/ui/*.tsx` — shadcn primitives (popover, select, dialog, etc.) for `rounded-lg` / `rounded-md` stragglers
- `src/components/*.tsx` — app panels, toggles, TitleBar, ConnectButton for hardcoded `rounded-*`

## 2 — Global CSS (src/index.css)

### Base radius scale

```css
@theme inline {
  --radius: 1.375rem; /* 22px base — drives sm/md/lg/xl/2xl/3xl/4xl */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
}
```

### Window shell radius

```css
:root {
  --window-radius: 50px;
  --window-radius-tl: var(--window-radius);
  --window-radius-tr: var(--window-radius);
  --window-radius-bl: 50px;
  --window-radius-br: 50px;
}
:root.light { --window-radius: 50px; }
.window-shell {
  border-radius: var(--window-radius-tl) var(--window-radius-tr)
    var(--window-radius-br) var(--window-radius-bl);
}
```

> Intensity presets: `subtle = 22px` · `balanced = 35px` · `plush = 50px` (current). Ask or infer from `argument-hint`.

### Global squircle + circle override

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
    corner-shape: squircle;
  }
  /* Force a true circle — overrides global squircle */
  .corner-round {
    corner-shape: round;
  }
}
```

## 3 — Radius Scale for Components

| Tier | Value | Use |
|------|-------|-----|
| **Window shell** | `50px` (`--window-radius`) | Outer app frame |
| **Large cards / panels** | `35px` (`rounded-[35px]`) | Tuning panel, protocol panel, network card, toggle containers |
| **Floating menus / popovers** | `22px` (`rounded-[22px]`) | Popover, SelectContent, command palette |
| **Small controls** | `rounded-[22px]` → `rounded-[35px]` if user wants "more round" | ToggleGroupItem, segmented controls |
| **True circles** | `rounded-full` + `corner-round` | Power button, TitleBar window controls, Switch thumb |

Rule: big surfaces get the biggest radius; never apply `35px+` to inputs/buttons — they become pill-shaped. Keep the scale proportional.

## 4 — True Circles (corner-round)

Any element that must stay a perfect circle needs the override:

```tsx
// Power button disc + inner layers
<motion.button className="corner-round ... rounded-full" ...>
  <span className="corner-round absolute inset-0 rounded-full ..." />
  <span className="corner-round absolute inset-0 rounded-full ..." />
</motion.button>

// TitleBar window controls already use rounded-full — add corner-round if they look squarish
<Button className="corner-round size-8 rounded-full" />
```

Also applies to: `Switch` (`rounded-full`), avatar circles, status dots.

## 5 — Component Audit Checklist

Grep for `rounded-` and fix stragglers:

- [ ] `src/components/ui/popover.tsx` — `PopoverContent` `rounded-lg` → `rounded-[22px]`
- [ ] `src/components/ui/select.tsx` — `SelectTrigger` + `SelectContent` `rounded-lg` → `rounded-[22px]`
- [ ] `src/components/ui/dialog.tsx` — `DialogContent` / overlay radius
- [ ] `src/components/TitleBar.tsx` — button bar `rounded-[50px]` + buttons `size-8 rounded-full corner-round`
- [ ] `src/components/*Toggle.tsx` — container `rounded-[35px]`, items `rounded-[35px]`
- [ ] `src/components/ConnectButton.tsx` — all `rounded-full` spans → add `corner-round`
- [ ] `src/components/TrafficStats.tsx` (Network card) — reference at `35px`
- [ ] Any remaining `rounded-lg` / `rounded-md` in app code → bump to `rounded-[22px]` minimum

Quick grep:

```bash
grep -rn "rounded-" src/components --include="*.tsx" | grep -v "rounded-full"
```

## 6 — Apply & Verify

1. Edit `src/index.css` first (global + window + override).
2. Sweep components in one batch (large panels → menus → small controls → circles).
3. Typecheck: `npx tsc --noEmit`
4. Build: `cargo build --release` (from `src-tauri/`) or `npx tauri build`
5. Visual check: every card/menu should show iOS-like continuous curvature; the power button and TitleBar dots must be true circles (not squircles).

## Intensity Argument

- `/squircle` or `/squircle plush` — current `50px` window / `35px` panels / `22px` menus
- `/squircle balanced` — `35px` / `22px` / `16px`
- `/squircle subtle` — `22px` / `16px` / `12px`
- `/squircle <target>` — e.g. `/squircle popover` to fix only one surface

When intensity is omitted, keep the current values and just ensure squircle is applied consistently (fix stragglers, add `corner-round` where missing).
