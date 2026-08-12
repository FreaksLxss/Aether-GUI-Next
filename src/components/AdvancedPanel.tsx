import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Info, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassAccordion } from "@/components/GlassAccordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { ProtocolSelect } from "@/components/ProtocolSelect";
import { ScanModeToggle } from "@/components/ScanModeToggle";
import { IpVersionToggle } from "@/components/IpVersionToggle";
import { MasqueTransportToggle } from "@/components/MasqueTransportToggle";
import { NoizeProfileToggle } from "@/components/NoizeProfileToggle";
import { BindAddressField } from "@/components/BindAddressField";
import { HttpProxyAddressField } from "@/components/HttpProxyAddressField";
import { TunnelDnsField } from "@/components/TunnelDnsField";
import { RouteRulesField } from "@/components/RouteRulesField";
import { ZeroTrustPanel } from "@/components/ZeroTrustPanel";
import { LogLevelSelect } from "@/components/LogLevelSelect";
import { PerfSelect } from "@/components/PerfSelect";
import { LogSearch } from "@/components/LogSearch";
import { useConnectionStore } from "@/state/connectionStore";
import { openLogWindow } from "@/lib/log-window";
import { cn } from "@/lib/utils";

function FieldRow({
  label,
  tooltip,
  htmlFor,
  children,
}: {
  label: string;
  tooltip?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const labelNode = (
    <>
      {label}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger aria-label={`About ${label}`}>
            <Info size={12} />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground"
        >
          {labelNode}
        </label>
      ) : (
        <div className="flex w-fit items-center gap-1 text-xs text-muted-foreground">
          {labelNode}
        </div>
      )}
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
      <GlassAccordion
        icon={Settings2}
        label="Advanced"
        open={open}
        onToggle={onToggle}
      >
        <div className="flex flex-col gap-3">
          {/* Protocol section */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Protocol
            </span>
            <FieldRow
              label="Protocol"
              htmlFor="aether-field-protocol"
              tooltip="MASQUE disguises traffic as normal HTTPS — best against strict censorship. WireGuard is lighter and faster. gool nests two WireGuard tunnels for extra security at a speed cost."
            >
              <ProtocolSelect id="aether-field-protocol" />
            </FieldRow>
            <div
              ref={scanModeRef}
              className={cn(
                "rounded-lg transition-all duration-800 p-1",
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
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Proxy
            </span>
            <FieldRow
              label="SOCKS5 Proxy"
              htmlFor="aether-field-socks-port"
              tooltip="The local address Aether's SOCKS5 proxy listens on. Change the port to avoid conflicts, or enable LAN to share the tunnel with other devices on your network."
            >
              <BindAddressField id="aether-field-socks-port" />
            </FieldRow>
            <FieldRow
              label="HTTP Proxy (Aether ≥1.6.0)"
              htmlFor="aether-field-http-proxy"
              tooltip="An optional HTTP CONNECT proxy next to the SOCKS5 one (--http-proxy), for clients that can't speak SOCKS. Address:port, e.g. 127.0.0.1:1818. Leave empty to disable."
            >
              <HttpProxyAddressField id="aether-field-http-proxy" />
            </FieldRow>
            <FieldRow
              label="Tunnel DNS"
              htmlFor="aether-field-dns"
              tooltip="Resolvers used inside the tunnel (--dns, comma-separated). Left blank, Aether uses its default (1.1.1.1,1.0.0.1). This is separate from the TUN-DNS option used when the TUN adapter is active."
            >
              <TunnelDnsField id="aether-field-dns" />
            </FieldRow>
          </div>

          {/* Routing section (Aether ≥1.5.0) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Routing
            </span>
            <FieldRow
              label="Blocked"
              htmlFor="aether-field-route-block"
              tooltip="Destinations Aether refuses outright (--route-block), comma-separated. Rules match on domain, IP, network, and port. Blocked is checked first, then Direct, otherwise the tunnel is used."
            >
              <RouteRulesField id="aether-field-route-block" kind="block" />
            </FieldRow>
            <FieldRow
              label="Direct"
              htmlFor="aether-field-route-direct"
              tooltip="Destinations sent straight out, bypassing the tunnel (--route-direct) — useful for banking apps, LAN services, and domestic sites."
            >
              <RouteRulesField id="aether-field-route-direct" kind="direct" />
            </FieldRow>
            <p className="text-[10px] text-muted-foreground/70">
              Entries: <code>example.com</code> (and subdomains), <code>full:example.com</code>,{" "}
              <code>keyword:ad</code>, <code>regexp:^ad[0-9]+</code>, <code>10.0.0.0/8</code>,{" "}
              <code>port:25</code>, <code>private</code>.
            </p>
          </div>

          {/* Zero Trust section (Aether ≥1.5.0) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Zero Trust
            </span>
            <FieldRow
              label="Enrolment"
              tooltip="Enrol into a Cloudflare Zero Trust organization so this device connects as a managed device. Fill the team and one sign-in method."
            >
              <ZeroTrustPanel />
            </FieldRow>
          </div>

          {/* Behavior section */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
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
              htmlFor="aether-field-log-level"
              tooltip="Controls how much Aether prints to the log panel. Info is quiet; Debug adds tunnel internals useful for troubleshooting; Trace adds full per-packet detail."
            >
              <LogLevelSelect id="aether-field-log-level" />
            </FieldRow>
            <FieldRow
              label="Performance"
              htmlFor="aether-field-perf"
              tooltip="Override Aether's automatic resource scaling. Leave on Auto to let it detect your CPU and RAM at startup. Use Low for routers or Pi, High for maximum scan speed."
            >
              <PerfSelect id="aether-field-perf" />
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

            <div className="glass-strong max-h-64 overflow-y-auto rounded-lg ring-1 ring-inset ring-white/5 shadow-glass">
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
                    <p className="text-muted-foreground">No matching lines.</p>
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
                          <span className="text-muted-foreground/70">+{s}s </span>
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
      </GlassAccordion>
    </div>
  );
}
