import { motion } from "motion/react";
import { SPRING_FAST } from "@/lib/motion";

/**
 * The traveling ember: a shared-layout indicator that glides to the active
 * segment instead of popping. One per segmented control group — `groupId`
 * must be unique per ToggleGroup instance (the ember never teleports).
 */
export function SegIndicator({
  active,
  groupId,
}: {
  active: boolean;
  groupId: string;
}) {
  if (!active) return null;
  return (
    <motion.span
      layoutId={groupId}
      initial={false}
      transition={SPRING_FAST}
      aria-hidden
      className="absolute inset-0 rounded-md bg-primary shadow-sm shadow-primary/20 ring-1 ring-inset ring-primary-foreground/80"
    />
  );
}
