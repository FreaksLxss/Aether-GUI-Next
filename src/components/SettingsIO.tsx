import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Download, Upload } from "lucide-react";
import type { ConnectionProfile } from "@/types/connection";

interface SettingsExport {
  version: number;
  profile: ConnectionProfile;
  presets: { name: string; profile: ConnectionProfile }[];
  settings: Record<string, unknown>;
}

export function SettingsIO() {
  const handleExport = async () => {
    try {
      const profile = await invoke<ConnectionProfile>("get_default_profile");
      const presets = await invoke<{ name: string; profile: ConnectionProfile }[]>("get_presets");
      const settings: Record<string, unknown> = {};
      for (const key of ["close_to_tray", "always_on_top", "minimize_on_startup"]) {
        settings[key] = await invoke<boolean>(`get_${key.replace(/_/g, "_")}`);
      }

      const data: SettingsExport = {
        version: 1,
        profile,
        presets,
        settings,
      };

      const path = await save({
        defaultPath: "aether-gui-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await invoke("write_file", {
          path,
          contents: JSON.stringify(data, null, 2),
        });
      }
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!selected) return;

      const contents = await invoke<string>("read_file", { path: selected });
      const data: SettingsExport = JSON.parse(contents);

      if (data.profile) {
        await invoke("set_default_profile", { profile: data.profile });
      }
      if (data.presets) {
        for (const p of data.presets) {
          await invoke("save_preset", { name: p.name, profile: p.profile });
        }
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExport}
        className="flex cursor-pointer items-center gap-1 rounded-md bg-black/20 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-black/30 hover:text-foreground"
        title="Export settings"
      >
        <Download size={10} />
        Export
      </button>
      <button
        onClick={handleImport}
        className="flex cursor-pointer items-center gap-1 rounded-md bg-black/20 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-black/30 hover:text-foreground"
        title="Import settings"
      >
        <Upload size={10} />
        Import
      </button>
    </div>
  );
}
