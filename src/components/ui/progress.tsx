import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { SPRING } from "@/lib/motion"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-white/10",
        className
      )}
      {...props}
    >
      <motion.div
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary"
        animate={{ x: `${-100 + (value || 0)}%` }}
        transition={SPRING}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
