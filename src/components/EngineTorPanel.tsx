import { useRef, useState } from "react";
import { Shield, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldRow } from "@/components/ui/panel-section";
import { useConnectionStore } from "@/state/connectionStore";
import type { EngineTorMode } from "@/types/connection";
import { validateEngineTorBind, validateCountry } from "@/lib/validators";

const MODE_OPTIONS: { value: EngineTorMode; label: string; desc: string }[] = [
  { value: "disabled", label: "Disabled", desc: "No engine Tor" },
  { value: "tor", label: "Tor (WARP → Tor)", desc: "you → WARP → Tor → internet (1819+1820)" },
  { value: "tor-reverse", label: "Tor-Reverse (Tor → WARP)", desc: "you → Tor → WARP → internet, runs MASQUE over HTTP/2" },
  { value: "tor-only", label: "Tor-Only", desc: "you → Tor → internet, no WARP" },
];

export function EngineTorPanel() {
  const profile = useConnectionStore((s) => s.profile);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const setEngineTorMode = useConnectionStore((s) => s.setEngineTorMode);
  const setEngineTorBind = useConnectionStore((s) => s.setEngineTorBind);
  const setEngineTorDir = useConnectionStore((s) => s.setEngineTorDir);
  const setEngineTorBridges = useConnectionStore((s) => s.setEngineTorBridges);
  const setEngineTorBridgesFile = useConnectionStore((s) => s.setEngineTorBridgesFile);
  const engineTorStatus = useConnectionStore((s) => s.engineTorStatus);
  const setEngineTorForceBridges = useConnectionStore((s) => s.setEngineTorForceBridges);
  const setEngineTorNoBridges = useConnectionStore((s) => s.setEngineTorNoBridges);
  const setEngineTorPt = useConnectionStore((s) => s.setEngineTorPt);
  const setEngineTorPtDir = useConnectionStore((s) => s.setEngineTorPtDir);
  const setEngineTorCountry = useConnectionStore((s) => s.setEngineTorCountry);
  const setEngineTorDirectSecs = useConnectionStore((s) => s.setEngineTorDirectSecs);
  const setEngineTorStallSecs = useConnectionStore((s) => s.setEngineTorStallSecs);
  const setEngineTorRelays = useConnectionStore((s) => s.setEngineTorRelays);
  const setEngineTorRelayPorts = useConnectionStore((s) => s.setEngineTorRelayPorts);

  const enabled = profile.engine_tor_mode !== "disabled";
  const showTorBind = enabled && profile.engine_tor_mode !== "tor-only";
  const reverseConflict = profile.engine_tor_mode === "tor-reverse" && (profile.protocol === "wireguard" || profile.protocol === "gool");

  const [bindErr, setBindErr] = useState<string | null>(null);
  const [countryErr, setCountryErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const manualDraft = profile.engine_tor_bridges.join("\n");
  const setManualDraft = (text: string) => {
    setEngineTorNoBridges(false);
    setEngineTorForceBridges(false);
    setEngineTorBridges(text.split("\n"));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-[35px] bg-amber-500/[0.07] px-3 py-2 ring-1 ring-amber-500/15">
        <Shield size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-amber-500/80">Separate from IP Changer Tor (9050).</span> Engine Tor (arti) listens on 1820, shares no binary/dir/ports. These are independent — enabling one does not enable the other.
        </p>
      </div>

      <FieldRow label="Mode (Aether ≥2.0.0)" tooltip="Built-in Tor via arti. Tor-Reverse dials the tunnel through Tor so it runs MASQUE over HTTP/2 and is incompatible with WireGuard/gool.">
        <Select value={profile.engine_tor_mode} onValueChange={(v) => setEngineTorMode(v as EngineTorMode)} disabled={locked}>
          <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Engine Tor mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[35px] [--select-item-radius:31px] bg-surface-2 p-1 ring-1 ring-white/10">
            {MODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {}
      {profile.engine_tor_mode === "tor"
        && status.state !== "Idle" && status.state !== "Error" && (
        <p role="status" className="text-[11px] text-muted-foreground">
          Engine Tor listener: {engineTorStatus.ready ? "Ready" : "Waiting"}
          {` (${engineTorStatus.address ?? (profile.engine_tor_bind?.trim() || "127.0.0.1:1820")})`}. Separate from the primary tunnel and IP Changer.
        </p>
      )}
      {profile.engine_tor_mode === "tor-reverse" && (
        <p className="text-[11px] text-muted-foreground">Tor-Reverse forces MASQUE over HTTP/2. Your saved transport and QUIC choices are preserved for other modes.</p>
      )}
      {reverseConflict && (
        <div className="flex items-center gap-1.5 rounded-[35px] bg-destructive/10 px-2.5 py-2 text-[11px] text-status-error ring-1 ring-destructive/15">
          <TriangleAlert size={12} /> Tor-Reverse requires MASQUE (runs over HTTP/2, incompatible with WireGuard/gool).
        </div>
      )}

      {enabled && (
        <>
          {showTorBind && (
            <FieldRow label="Tor Bind" tooltip="Engine Tor SOCKS listen address (--tor-bind), default 127.0.0.1:1820. Tor-Only serves on the main proxy address instead, so no separate bind applies.">
              <Input
                type="text"
                value={profile.engine_tor_bind ?? ""}
                disabled={locked}
                onChange={(e) => { const v = e.target.value.trim(); setEngineTorBind(v || null); if (bindErr) setBindErr(validateEngineTorBind(v || null)); }}
                onBlur={() => { const e = validateEngineTorBind(profile.engine_tor_bind); setBindErr(e); if (e) { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setBindErr(null), 2500); } }}
                placeholder="127.0.0.1:1820"
                aria-invalid={!!bindErr}
                className={`h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${bindErr ? "ring-status-error" : "ring-white/[0.07]"}`}
              />
              {bindErr && <p className="text-[11px] text-status-error">{bindErr}</p>}
            </FieldRow>
          )}

          <FieldRow label="Tor Dir" tooltip="Directory for Tor state (--tor-dir). Leave empty for default.">
            <Input type="text" value={profile.engine_tor_dir ?? ""} disabled={locked} onChange={(e) => setEngineTorDir(e.target.value.trim() || null)} placeholder="/path/to/tor-dir" className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <FieldRow label="Country" tooltip="Country for bridgedb fetch (AETHER_TOR_COUNTRY), 2-letter code.">
            <Input
              type="text"
              value={profile.engine_tor_country ?? ""}
              disabled={locked}
              onChange={(e) => { const v = e.target.value.trim(); setEngineTorCountry(v || null); if (countryErr) setCountryErr(validateCountry(v || null)); }}
              onBlur={() => { const e = validateCountry(profile.engine_tor_country); setCountryErr(e); if (e) { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setCountryErr(null), 2500); } }}
              placeholder="DE"
              aria-invalid={!!countryErr}
              className={`h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-inset ${countryErr ? "ring-status-error" : "ring-white/[0.07]"}`}
              maxLength={2}
            />
            {countryErr && <p className="text-[11px] text-status-error">{countryErr}</p>}
          </FieldRow>

          <FieldRow label="Relays" tooltip="--tor-relays (Aether ≥2.1.0): auto | only | off | a count — how the engine sources directory relates. Empty keeps the engine default.">
            <Input
              type="text"
              value={profile.engine_tor_relays ?? ""}
              disabled={locked}
              onChange={(e) => setEngineTorRelays(e.target.value.trim() || null)}
              placeholder="auto"
              className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]"
            />
          </FieldRow>

          <FieldRow label="Relay ports" tooltip="--tor-relay-ports (Aether ≥2.1.0): Web = only ports 80/443 (engine default), Any = any relay port.">
            <Select
              value={profile.engine_tor_relay_ports ?? "web"}
              onValueChange={(v) => setEngineTorRelayPorts(v as "web" | "any")}
              disabled={locked}
            >
              <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Tor relay ports">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[35px] [--select-item-radius:31px] bg-surface-2 p-1 ring-1 ring-white/10">
                <SelectItem value="web" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">Web ports (80, 443) — default</SelectItem>
                <SelectItem value="any" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">Any port</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label="Bridge policy"
            tooltip="Automatic (default): try Tor plainly first, fetch bridges if blocked. Force automatic: use fetched bridges immediately (--tor-bridges). Manual: only your bridge lines (--tor-bridge, repeated). Disabled: never use bridges (--no-tor-bridges)."
          >
            <Select
              value={
                profile.engine_tor_no_bridges ? "none"
                  : profile.engine_tor_bridges.length > 0 ? "manual"
                  : profile.engine_tor_force_bridges ? "force"
                  : "auto"
              }
              onValueChange={(policy) => {
                setEngineTorNoBridges(policy === "none");
                setEngineTorForceBridges(policy === "force");
                if (policy !== "manual") setEngineTorBridges([]);
                else if (profile.engine_tor_bridges.length === 0) setEngineTorBridges([""]);
              }}
              disabled={locked}
            >
              <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Tor bridge policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[35px] [--select-item-radius:31px] bg-surface-2 p-1 ring-1 ring-white/10">
                <SelectItem value="auto" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Automatic</span>
                    <span className="text-[11px] text-muted-foreground">try plain Tor first, fetch bridges if blocked</span>
                  </div>
                </SelectItem>
                <SelectItem value="force" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Force automatic</span>
                    <span className="text-[11px] text-muted-foreground">use fetched bridges immediately</span>
                  </div>
                </SelectItem>
                <SelectItem value="manual" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Manual</span>
                    <span className="text-[11px] text-muted-foreground">only your bridge lines below</span>
                  </div>
                </SelectItem>
                <SelectItem value="none" className="cursor-pointer rounded-[31px] px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Disabled</span>
                    <span className="text-[11px] text-muted-foreground">never use bridges</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label="Manual bridges"
            tooltip="One bridge per line (--tor-bridge, repeatable), e.g. obfs4 1.2.3.4:443 FINGERPRINT cert=… iat-mode=0. Only sent when the policy is Manual; lines are kept while you edit."
          >
            <Textarea
              value={manualDraft}
              disabled={locked}
              onChange={(e) => setManualDraft(e.target.value)}
              placeholder="obfs4 1.2.3.4:443 ..."
              className="min-h-[64px] rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07] disabled:opacity-50"
            />
          </FieldRow>

          <FieldRow label="PT binary" tooltip="Pluggable transport binary for manual bridges (--tor-pt [name=]path), e.g. /usr/bin/lyrebird or snowflake=/usr/bin/snowflake-client. Leave empty to let the engine find one.">
            <Input type="text" value={profile.engine_tor_pt ?? ""} disabled={locked} onChange={(e) => setEngineTorPt(e.target.value.trim() || null)} placeholder="/path/to/lyrebird" className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <FieldRow label="Bridge file" tooltip="Obfs4 bridge lines from a file (--tor-bridge-file, Aether ≥2.1.0). The engine reads the path itself — the GUI never opens it. Counts as manual bridges for policy conflicts.">
            <Input
              type="text"
              value={profile.engine_tor_bridges_file ?? ""}
              disabled={locked}
              onChange={(e) => setEngineTorBridgesFile(e.target.value.trim() || null)}
              placeholder="/path/to/bridges.txt"
              className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]"
            />
          </FieldRow>

          <FieldRow label="PT dirs" tooltip="Extra folders to look in for transport binaries (--tor-pt-dir).">
            <Input type="text" value={profile.engine_tor_pt_dir ?? ""} disabled={locked} onChange={(e) => setEngineTorPtDir(e.target.value.trim() || null)} placeholder="/path/to/pt" className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <details className="rounded-[35px] bg-black/10 px-3 py-2 ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">Advanced (direct/stall secs)</summary>
            <div className="mt-2 flex flex-col gap-2">
              <FieldRow label="Direct secs" tooltip="AETHER_TOR_DIRECT_SECS — how long to try Tor plainly before bridges (default 75). 0 forces bridges immediately.">
                <Input type="number" min={0} value={profile.engine_tor_direct_secs ?? ""} disabled={locked} onChange={(e) => setEngineTorDirectSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
              </FieldRow>
              <FieldRow label="Stall secs" tooltip="AETHER_TOR_STALL_SECS — give up on a bridge after this long with no headway (default 75).">
                <Input type="number" min={0} value={profile.engine_tor_stall_secs ?? ""} disabled={locked} onChange={(e) => setEngineTorStallSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
              </FieldRow>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
