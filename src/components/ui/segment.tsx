import { motion } from "motion/react";
import { SPRING_FAST } from "@/lib/motion";

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
      className="absolute inset-0 rounded-[31px] bg-primary shadow-[0_2px_10px_-4px_rgba(234,88,12,0.45),0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.22)] ring-1 ring-primary/20"
    />
  );
}
