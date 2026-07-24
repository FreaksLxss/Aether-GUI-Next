import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useConnectionStore } from "@/state/connectionStore";
import { cn } from "@/lib/utils";
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
  const status = useConnectionStore((s) => s.status);

  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [newName, setNewName] = useState("");
  const locked = status.state !== "Idle" && status.state !== "Error";

  const loadPresets = async () => {
    const list = await invoke<ProfilePreset[]>("get_presets");
    setPresets(list);
  };

  useEffect(() => {
    if (open) loadPresets();
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
  };

  const savePreset = async () => {
    const name = newName.trim();
    if (!name) return;
    await invoke("save_preset", { name, profile });
    setNewName("");
    await loadPresets();
  };

  const deletePreset = async (name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return;
    await invoke("delete_preset", { name });
    await loadPresets();
  };

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
            <Bookmark size={13} />
            Presets
            <span className="text-[10px] text-muted-foreground/60">
              ({presets.length})
            </span>
            <ChevronDown
              size={13}
              className="ml-auto transition-transform duration-150 data-[state=open]:rotate-180"
              data-state={open ? "open" : "closed"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-150">
            <Separator className="bg-white/5" />
            <div className="flex flex-col gap-1.5 px-3 pt-2 pb-2.5">
              <div className="flex gap-1.5">
                <Input
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
                <div className="flex flex-col items-center gap-1.5 py-3 text-status-idle">
                  <Bookmark size={16} className="opacity-40" />
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void deletePreset(p.name)}
                          className="h-7 w-7 text-muted-foreground/60 hover:text-destructive"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
