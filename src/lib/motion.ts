import type { Transition, Variants } from "motion/react";

/**
 * Shared motion vocabulary for the whole app (see AGENTS.md / apple-design).
 *
 * Two physical parameters, Apple-style:
 *  - `response`: how fast a spring reaches its target, in seconds.
 *  - `bounce`  : overshoot. 0 = critically damped (no bounce).
 *
 * Rules of thumb used here:
 *  - Default UI settles critically damped (bounce 0) — graceful, no wobble.
 *  - Only momentum-driven interactions (flicks, throws, big sheet reveals)
 *    get a little bounce.
 *  - Interruptible by construction: springs re-target from the current
 *    on-screen value, so everything can be grabbed and reversed mid-flight.
 */

/** Default spring: critically damped, snappy. Use for almost everything. */
export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/** Faster critically-damped settle for micro-interactions (icons, chevrons). */
export const SPRING_FAST: Transition = { type: "spring", bounce: 0, duration: 0.25 };

/** Sheet / drawer reveal: a touch of bounce to sell the physical motion. */
export const SPRING_SHEET: Transition = { type: "spring", bounce: 0.15, duration: 0.5 };

/** The connection ring / MagicRings bloom. Deliberately lively. */
export const SPRING_HERO: Transition = { type: "spring", bounce: 0.3, duration: 0.6 };

/** Standard fade-and-lift for content entering a surface. */
export const FADE_UP: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: "easeIn" } },
};

/** Screen-level cross-fade between main and error states. */
export const SCREEN_FADE: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } },
};
