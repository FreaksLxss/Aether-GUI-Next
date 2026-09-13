import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Layers,
  Network,
  Route,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldRow, Section, SwitchRow } from "@/components/ui/panel-section";
import { VirtualLogList } from "@/components/VirtualLogList";
import { InlineErrorBanner } from "@/components/ui/inline-alert";
import { ProtocolSelect } from "@/components/ProtocolSelect";
import { ScanModeToggle } from "@/components/ScanModeToggle";
import { IpVersionToggle } from "@/components/IpVersionToggle";
import { MasqueTransportToggle } from "@/components/MasqueTransportToggle";
import { NoizeProfileToggle } from "@/components/NoizeProfileToggle";
import { BindAddressField } from "@/components/BindAddressField";
import { HttpProxyAddressField } from "@/components/HttpProxyAddressField";
import { UpstreamProxyField } from "@/components/UpstreamProxyField";
import { WiwPeersField } from "@/components/WiwPeersField";
import { RouteSniffMsField } from "@/components/RouteSniffMsField";
import { TunnelDnsField } from "@/components/TunnelDnsField";
import { RouteRulesField } from "@/components/RouteRulesField";
import { ZeroTrustPanel } from "@/components/ZeroTrustPanel";
import { LogLevelSelect } from "@/components/LogLevelSelect";
import { PerfSelect } from "@/components/PerfSelect";
import { LogSearch } from "@/components/LogSearch";
import { useConnectionStore } from "@/state/connectionStore";
import { useLocked } from "@/hooks/useLocked";
import { openLogWindow } from "@/lib/log-window";
import { cn } from "@/lib/utils";
import { MimPeersField } from "@/components/MimPeersField";
import { MarkField } from "@/components/MarkField";
import { EngineTorPanel } from "@/components/EngineTorPanel";
import {
  validateBindAddress,
  validateUpstream,
  validateWiwPeers,
  validateDnsServers,
  validateRouteRules,
  validateZtTeam,
  validateRouteSniffMs,
  validateMimPeers,
  validateFwMark,
  validateEngineTorBind,
  validateCountry,
  httpProxyAddressSchema,
} from "@/lib/validators";

export function AdvancedPanelContent({
  highlightScanMode = false,
}: {
  highlightScanMode?: boolean;
}) {
  const logs = useConnectionStore((s) => s.logs);
  const profile = useConnectionStore((s) => s.profile);
  const quickReconnect = profile.quick_reconnect;
  const setQuickReconnect = useConnectionStore((s) => s.setQuickReconnect);
  const protocol = profile.protocol;
  const masqueHttp2 = profile.masque_http2;
  const routeSniff = profile.route_sniff;
  const setRouteSniff = useConnectionStore((s) => s.setRouteSniff);
  const autoReprovision = profile.auto_reprovision;
  const setAutoReprovision = useConnectionStore((s) => s.setAutoReprovision);
  const mim = profile.mim;
  const setMim = useConnectionStore((s) => s.setMim);
  const quicV2 = profile.quic_v2;
  const setQuicV2 = useConnectionStore((s) => s.setQuicV2);
  const locked = useLocked();
  const setMaxClients = useConnectionStore((s) => s.setMaxClients);
  const setHalfCloseSecs = useConnectionStore((s) => s.setHalfCloseSecs);
  const setTcpKeepaliveSecs = useConnectionStore((s) => s.setTcpKeepaliveSecs);
  const setTcpConnectSecs = useConnectionStore((s) => s.setTcpConnectSecs);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState("");
  const deferredFilter = useDeferredValue(logFilter);
  const scanModeRef = useRef<HTMLDivElement>(null);

  const hasValidationError = useMemo(() => {
    const httpProxyErr = !httpProxyAddressSchema.safeParse(profile.http_proxy_address).success;
    return Boolean(
      validateBindAddress(profile.bind_address) ||
        httpProxyErr ||
        validateUpstream(profile.upstream_proxy) ||
        validateWiwPeers(profile.wiw_peers) ||
        validateDnsServers(profile.dns_servers) ||
        validateRouteRules(profile.route_block) ||
        validateRouteRules(profile.route_direct) ||
        validateZtTeam(profile.zt_team) ||
        validateRouteSniffMs(profile.route_sniff_ms) ||
        validateMimPeers(profile.mim_peers) ||
        validateFwMark(profile.fw_mark) ||
        validateEngineTorBind(profile.engine_tor_bind) ||
        validateCountry(profile.engine_tor_country),
    );
  }, [profile]);

  useEffect(() => {
    if (highlightScanMode && scanModeRef.current) {
      scanModeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightScanMode]);

  const filteredLogs = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => l.line.toLowerCase().includes(q));
  }, [logs, deferredFilter]);

  return (
        <div className="flex flex-col gap-4">
          {hasValidationError && (
            <InlineErrorBanner message="Some fields have errors — fix them before connecting" />
          )}
          <Section title="Protocol" icon={Layers}>
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
                "rounded-[35px] p-1.5 transition-all duration-500",
                highlightScanMode
                  ? "bg-primary/[0.08] ring-1 ring-primary/25"
                  : "bg-black/10 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.04]",
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
              tooltip="How the MASQUE tunnel carries traffic. HTTP/3 (QUIC) has the fastest handshake; HTTP/2 (TCP) looks like ordinary HTTPS and works where UDP is blocked or throttled. Only applies to the MASQUE protocol. When MiM is on, the H2 carrier applies to both hops."
            >
              <MasqueTransportToggle />
            </FieldRow>
            <FieldRow
              label="Obfuscation"
              tooltip="Disguises the handshake so DPI can't fingerprint the protocol. Heavier profiles send more decoy traffic — try escalating if the default doesn't connect. Options change based on the selected protocol."
            >
              <NoizeProfileToggle />
            </FieldRow>
            {protocol === "gool" && (
              <FieldRow
                label="WIW Endpoints (Aether ≥1.9.0)"
                htmlFor="aether-field-wiw-peers"
                tooltip="Manual WARP-in-WARP hop endpoints (--wiw-peers), comma-separated host:port. If you already know addresses that work on your network, name them here; give one and the scan finds the other. The port is required. Leave empty to scan both hops (default)."
              >
                <WiwPeersField id="aether-field-wiw-peers" />
              </FieldRow>
            )}
            {(protocol === "masque" || protocol === "auto") && (
              <SwitchRow
                label="MASQUE-in-MASQUE (Aether ≥2.0.0)"
                tooltip="Two MASQUE hops (like gool for MASQUE). Both use the H2 carrier; inner identity <masque-config>-secondary.toml."
                checked={mim}
                onCheckedChange={setMim}
                disabled={locked}
              />
            )}
            {mim && (protocol === "masque" || protocol === "auto") && (
              <FieldRow
                label="MiM peers"
                htmlFor="aether-field-mim-peers"
                tooltip="--mim-peers outer:port,inner:port or 'auto'. One hop alone is OK (scan finds the other). Leave empty to scan both hops."
              >
                <MimPeersField id="aether-field-mim-peers" />
              </FieldRow>
            )}
          </Section>

          <Section title="Proxy" icon={Network}>
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
              label="Upstream Proxy (Aether ≥1.7.0)"
              htmlFor="aether-field-upstream"
              tooltip="Chain Aether behind another proxy or VPN app already running on this machine (--upstream). socks5://host:port, http://host:port, or bare host:port (SOCKS5), with user:pass@ credentials if needed. SOCKS5 upstreams carry every transport; HTTP ones only carry MASQUE over HTTP/2. Leave empty to dial directly."
            >
              <UpstreamProxyField id="aether-field-upstream" />
            </FieldRow>
            <FieldRow
              label="Tunnel DNS"
              htmlFor="aether-field-dns"
              tooltip="Resolvers used inside the tunnel (--dns, comma-separated). Left blank, Aether uses its default (1.1.1.1,1.0.0.1). This is separate from the TUN-DNS option used when the TUN adapter is active."
            >
              <TunnelDnsField id="aether-field-dns" />
            </FieldRow>
          </Section>

          <Section title="Routing" icon={Route}>
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
            <SwitchRow
              label="Domain sniffing"
              tooltip="Behind a TUN front end, domain-based block/direct rules never used to match — the name was resolved before reaching Aether. The core now reads it from the TLS SNI or HTTP Host header (Aether ≥1.7.0). Turn off only if this causes trouble."
              checked={routeSniff}
              onCheckedChange={setRouteSniff}
              disabled={locked}
            />
            {routeSniff && (
              <FieldRow
                label="Sniff Wait"
                htmlFor="aether-field-sniff-ms"
                tooltip="How long to wait for a flow's domain name before applying route rules (AETHER_ROUTE_SNIFF_MS), in milliseconds. Leave empty for Aether's default."
              >
                <RouteSniffMsField id="aether-field-sniff-ms" />
              </FieldRow>
            )}
            <p className="rounded-md bg-amber-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/70 ring-1 ring-amber-500/10">
              <span className="font-medium text-amber-500/80">Syntax —</span>{" "}
              <code className="text-foreground/60">example.com</code> (and subdomains),{" "}
              <code className="text-foreground/60">full:example.com</code>,{" "}
              <code className="text-foreground/60">keyword:ad</code>,{" "}
              <code className="text-foreground/60">regexp:^ad[0-9]+</code>,{" "}
              <code className="text-foreground/60">10.0.0.0/8</code>,{" "}
              <code className="text-foreground/60">port:25</code>,{" "}
              <code className="text-foreground/60">private</code>.
            </p>
          </Section>

          <Section title="Zero Trust" icon={ShieldCheck}>
            <FieldRow
              label="Enrolment"
              tooltip="Enrol into a Cloudflare Zero Trust organization so this device connects as a managed device. Fill the team and one sign-in method."
            >
              <ZeroTrustPanel />
            </FieldRow>
          </Section>

          <Section title="Behavior" icon={SlidersHorizontal}>
            <SwitchRow
              label="Quick reconnect"
              tooltip="Remembers the last gateway that worked and re-tests it first on the next connect, skipping the full scan when it still works. Turn off to always scan fresh."
              checked={quickReconnect}
              onCheckedChange={setQuickReconnect}
              disabled={locked}
            />
            <SwitchRow
              label="Auto re-provision"
              tooltip="If Cloudflare stops accepting this device's saved identity, Aether registers a fresh device automatically (Aether ≥1.7.0). Turn off to only report it and keep the old identity."
              checked={autoReprovision}
              onCheckedChange={setAutoReprovision}
              disabled={locked}
            />
            <SwitchRow
              label="QUIC v2 probe (Aether ≥2.0.0)"
              tooltip="Sends version-negotiation probe before HTTP/3 (AETHER_QUIC_V2, default on). Off emits --no-quic-v2."
              checked={quicV2}
              onCheckedChange={setQuicV2}
              disabled={locked || masqueHttp2}
            />
            {masqueHttp2 && !quicV2 && (
              <p className="text-[11px] text-muted-foreground/50">HTTP/2 uses TCP — probe not applicable.</p>
            )}
            <FieldRow
              label="Firewall mark (Linux/Android)"
              htmlFor="aether-field-fw-mark"
              tooltip="--mark / AETHER_MARK — SO_MARK on tunnel/scan/upstream sockets. Decimal or 0x hex. Needs CAP_NET_ADMIN. Windows: not applicable."
            >
              <MarkField id="aether-field-fw-mark" />
            </FieldRow>
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
            <details className="rounded-[35px] bg-black/10 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.02] light:ring-black/[0.04]">
              <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Settings2 size={11} />
                Proxy Tuning (env-only, Aether ≥2.0.0)
              </summary>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60">Env-only, no flag. Fixes fd limit / half-close / keepalive timeouts. Leave empty for defaults.</p>
              <div className="mt-2 flex flex-col gap-2">
                <FieldRow label="Max clients" tooltip="AETHER_MAX_CLIENTS — concurrent proxy clients (fd budget).">
                  <Input type="number" value={profile.max_clients ?? ""} disabled={locked} onChange={(e) => setMaxClients(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
                </FieldRow>
                <FieldRow label="Half-close secs" tooltip="AETHER_HALF_CLOSE_SECS — how long to keep half-closed connections.">
                  <Input type="number" value={profile.half_close_secs ?? ""} disabled={locked} onChange={(e) => setHalfCloseSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
                </FieldRow>
                <FieldRow label="TCP keepalive secs" tooltip="AETHER_TCP_KEEPALIVE_SECS">
                  <Input type="number" value={profile.tcp_keepalive_secs ?? ""} disabled={locked} onChange={(e) => setTcpKeepaliveSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
                </FieldRow>
                <FieldRow label="TCP connect secs" tooltip="AETHER_TCP_CONNECT_SECS">
                  <Input type="number" value={profile.tcp_connect_secs ?? ""} disabled={locked} onChange={(e) => setTcpConnectSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
                </FieldRow>
              </div>
            </details>
          </Section>

          <Section title="Engine Tor (arti) — Built-in" icon={Shield}>
            <EngineTorPanel />
          </Section>


          <Section title="Logs" icon={Terminal}>
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
                    className="h-7 gap-1 bg-white/[0.04] px-2 text-[11px] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
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

            <div className="overflow-hidden rounded-[35px] bg-[#0a0a0c] ring-1 ring-white/[0.06] light:bg-[#f6f6f5] light:ring-black/10">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 light:border-black/5 light:bg-black/[0.02]">
                <span className="size-2.5 rounded-full bg-red-500/70 ring-1 ring-red-500/20" aria-hidden />
                <span className="size-2.5 rounded-full bg-amber-400/70 ring-1 ring-amber-400/20" aria-hidden />
                <span className="size-2.5 rounded-full bg-emerald-500/70 ring-1 ring-emerald-500/20" aria-hidden />
                <span className="ml-2 font-mono text-[11px] tracking-wide text-muted-foreground/50">aether.log</span>
                <span className="ml-auto text-[11px] text-muted-foreground/40">{filteredLogs.length} lines</span>
              </div>
              <VirtualLogList
                logs={filteredLogs}
                filter={deferredFilter}
                autoScroll={autoScroll}
                onAutoScrollChange={setAutoScroll}
              />
            </div>
          </Section>
        </div>
  );
}

// Back-compat: old accordion wrapper (unused — kept for reference)
export function AdvancedPanel(props: { open: boolean; onToggle: () => void; highlightScanMode?: boolean }) {
  return <AdvancedPanelContent highlightScanMode={props.highlightScanMode} />;
}
