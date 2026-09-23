import type { Transition, Variants } from "motion/react";


export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.4 };

export const SPRING_FAST: Transition = { type: "spring", bounce: 0, duration: 0.25 };

export const SPRING_SHEET: Transition = { type: "spring", bounce: 0.15, duration: 0.5 };

export const SPRING_HERO: Transition = { type: "spring", bounce: 0.3, duration: 0.6 };

export const FADE_UP: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: "easeIn" } },
};

export const SCREEN_FADE: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } },
};
