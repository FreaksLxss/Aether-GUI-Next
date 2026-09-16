import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Shared row label + tooltip used in Advanced and other panels
export function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  tooltip?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground"
        >
          {label}
        </label>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// Floating card section: pill heading + solid card, used in Advanced/Settings/IP Changer
export function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 min-w-0 w-full", className)}>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-0 bg-card px-1.5 py-1 shadow-[0_6px_20px_-10px_rgba(0,0,0,0.7),0_1px_4px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-black/10 light:bg-white light:shadow-none">
        <span className="flex size-[18px] items-center justify-center rounded-full bg-white/[0.09] ring-1 ring-white/10 light:bg-black/5 light:ring-black/5">
          <Icon size={10} className="text-muted-foreground" />
        </span>
        <span className="pr-0.5 text-[11px] font-semibold tracking-[0.14em] text-foreground/80 uppercase">
          {title}
        </span>
      </span>
      <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border-0 bg-card p-3.5 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.08] light:shadow-none">
        {children}
      </div>
    </div>
  );
}

export function SwitchRow({
  label,
  tooltip,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.05]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
        {label}
        <Tooltip>
          <TooltipTrigger aria-label={`About ${label}`} className="rounded-full p-0.5 text-muted-foreground/60 hover:bg-white/5 hover:text-muted-foreground">
            <Info size={12} />
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px] leading-relaxed">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
