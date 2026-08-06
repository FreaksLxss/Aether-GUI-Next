import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GlassAccordion } from "@/components/GlassAccordion";
import { useConnectionStore } from "@/state/connectionStore";
import type { ConnectionProfile } from "@/types/connection";

interface ProfilePreset {
  name: string;
  profile: ConnectionProfile;
  created_at: number;
}

export function ProfilePresets({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const profile = useConnectionStore((s) => s.profile);
  const setProtocol = useConnectionStore((s) => s.setProtocol);
  const setScanMode = useConnectionStore((s) => s.setScanMode);
  const setIpVersion = useConnectionStore((s) => s.setIpVersion);
  const setQuickReconnect = useConnectionStore((s) => s.setQuickReconnect);
  const setMasqueHttp2 = useConnectionStore((s) => s.setMasqueHttp2);
  const setMasqueNoize = useConnectionStore((s) => s.setMasqueNoize);
  const setWgNoize = useConnectionStore((s) => s.setWgNoize);
  const setBindAddress = useConnectionStore((s) => s.setBindAddress);
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
  const locked = status.state !== "Idle" && status.state !== "Error";

  const loadPresets = async () => {
    const list = await invoke<ProfilePreset[]>("get_presets");
    setPresets(list);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const list = await invoke<ProfilePreset[]>("get_presets");
      if (!cancelled) setPresets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const applyPreset = (p: ProfilePreset) => {
    setProtocol(p.profile.protocol);
    setScanMode(p.profile.scan_mode);
    setIpVersion(p.profile.ip_version);
    setQuickReconnect(p.profile.quick_reconnect);
    setMasqueHttp2(p.profile.masque_http2);
    setMasqueNoize(p.profile.masque_noize);
    setWgNoize(p.profile.wg_noize);
    setBindAddress(p.profile.bind_address);
    setDnsServers(p.profile.dns_servers ?? null);
    setRouteBlock(p.profile.route_block ?? []);
    setRouteDirect(p.profile.route_direct ?? []);
    setZtTeam(p.profile.zt_team ?? null);
    setZtAccessEmail(p.profile.zt_access_email ?? null);
    setZtAccessId(p.profile.zt_access_id ?? null);
    setZtAccessSecret(p.profile.zt_access_secret ?? null);
    setZtAccessToken(p.profile.zt_access_token ?? null);
    setZtGateway(p.profile.zt_gateway ?? false);
  };

  const savePreset = async () => {
    const name = newName.trim();
    if (!name) return;
    await invoke("save_preset", { name, profile });
    setNewName("");
    await loadPresets();
  };

  const deletePreset = async (name: string) => {
    await invoke("delete_preset", { name });
    setConfirmDelete(null);
    await loadPresets();
  };

  return (
    <div className="w-full">
      <GlassAccordion
        icon={Bookmark}
        label="Presets"
        open={open}
        onToggle={onToggle}
        count={presets.length}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="preset-name"
              className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              Save current profile
            </label>
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
                if (e.key === "Enter") savePreset();
              }}
              className="h-8 flex-1 bg-black/20 text-xs ring-white/10 focus-visible:ring-primary"
            />
            <Button
              size="sm"
              onClick={savePreset}
              disabled={locked || !newName.trim()}
              className="h-8 gap-1 px-2.5 text-xs"
            >
              <Plus size={12} />
              Save
            </Button>
          </div>

          {presets.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-3 text-muted-foreground">
              <Bookmark size={16} className="opacity-50" />
              <p className="text-xs">No presets saved yet.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-40">
              <div className="flex flex-col gap-1">
                {presets.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-md bg-black/10 px-2 py-1.5"
                  >
                    <button
                      onClick={() => applyPreset(p)}
                      disabled={locked}
                      className="flex-1 cursor-pointer text-left text-xs text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded disabled:opacity-50"
                    >
                      {p.name}
                    </button>
                    {confirmDelete === p.name ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void deletePreset(p.name)}
                        title="Click again to confirm delete"
                        aria-label={`Confirm delete preset "${p.name}"`}
                        className="h-7 w-7 text-status-error hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setConfirmDelete(p.name);
                          setTimeout(() => {
                            setConfirmDelete((cur) => (cur === p.name ? null : cur));
                          }, 2500);
                        }}
                        title="Delete preset"
                        aria-label={`Delete preset "${p.name}"`}
                        className="h-7 w-7 text-muted-foreground/80 hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </GlassAccordion>
    </div>
  );
}
