import { type ReactNode, type ComponentType } from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SPRING_FAST } from "@/lib/motion";

interface GlassAccordionProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  /** Render a small leading badge next to the label (e.g. the preset count). */
  badge?: ReactNode;
  /** Row content shown under the trigger when open. */
  children: ReactNode;
}

/**
 * Frosted-glass accordion section used by every collapsible panel
 * (Advanced / Presets / History / Settings). Encapsulates the Apple-style
 * material (translucent blur, top sheen, soft shadow) and the spring-driven
 * chevron + content reveal so all panels stay in sync.
 */
export function GlassAccordion({
  icon: Icon,
  label,
  open,
  onToggle,
  count,
  badge,
  children,
}: GlassAccordionProps) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <div
        className={cn(
          "rounded-[35px] transition-colors duration-200",
          open
            ? "bg-surface-2 ring-1 ring-border"
            : "bg-surface-2/80 ring-1 ring-border hover:bg-surface-2 hover:ring-foreground/10",
        )}
      >
        <CollapsibleTrigger
          className={cn(
            "group flex w-full cursor-pointer items-center gap-2 rounded-[35px] px-3 py-2.5 text-[11px] font-medium tracking-[0.08em] uppercase outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
            open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon
            size={13}
            className={cn(
              "transition-colors duration-150",
              open ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span className="tracking-[0.08em]">{label}</span>
          {count != null && count > 0 && (
            <motion.span
              key={count}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.4 }}
              className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] leading-none font-normal tracking-normal normal-case text-muted-foreground tabular-nums ring-1 ring-border"
            >
              {count}
            </motion.span>
          )}
          {badge}
          <motion.span
            className="ml-auto flex items-center"
            animate={{ rotate: open ? 180 : 0 }}
            transition={SPRING_FAST}
          >
            <ChevronDown size={13} className="text-muted-foreground/60" />
          </motion.span>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-150">
          <Separator className="bg-border" />
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_FAST}
            className="px-3 py-3"
          >
            {children}
          </motion.div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
