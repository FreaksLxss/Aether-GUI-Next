import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, Info, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { LogLevelSelect } from "@/components/LogLevelSelect";
import { PerfSelect } from "@/components/PerfSelect";
import { LogSearch } from "@/components/LogSearch";
import { useConnectionStore } from "@/state/connectionStore";
import { openLogWindow } from "@/lib/log-window";
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
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const scanModeRef = useRef<HTMLDivElement>(null);

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
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs, autoScroll]);

  return (
    <div className="w-full">
      <Collapsible open={open} onOpenChange={onToggle}>
        <div
          className={cn(
            "rounded-lg transition-all duration-200 ease-out",
            open
              ? "bg-surface-2 ring-1 ring-white/5 shadow-sm shadow-black/10"
              : "bg-surface-2 hover:bg-surface-3 hover:shadow-sm hover:shadow-black/5",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              open
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings2 size={13} />
            Advanced
            <ChevronDown
              size={13}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-150">
            <Separator className="bg-white/5" />
            <div className="flex flex-col gap-3 px-3 pt-2.5 pb-3">
              {/* Protocol section */}
              <div className="flex flex-col gap-2.5">
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
              <div className="flex flex-col gap-2.5">
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
              <div className="flex flex-col gap-2.5">
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
                <FieldRow
                  label="Log Level"
                  tooltip="Controls how much Aether prints to the log panel. Info is quiet; Debug adds tunnel internals useful for troubleshooting; Trace adds full per-packet detail."
                >
                  <LogLevelSelect />
                </FieldRow>
                <FieldRow
                  label="Performance"
                  tooltip="Override Aether's automatic resource scaling. Leave on Auto to let it detect your CPU and RAM at startup. Use Low for routers or Pi, High for maximum scan speed."
                >
                  <PerfSelect />
                </FieldRow>
              </div>

              {/* Logs section */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    Logs
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <LogSearch value={logFilter} onChange={setLogFilter} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLogWindow()}
                        className="h-7 gap-1 px-2 text-[10px] text-muted-foreground"
                        aria-label="Open full log in separate window"
                      >
                        <ExternalLink size={11} />
                        Full Log
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Open the live log in a separate, resizable window for better inspection.
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-lg bg-surface-3 ring-1 ring-inset ring-white/5">
                  <div
                    ref={viewportRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
                    }}
                    role="log"
                    aria-label="Aether connection logs"
                    className="p-2 font-mono text-[10px] text-muted-foreground"
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
                          const line = l.line.toLowerCase();
                          const isError = line.includes("error") || line.includes("fatal");
                          const isWarn = line.includes("warn");
                          const isInfo = line.includes("[+]") || line.includes("info");
                          return (
                            <p key={i} className={isError ? "text-red-400" : isWarn ? "text-amber-400" : isInfo ? "text-emerald-400/70" : ""}>
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
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
