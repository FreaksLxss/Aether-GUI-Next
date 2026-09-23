import { useState } from "react";
import { Shield, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldRow } from "@/components/ui/panel-section";
import { useConnectionStore } from "@/state/connectionStore";
import type { EnginePsiphonMode, PsiphonShape } from "@/types/connection";
import { validateEngineTorBind, validateCountry } from "@/lib/validators";

const MODE_OPTIONS: { value: EnginePsiphonMode; label: string; desc: string }[] = [
  { value: "disabled", label: "Disabled", desc: "No engine Psiphon" },
  { value: "psiphon", label: "Psiphon (WARP → Psiphon)", desc: "you → WARP → Psiphon → internet (1819+1821)" },
  { value: "psiphon-reverse", label: "Psiphon-Reverse (Psiphon → WARP)", desc: "you → Psiphon → WARP → internet, runs MASQUE over HTTP/2" },
  { value: "psiphon-only", label: "Psiphon-Only", desc: "you → Psiphon → internet, no WARP" },
];

const SHAPE_OPTIONS: { value: PsiphonShape; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "engine picks (default)" },
  { value: "cdn", label: "CDN", desc: "CDN-fronted transport" },
  { value: "direct", label: "Direct", desc: "direct to Psiphon servers" },
];

export function PsiphonPanel() {
  const profile = useConnectionStore((s) => s.profile);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const setEnginePsiphonMode = useConnectionStore((s) => s.setEnginePsiphonMode);
  const setEnginePsiphonBind = useConnectionStore((s) => s.setEnginePsiphonBind);
  const setPsiphonShape = useConnectionStore((s) => s.setPsiphonShape);
  const setPsiphonRegion = useConnectionStore((s) => s.setPsiphonRegion);
  const enginePsiphonStatus = useConnectionStore((s) => s.enginePsiphonStatus);

  const enabled = profile.engine_psiphon_mode !== "disabled";
  const showBind = enabled && profile.engine_psiphon_mode !== "psiphon-only";
  const reverseConflict = profile.engine_psiphon_mode === "psiphon-reverse"
    && (profile.protocol === "wireguard" || profile.protocol === "gool");
  const primaryConflict =
    (profile.engine_psiphon_mode === "psiphon-only" && profile.engine_tor_mode !== "disabled")
    || (profile.engine_tor_mode === "tor-only" && profile.engine_psiphon_mode !== "disabled")
    || (profile.engine_tor_mode === "tor-reverse" && profile.engine_psiphon_mode === "psiphon-reverse");

  const [bindErr, setBindErr] = useState<string | null>(null);
  const [regionErr, setRegionErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-[35px] bg-amber-500/[0.07] px-3 py-2 ring-1 ring-amber-500/15">
        <Shield size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-amber-500/80">Separate from engine Tor (1820) and IP Changer Tor (9050).</span> Engine Psiphon listens on 1821 when chained, shares no binary/dir/ports with either. Enabling one never enables the others.
        </p>
      </div>

      <FieldRow label="Mode (Aether ≥2.1.0)" tooltip="Built-in Psiphon. Reverse dials the tunnel through Psiphon so it runs MASQUE over HTTP/2, incompatible with WireGuard/gool. Only-modes XOR with engine Tor — both need the primary listener.">
        <Select value={profile.engine_psiphon_mode} onValueChange={(v) => setEnginePsiphonMode(v as EnginePsiphonMode)} disabled={locked}>
          <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Engine Psiphon mode">
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
      {profile.engine_psiphon_mode === "psiphon"
        && status.state !== "Idle" && status.state !== "Error" && (
        <p role="status" className="text-[11px] text-muted-foreground">
          Engine Psiphon listener: {enginePsiphonStatus.ready ? "Ready" : "Waiting"}
          {` (${enginePsiphonStatus.address ?? (profile.engine_psiphon_bind?.trim() || "127.0.0.1:1821")})`}. Separate from the primary tunnel, engine Tor and IP Changer.
        </p>
      )}
      {profile.engine_psiphon_mode === "psiphon-reverse" && (
        <p className="text-[11px] text-muted-foreground">Psiphon-Reverse forces MASQUE over HTTP/2. Your saved transport and QUIC choices are preserved for other modes.</p>
      )}
      {reverseConflict && (
        <div className="flex items-center gap-1.5 rounded-[35px] bg-destructive/10 px-2.5 py-2 text-[11px] text-status-error ring-1 ring-destructive/15">
          <TriangleAlert size={12} /> Psiphon-Reverse requires MASQUE (runs over HTTP/2, incompatible with WireGuard/gool).
        </div>
      )}
      {primaryConflict && (
        <div className="flex items-center gap-1.5 rounded-[35px] bg-destructive/10 px-2.5 py-2 text-[11px] text-status-error ring-1 ring-destructive/15">
          <TriangleAlert size={12} /> Only-modes can&apos;t combine with the other tool — each needs the primary listener, and reverse+reverse both need MASQUE as their outer tunnel.
        </div>
      )}

      {enabled && (
        <>
          {showBind && (
            <FieldRow label="Psiphon Bind" tooltip="Engine Psiphon SOCKS listen address (--psiphon-bind), default 127.0.0.1:1821. Psiphon-Only serves on the main proxy address instead, so no separate bind applies.">
              <Input
                type="text"
                value={profile.engine_psiphon_bind ?? ""}
                disabled={locked}
                onChange={(e) => { const v = e.target.value.trim(); setEnginePsiphonBind(v || null); if (bindErr) setBindErr(validateEngineTorBind(v || null)); }}
                onBlur={() => { const e = validateEngineTorBind(profile.engine_psiphon_bind); setBindErr(e); }}
                placeholder="127.0.0.1:1821"
                aria-invalid={!!bindErr}
                className={`h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-inset focus-visible:ring-primary ${bindErr ? "ring-status-error" : "ring-white/[0.07]"}`}
              />
              {bindErr && <p className="text-[11px] text-status-error">{bindErr}</p>}
            </FieldRow>
          )}

          <FieldRow label="Transport shape" tooltip="--psiphon-mode (Aether ≥2.1.0): how Psiphon reaches its servers. Auto keeps the engine default.">
            <Select value={profile.psiphon_shape} onValueChange={(v) => setPsiphonShape(v as PsiphonShape)} disabled={locked}>
              <SelectTrigger className="w-full justify-start gap-2 rounded-[35px] bg-black/20 px-3 py-5 text-xs font-medium text-foreground ring-1 ring-white/[0.07] disabled:opacity-50 [&>span]:flex-1 [&>span]:text-left [&>svg]:ml-auto" aria-label="Psiphon transport shape">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[35px] [--select-item-radius:31px] bg-surface-2 p-1 ring-1 ring-white/10">
                {SHAPE_OPTIONS.map((opt) => (
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

          <FieldRow label="Region" tooltip="Psiphon exit region (--psiphon-region), 2-letter code. Leave empty to let Psiphon choose.">
            <Input
              type="text"
              value={profile.psiphon_region ?? ""}
              disabled={locked}
              onChange={(e) => { const v = e.target.value.trim(); setPsiphonRegion(v || null); if (regionErr) setRegionErr(validateCountry(v || null)); }}
              onBlur={() => { const e = validateCountry(profile.psiphon_region); setRegionErr(e); }}
              placeholder="US"
              aria-invalid={!!regionErr}
              maxLength={2}
              className={`h-9 rounded-[35px] bg-black/20 font-mono text-[11px] ring-1 ring-inset ${regionErr ? "ring-status-error" : "ring-white/[0.07]"}`}
            />
            {regionErr && <p className="text-[11px] text-status-error">{regionErr}</p>}
          </FieldRow>
        </>
      )}
    </div>
  );
}
