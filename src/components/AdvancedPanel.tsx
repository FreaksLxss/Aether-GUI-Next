import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Info, Settings2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { ProtocolSelect } from "@/components/ProtocolSelect";
import { ScanModeToggle } from "@/components/ScanModeToggle";
import { IpVersionToggle } from "@/components/IpVersionToggle";
import { MasqueTransportToggle } from "@/components/MasqueTransportToggle";
import { NoizeProfileToggle } from "@/components/NoizeProfileToggle";
import { BindAddressField } from "@/components/BindAddressField";
import { LogSearch } from "@/components/LogSearch";
import { useConnectionStore } from "@/state/connectionStore";
import { cn } from "@/lib/utils";

function FieldRow({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger aria-label={`About ${label}`}>
              <Info size={12} />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Collapsed by default — this *is* the auto-mode default: press Connect,
 * done. Everything configurable (the options Aether's own interactive setup
 * exposes — see aether/prompts.rs and profiles.rs, nothing else) plus the
 * raw log stream live behind this one disclosure.
 *
 * Deliberately animation-light: opening used to stack a Motion layout
 * spring, a 300ms tw-animate slide, an instant column reflow, and three
 * Glass filter mounts — four systems fighting read as jank. Now it's one
 * fast CSS fade/slide and nothing else.
 */
export function AdvancedPanel({
  open,
  onToggle,
  highlightScanMode = false,
}: {
  open: boolean;
  onToggle: () => void;
  highlightScanMode?: boolean;
}) {
  const logs = useConnectionStore((s) => s.logs);
  const status = useConnectionStore((s) => s.status);
  const quickReconnect = useConnectionStore((s) => s.profile.quick_reconnect);
  const setQuickReconnect = useConnectionStore((s) => s.setQuickReconnect);
  // Launch flag — locked mid-session like the other profile controls.
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const scanModeRef = useRef<HTMLDivElement>(null);

  // Scroll to and highlight the scan mode section when requested
  useEffect(() => {
    if (highlightScanMode && open && scanModeRef.current) {
      scanModeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightScanMode, open]);

  const filteredLogs = logFilter
    ? logs.filter((l) =>
        l.line.toLowerCase().includes(logFilter.toLowerCase()),
      )
    : logs;

  useEffect(() => {
    if (autoScroll && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="w-full">
      <Collapsible open={open} onOpenChange={onToggle}>
        <div
          className={cn(
            "rounded-lg transition-colors duration-150",
            open
              ? "bg-surface-2 ring-1 ring-white/5"
              : "bg-surface-2 hover:bg-surface-3",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              open
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings2 size={14} />
            Advanced
            <ChevronDown
              size={14}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-150 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-100">
            <div className="flex flex-col gap-4 border-t border-white/5 px-3 pt-3 pb-3">
            {/* Protocol section */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                Protocol
              </span>
              <FieldRow
                label="Protocol"
                tooltip="MASQUE disguises traffic as normal HTTPS — best against strict censorship. WireGuard is lighter and faster. gool nests two WireGuard tunnels for extra security at a speed cost."
              >
                <ProtocolSelect />
              </FieldRow>
              <div
                ref={scanModeRef}
                className={cn(
                  "rounded-md transition-all duration-300",
                  highlightScanMode && "bg-primary/10 ring-1 ring-primary/30",
                )}
              >
                <FieldRow label="Scan Mode">
                  <ScanModeToggle />
                </FieldRow>
              </div>
              <FieldRow
                label="IP Version"
                tooltip="Which address families to search for working routes. IPv4 is the safest default on most networks."
              >
                <IpVersionToggle />
              </FieldRow>
              <FieldRow
                label="MASQUE Transport"
                tooltip="How the MASQUE tunnel carries traffic. HTTP/3 (QUIC) has the fastest handshake; HTTP/2 (TCP) looks like ordinary HTTPS and works where UDP is blocked or throttled. Only applies to the MASQUE protocol."
              >
                <MasqueTransportToggle />
              </FieldRow>
              <FieldRow
                label="Obfuscation"
                tooltip="Disguises the handshake so DPI can't fingerprint the protocol. Heavier profiles send more decoy traffic — try escalating if the default doesn't connect. Options change based on the selected protocol."
              >
                <NoizeProfileToggle />
              </FieldRow>
            </div>

            {/* Proxy section */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                Proxy
              </span>
              <FieldRow
                label="SOCKS5 Proxy"
                tooltip="The local address Aether's SOCKS5 proxy listens on. Change the port to avoid conflicts, or enable LAN to share the tunnel with other devices on your network."
              >
                <BindAddressField />
              </FieldRow>
            </div>

            {/* Behavior section */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                Behavior
              </span>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Quick reconnect
                <Tooltip>
                  <TooltipTrigger aria-label="About Quick reconnect">
                    <Info size={12} />
                  </TooltipTrigger>
                  <TooltipContent>
                    Remembers the last gateway that worked and re-tests it first on the next
                    connect, skipping the full scan when it still works. Turn off to always scan
                    fresh.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={quickReconnect}
                onCheckedChange={setQuickReconnect}
                disabled={locked}
                aria-label="Quick reconnect"
              />
            </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                Logs
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              <LogSearch value={logFilter} onChange={setLogFilter} />
              <div
                ref={viewportRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
                }}
                role="log"
                aria-label="Aether connection logs"
                className="max-h-64 overflow-y-auto rounded-md bg-black/20 p-2 font-mono text-xs text-muted-foreground ring-1 ring-white/10"
              >
                {filteredLogs.length === 0 ? (
                  logFilter ? (
                    <p className="text-status-idle">No matching lines.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                    </div>
                  )
                ) : (
                  (() => {
                    const baseTs = filteredLogs[0]?.timestamp ?? 0;
                    return filteredLogs.map((l, i) => {
                      const relMs = l.timestamp - baseTs;
                      const s = (relMs / 1000).toFixed(1);
                      return (
                        <p key={i}>
                          <span className="text-muted-foreground/50">+{s}s </span>
                          {l.line}
                        </p>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
