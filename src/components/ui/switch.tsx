import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { SPRING_FAST } from "@/lib/motion";

function Switch({ className, checked, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={checked}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-white/10 ring-1 ring-inset ring-white/10 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:ring-primary/50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" asChild>
        <motion.span
          className="block size-5 rounded-full bg-white shadow-sm shadow-black/20"
          animate={{ x: checked ? 22 : 2 }}
          transition={SPRING_FAST}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };