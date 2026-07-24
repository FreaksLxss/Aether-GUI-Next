import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bookmark,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useConnectionStore } from "@/state/connectionStore";
import type { ConnectionProfile } from "@/types/connection";

interface ProfilePreset {
  name: string;
  profile: ConnectionProfile;
  created_at: number;
}

export function ProfilePresets() {
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
  const [open, setOpen] = useState(false);
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
    await invoke("delete_preset", { name });
    await loadPresets();
  };

  return (
    <div className="w-full">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary rounded-md">
          <Bookmark size={14} />
          Presets
          <span className="text-[10px] text-muted-foreground/60">
            ({presets.length})
          </span>
          <ChevronDown
            size={14}
            className="transition-transform duration-150 data-[state=open]:rotate-180"
            data-state={open ? "open" : "closed"}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-1 data-[state=open]:duration-150 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-1 data-[state=closed]:duration-100">
          <div className="flex flex-col gap-1.5 pb-2">
            {/* Save current as preset */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Preset name…"
                disabled={locked}
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePreset();
                }}
                className="h-8 flex-1 rounded-md bg-black/20 px-2 text-xs text-foreground ring-1 ring-white/10 outline-none placeholder:text-muted-foreground/50 focus-visible:ring-primary disabled:opacity-50"
              />
              <button
                onClick={savePreset}
                disabled={locked || !newName.trim()}
                className="flex h-8 cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <Plus size={12} />
                Save
              </button>
            </div>

            {presets.length === 0 ? (
              <p className="py-1 text-center text-xs text-status-idle">
                No presets saved yet.
              </p>
            ) : (
              presets.map((p) => (
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
                  <button
                    onClick={() => void deletePreset(p.name)}
                    className="ml-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
