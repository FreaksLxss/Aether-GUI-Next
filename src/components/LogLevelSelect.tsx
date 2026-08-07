import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnectionStore } from "@/state/connectionStore";
import type { LogLevel } from "@/types/connection";

const OPTIONS: { value: LogLevel | "auto"; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "Default — info level" },
  { value: "error", label: "Error", desc: "Only errors — completely silent" },
  { value: "warn", label: "Warn", desc: "Warnings and errors" },
  { value: "info", label: "Info", desc: "Quiet, only notable events" },
  { value: "debug", label: "Debug", desc: "Tunnel internals for troubleshooting" },
  { value: "trace", label: "Trace", desc: "Full per-packet detail" },
];

export function LogLevelSelect({ id }: { id?: string }) {
  const status = useConnectionStore((s) => s.status);
  const logLevel = useConnectionStore((s) => s.profile.log_level);
  const setLogLevel = useConnectionStore((s) => s.setLogLevel);

  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <Select
      value={logLevel ?? "auto"}
      onValueChange={(v) => setLogLevel(v === "auto" ? null : (v as LogLevel))}
      disabled={locked}
    >
      <SelectTrigger
        id={id}
        className="w-full justify-start gap-2 rounded-lg bg-surface-3 px-3 text-xs text-foreground ring-1 ring-inset ring-white/5 transition-all duration-150 hover:bg-surface-4 hover:ring-white/10 focus-visible:ring-primary disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto"
        aria-label="Log Level"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-lg bg-surface-2 p-1 ring-1 ring-white/10">
        {OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="cursor-pointer rounded-md px-2.5 py-2 text-xs outline-none transition-colors focus:bg-primary/15 focus:text-foreground data-[highlighted]:bg-primary/15"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{opt.label}</span>
              <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
