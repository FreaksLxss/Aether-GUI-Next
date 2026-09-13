import { useRef, useState } from "react";
import { Shield, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldRow } from "@/components/ui/panel-section";
import { useConnectionStore } from "@/state/connectionStore";
import type { EngineTorMode } from "@/types/connection";
import { validateEngineTorBind, validateCountry } from "@/lib/validators";

const MODE_OPTIONS: { value: EngineTorMode; label: string; desc: string }[] = [
  { value: "disabled", label: "Disabled", desc: "No engine Tor" },
  { value: "tor", label: "Tor (WARP → Tor)", desc: "you → WARP → Tor → internet (1819+1820)" },
  { value: "tor-reverse", label: "Tor-Reverse (Tor → WARP)", desc: "you → Tor → WARP → internet, forces MASQUE H2" },
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
  const setEngineTorNoBridges = useConnectionStore((s) => s.setEngineTorNoBridges);
  const setEngineTorPt = useConnectionStore((s) => s.setEngineTorPt);
  const setEngineTorPtDir = useConnectionStore((s) => s.setEngineTorPtDir);
  const setEngineTorCountry = useConnectionStore((s) => s.setEngineTorCountry);
  const setEngineTorDirectSecs = useConnectionStore((s) => s.setEngineTorDirectSecs);
  const setEngineTorStallSecs = useConnectionStore((s) => s.setEngineTorStallSecs);

  const enabled = profile.engine_tor_mode !== "disabled";
  const reverseConflict = profile.engine_tor_mode === "tor-reverse" && (profile.protocol === "wireguard" || profile.protocol === "gool");

  const [bindErr, setBindErr] = useState<string | null>(null);
  const [countryErr, setCountryErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-[35px] bg-amber-500/[0.07] px-3 py-2 ring-1 ring-amber-500/15">
        <Shield size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-amber-500/80">Separate from IP Changer Tor (9050).</span> Engine Tor (arti) listens on 1820, shares no binary/dir/ports. These are independent — enabling one does not enable the other.
        </p>
      </div>

      <FieldRow label="Mode (Aether ≥2.0.0)" tooltip="Built-in Tor via arti. Tor-Reverse forces MASQUE over HTTP/2 and is incompatible with WireGuard/gool.">
        <Select value={profile.engine_tor_mode} onValueChange={(v) => setEngineTorMode(v as EngineTorMode)} disabled={locked}>
          <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Engine Tor mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[35px] bg-surface-2 p-1 ring-1 ring-white/10">
            {MODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="cursor-pointer rounded-lg px-2.5 py-2 text-xs focus:bg-primary/15 data-[highlighted]:bg-primary/15">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {reverseConflict && (
        <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] text-status-error ring-1 ring-destructive/15">
          <TriangleAlert size={12} /> Tor-Reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool).
        </div>
      )}

      {enabled && (
        <>
          <FieldRow label="Tor Bind" tooltip="Engine Tor SOCKS listen address (--tor-bind), default 127.0.0.1:1820.">
            <Input
              type="text"
              value={profile.engine_tor_bind ?? ""}
              disabled={locked}
              onChange={(e) => { const v = e.target.value.trim(); setEngineTorBind(v || null); if (bindErr) setBindErr(validateEngineTorBind(v || null)); }}
              onBlur={() => { const e = validateEngineTorBind(profile.engine_tor_bind); setBindErr(e); if (e) { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setBindErr(null), 2500); } }}
              placeholder="127.0.0.1:1820"
              aria-invalid={!!bindErr}
              className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${bindErr ? "ring-status-error" : "ring-white/[0.07]"}`}
            />
            {bindErr && <p className="text-[11px] text-status-error">{bindErr}</p>}
          </FieldRow>

          <FieldRow label="Tor Dir" tooltip="Directory for Tor state (--tor-dir). Leave empty for default.">
            <Input type="text" value={profile.engine_tor_dir ?? ""} disabled={locked} onChange={(e) => setEngineTorDir(e.target.value.trim() || null)} placeholder="/path/to/tor-dir" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
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
              className={`h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset ${countryErr ? "ring-status-error" : "ring-white/[0.07]"}`}
              maxLength={2}
            />
            {countryErr && <p className="text-[11px] text-status-error">{countryErr}</p>}
          </FieldRow>

          <FieldRow label="Bridges" tooltip="One bridge per line (--tor-bridge, repeatable). Leave empty to fetch or use --no-tor-bridges.">
            <Textarea
              value={profile.engine_tor_bridges.join("\n")}
              disabled={locked || profile.engine_tor_no_bridges}
              onChange={(e) => setEngineTorBridges(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
              placeholder="obfs4 1.2.3.4:443 ..."
              className="min-h-[64px] rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07] disabled:opacity-50"
            />
          </FieldRow>

          <FieldRow label="Bridges file" tooltip="Path to bridges file (--tor-bridges).">
            <Input type="text" value={profile.engine_tor_bridges_file ?? ""} disabled={locked} onChange={(e) => setEngineTorBridgesFile(e.target.value.trim() || null)} placeholder="/path/to/bridges.txt" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <div className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04]">
            <span className="text-[11px] font-medium text-foreground/80">No bridges</span>
            <Switch checked={profile.engine_tor_no_bridges} onCheckedChange={setEngineTorNoBridges} disabled={locked} aria-label="No bridges" />
          </div>

          <FieldRow label="PT name" tooltip="Pluggable transport name (--tor-pt), binaries in pt/ folder.">
            <Input type="text" value={profile.engine_tor_pt ?? ""} disabled={locked} onChange={(e) => setEngineTorPt(e.target.value.trim() || null)} placeholder="obfs4proxy" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <FieldRow label="PT dir" tooltip="PT binaries directory (--tor-pt-dir).">
            <Input type="text" value={profile.engine_tor_pt_dir ?? ""} disabled={locked} onChange={(e) => setEngineTorPtDir(e.target.value.trim() || null)} placeholder="/path/to/pt" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
          </FieldRow>

          <details className="rounded-lg bg-black/10 px-3 py-2 ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">Advanced (direct/stall secs)</summary>
            <div className="mt-2 flex flex-col gap-2">
              <FieldRow label="Direct secs" tooltip="AETHER_TOR_DIRECT_SECS">
                <Input type="number" value={profile.engine_tor_direct_secs ?? ""} disabled={locked} onChange={(e) => setEngineTorDirectSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
              </FieldRow>
              <FieldRow label="Stall secs" tooltip="AETHER_TOR_STALL_SECS">
                <Input type="number" value={profile.engine_tor_stall_secs ?? ""} disabled={locked} onChange={(e) => setEngineTorStallSecs(e.target.value.trim() ? Number(e.target.value) : null)} placeholder="auto" className="h-9 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-white/[0.07]" />
              </FieldRow>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
