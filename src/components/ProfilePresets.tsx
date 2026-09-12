import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Bookmark, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineErrorBanner } from "@/components/ui/inline-alert";
import { useConnectionStore } from "@/state/connectionStore";
import type { ConnectionProfile } from "@/types/connection";

interface ProfilePreset {
  name: string;
  profile: ConnectionProfile;
  created_at: number;
}

export function ProfilePresetsContent() {
  const profile = useConnectionStore((s) => s.profile);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const setIpVersion = useConnectionStore((s) => s.setIpVersion);
  const setQuickReconnect = useConnectionStore((s) => s.setQuickReconnect);
  const setMasqueHttp2 = useConnectionStore((s) => s.setMasqueHttp2);
  const setMasqueNoize = useConnectionStore((s) => s.setMasqueNoize);
  const setWgNoize = useConnectionStore((s) => s.setWgNoize);
  const setBindAddress = useConnectionStore((s) => s.setBindAddress);
  const setWiwPeers = useConnectionStore((s) => s.setWiwPeers);
  const setDnsServers = useConnectionStore((s) => s.setDnsServers);
  const setRouteBlock = useConnectionStore((s) => s.setRouteBlock);
  const setRouteDirect = useConnectionStore((s) => s.setRouteDirect);
  const setZtTeam = useConnectionStore((s) => s.setZtTeam);
  const setZtAccessEmail = useConnectionStore((s) => s.setZtAccessEmail);
  const setZtAccessId = useConnectionStore((s) => s.setZtAccessId);
  const setZtAccessSecret = useConnectionStore((s) => s.setZtAccessSecret);
  const setZtAccessToken = useConnectionStore((s) => s.setZtAccessToken);
  const setZtGateway = useConnectionStore((s) => s.setZtGateway);
  const status = useConnectionStore((s) => s.status);

  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const locked = status.state !== "Idle" && status.state !== "Error";

  const loadPresets = async () => {
    try {
      const list = await invoke<ProfilePreset[]>("get_presets");
      setPresets(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void loadPresets();
  }, []);

  const applyPreset = (p: ProfilePreset) => {
    setProtocol(p.profile.protocol);
    setScanMode(p.profile.scan_mode);
    setIpVersion(p.profile.ip_version);
    setQuickReconnect(p.profile.quick_reconnect);
    setMasqueHttp2(p.profile.masque_http2);
    setMasqueNoize(p.profile.masque_noize);
    setWgNoize(p.profile.wg_noize);
    setBindAddress(p.profile.bind_address);
    setWiwPeers(p.profile.wiw_peers ?? null);
    setDnsServers(p.profile.dns_servers ?? null);
    setRouteBlock(p.profile.route_block ?? []);
    setRouteDirect(p.profile.route_direct ?? []);
    setZtTeam(p.profile.zt_team ?? null);
    setZtAccessEmail(p.profile.zt_access_email ?? null);
    setZtAccessId(p.profile.zt_access_id ?? null);
    setZtAccessSecret(p.profile.zt_access_secret ?? null);
    setZtAccessToken(p.profile.zt_access_token ?? null);
    setZtGateway(p.profile.zt_gateway ?? false);
    toast.success(`Applied "${p.name}"`);
  };

  const savePreset = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await invoke("save_preset", { name, profile });
      setNewName("");
      setError(null);
      await loadPresets();
      toast.success(`Saved "${name}"`);
    } catch (e) {
      setError(String(e));
      toast.error(String(e));
    }
  };

  const deletePreset = async (name: string) => {
    try {
      await invoke("delete_preset", { name });
      setConfirmDelete(null);
      setError(null);
      await loadPresets();
    } catch (e) {
      setError(String(e));
      toast.error(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <InlineErrorBanner message={error} onRetry={() => void loadPresets()} />}
      {/* save card */}
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-3.5 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.08] light:shadow-none">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06] light:bg-black/5 light:ring-black/5">
            <Sparkles size={12} className="text-muted-foreground" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.14em] text-foreground/80 uppercase">Save current</span>
        </div>
        <div className="flex gap-1.5">
          <Input
            id="preset-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Preset name…"
            disabled={locked}
            onKeyDown={(e) => {
              if (e.key === "Enter") void savePreset();
            }}
            className="h-9 flex-1 rounded-xl bg-black/20 font-mono text-[11px] ring-1 ring-inset ring-white/[0.07] placeholder:text-muted-foreground/50 focus-visible:ring-primary light:bg-black/[0.04] light:ring-black/10"
          />
          <Button
            size="sm"
            onClick={() => void savePreset()}
            disabled={locked || !newName.trim()}
            className="h-9 gap-1.5 rounded-xl px-3.5 text-xs font-medium shadow-[0_2px_10px_-4px_rgba(234,88,12,0.4)]"
          >
            <Plus size={12} />
            Save
          </Button>
        </div>
      </div>

      {/* list */}
      {presets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-0 bg-card px-4 py-10 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-dashed light:border-black/10 light:shadow-none text-muted-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05] light:bg-black/[0.04] light:ring-black/5">
            <Bookmark size={16} className="opacity-60" />
          </span>
          <p className="text-xs font-medium text-foreground/70">No presets yet</p>
          <p className="max-w-[22ch] text-center text-[11px] leading-relaxed text-muted-foreground/60">Save a preset to snapshot the current profile and jump back to it later.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border-0 bg-card p-3 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75),0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] light:border light:border-black/[0.08] light:shadow-none">
          <span className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground/60 uppercase">Saved · {presets.length}</span>
          <div className="flex flex-col gap-1.5">
            {presets.map((p) => (
              <div
                key={p.name}
                className="group flex items-center justify-between gap-2 rounded-xl border border-white/[0.04] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.03] transition-colors hover:border-white/[0.07] hover:bg-black/20 light:border-black/[0.04] light:bg-black/[0.02] light:ring-black/[0.04] light:hover:bg-black/[0.04]"
              >
                <button
                  onClick={() => applyPreset(p)}
                  disabled={locked}
                  className="min-w-0 flex-1 truncate rounded text-left text-xs font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
                >
                  {p.name}
                </button>
                {confirmDelete === p.name ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-destructive uppercase">Delete?</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void deletePreset(p.name)}
                      aria-label={`Confirm delete preset "${p.name}"`}
                      className="size-7 rounded-lg bg-destructive/10 text-status-error hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setConfirmDelete(null);
                        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                      }}
                      aria-label={`Cancel delete preset "${p.name}"`}
                      className="size-7 rounded-lg text-muted-foreground/80 hover:text-foreground"
                    >
                      <X size={12} />
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setConfirmDelete(p.name);
                      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                      deleteTimerRef.current = setTimeout(() => {
                        setConfirmDelete((cur) => (cur === p.name ? null : cur));
                      }, 2500);
                    }}
                    title="Delete preset"
                    aria-label={`Delete preset "${p.name}"`}
                    className="size-7 shrink-0 rounded-lg text-muted-foreground/50 opacity-40 transition-opacity hover:opacity-100 hover:text-destructive group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-70"
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Back-compat shim (not used in new menu)
export function ProfilePresets(props: { open: boolean; onToggle: () => void }) {
  void props;
  return <ProfilePresetsContent />;
}
