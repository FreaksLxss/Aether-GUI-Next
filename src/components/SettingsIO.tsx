import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Download, Upload } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConnectionStore } from "@/state/connectionStore";
import { syncCloseChoice } from "@/lib/close";
import { connectionProfileSchema, validateActiveProfile } from "@/lib/validators";
import type { ConnectionProfile } from "@/types/connection";

interface SettingsExport {
  version: number;
  profile: ConnectionProfile;
  presets: { name: string; profile: ConnectionProfile }[];
  settings: Record<string, unknown>;
}

const SETTING_COMMANDS: Record<string, (v: boolean) => Promise<unknown>> = {
  close_to_tray: (v) => invoke("set_close_to_tray", { enabled: v }).then(() => syncCloseChoice(v)),
  always_on_top: (v) => invoke("set_always_on_top", { enabled: v }),
  minimize_on_startup: (v) => invoke("set_minimize_on_startup", { enabled: v }),
};

type DiffRow = { key: string; before: string; after: string; kind: "added" | "changed" | "removed" };

function buildDiff(
  imported: SettingsExport,
  current: { profile: ConnectionProfile; presets: { name: string; profile: ConnectionProfile }[]; settings: Record<string, unknown> },
): DiffRow[] {
  const rows: DiffRow[] = [];
  const curProfile = current.profile as unknown as Record<string, unknown>;
  const impProfile = imported.profile as unknown as Record<string, unknown>;
  if (imported.profile) {
    for (const k of new Set([...Object.keys(curProfile), ...Object.keys(impProfile)])) {
      const a = curProfile[k];
      const b = impProfile[k];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (a === undefined) rows.push({ key: `profile.${k}`, before: "—", after: JSON.stringify(b), kind: "added" });
      else if (b === undefined) rows.push({ key: `profile.${k}`, before: JSON.stringify(a), after: "—", kind: "removed" });
      else rows.push({ key: `profile.${k}`, before: JSON.stringify(a), after: JSON.stringify(b), kind: "changed" });
    }
  }
  if (Array.isArray(imported.presets)) {
    const curNames = new Set(current.presets.map((p) => p.name));
    for (const p of imported.presets) {
      if (!curNames.has(p.name)) rows.push({ key: `preset:${p.name}`, before: "—", after: "new preset", kind: "added" });
    }
  }
  if (imported.settings) {
    for (const [k, v] of Object.entries(imported.settings)) {
      const cur = current.settings[k];
      if (JSON.stringify(cur) === JSON.stringify(v)) continue;
      rows.push({ key: `setting:${k}`, before: JSON.stringify(cur ?? "—"), after: JSON.stringify(v), kind: cur === undefined ? "added" : "changed" });
    }
  }
  return rows;
}

export function SettingsIO() {
  const reloadProfile = useConnectionStore((s) => s.reloadProfile);
  const [pendingData, setPendingData] = useState<SettingsExport | null>(null);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const pendingApplyRef = useRef<SettingsExport | null>(null);

  const handleExport = async () => {
    try {
      const [profile, presets, closeToTray, alwaysOnTop, minimizeOnStartup] = await Promise.all([
        invoke<ConnectionProfile>("get_default_profile"),
        invoke<{ name: string; profile: ConnectionProfile }[]>("get_presets"),
        invoke<boolean>("get_close_to_tray"),
        invoke<boolean>("get_always_on_top"),
        invoke<boolean>("get_minimize_on_startup"),
      ]);
      const data: SettingsExport = {
        version: 1,
        profile,
        presets,
        settings: { close_to_tray: closeToTray, always_on_top: alwaysOnTop, minimize_on_startup: minimizeOnStartup },
      };
      const path = await save({
        defaultPath: "aether-gui-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await invoke("write_file", { path, contents: JSON.stringify(data, null, 2) });
        toast.success("Settings exported");
      }
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!selected) return;
      const contents = await invoke<string>("read_file", { path: selected });
      const data = JSON.parse(contents) as SettingsExport;

      const normalize = (value: unknown): ConnectionProfile => {
        const profile = connectionProfileSchema.parse(value);
        const error = validateActiveProfile(profile);
        if (error) throw new Error(error);
        return profile;
      };
      if (data.profile) data.profile = normalize(data.profile);
      if (Array.isArray(data.presets)) {
        data.presets = data.presets.map((preset) => ({ ...preset, profile: normalize(preset.profile) }));
      }

      try {
        const [curProfile, curPresets, curClose, curTop, curMin] = await Promise.all([
          invoke<ConnectionProfile>("get_default_profile"),
          invoke<{ name: string; profile: ConnectionProfile }[]>("get_presets"),
          invoke<boolean>("get_close_to_tray").catch(() => undefined as unknown as boolean),
          invoke<boolean>("get_always_on_top").catch(() => undefined as unknown as boolean),
          invoke<boolean>("get_minimize_on_startup").catch(() => undefined as unknown as boolean),
        ]);
        const current = {
          profile: curProfile,
          presets: curPresets,
          settings: { close_to_tray: curClose, always_on_top: curTop, minimize_on_startup: curMin },
        };
        const rows = buildDiff(data, current);
        if (rows.length > 0) {
          setDiffRows(rows);
          pendingApplyRef.current = data;
          setPendingData(data);
          setShowDiff(true);
          return;
        }
      } catch {
      }
      await applyImport(data);
    } catch (e) {
      toast.error(`Import failed: ${String(e)}`);
    }
  };

  const applyImport = async (data: SettingsExport) => {
    const snapshot = structuredClone(useConnectionStore.getState().profile);
    try {
      if (data.profile) {
        await invoke("set_default_profile", { profile: data.profile });
        await reloadProfile();
      }
      if (Array.isArray(data.presets)) {
        for (const p of data.presets) {
          if (p?.name) await invoke("save_preset", { name: p.name, profile: p.profile });
        }
      }
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          const apply = SETTING_COMMANDS[key];
          if (apply && typeof value === "boolean") await apply(value);
        }
      }
      toast.success("Settings imported", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await invoke("set_default_profile", { profile: snapshot });
              await reloadProfile();
              toast.success("Reverted");
            } catch (e) {
              toast.error(String(e));
            }
          },
        },
      });
    } catch (e) {
      toast.error(`Import failed: ${String(e)}`);
    }
  };

  return (
    <>
      <div className="flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleExport()}
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          title="Export settings"
        >
          <Download size={10} />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleImport()}
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          title="Import settings"
        >
          <Upload size={10} />
          Import
        </Button>
      </div>

      <Dialog open={showDiff} onOpenChange={setShowDiff}>
        <DialogContent className="max-h-[70vh] max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm">Import preview</DialogTitle>
            <DialogDescription className="text-xs">Review what will change before applying.</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-[35px] border border-border p-2">
            {diffRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No changes detected.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {diffRows.slice(0, 80).map((r) => (
                  <li
                    key={r.key}
                    className={`flex flex-col gap-0.5 rounded-[26px] px-2 py-1.5 text-[11px] ${r.kind === "added" ? "bg-emerald-500/10" : r.kind === "removed" ? "bg-red-500/10" : "bg-white/5"}`}
                  >
                    <span className="font-mono text-[11px] font-medium text-foreground">{r.key}</span>
                    <span className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      <span className="text-red-400/70 line-through">{r.before}</span> → <span className="text-emerald-400/80">{r.after}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowDiff(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                setShowDiff(false);
                const d = pendingApplyRef.current ?? pendingData;
                if (d) await applyImport(d);
                setPendingData(null);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
