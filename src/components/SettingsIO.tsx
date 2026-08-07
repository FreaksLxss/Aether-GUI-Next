import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/state/connectionStore";
import { syncCloseChoice } from "@/lib/close";
import type { ConnectionProfile } from "@/types/connection";

interface SettingsExport {
  version: number;
  profile: ConnectionProfile;
  presets: { name: string; profile: ConnectionProfile }[];
  settings: Record<string, unknown>;
}

type Notice = { kind: "success" | "error"; text: string } | null;

const SETTING_COMMANDS: Record<string, (v: boolean) => Promise<unknown>> = {
  close_to_tray: (v) =>
    invoke("set_close_to_tray", { enabled: v }).then(() => syncCloseChoice(v)),
  always_on_top: (v) => invoke("set_always_on_top", { enabled: v }),
  minimize_on_startup: (v) => invoke("set_minimize_on_startup", { enabled: v }),
};

export function SettingsIO() {
  const reloadProfile = useConnectionStore((s) => s.reloadProfile);
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const flushNotice = (n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  const handleExport = async () => {
    try {
      const profile = await invoke<ConnectionProfile>("get_default_profile");
      const presets = await invoke<{ name: string; profile: ConnectionProfile }[]>("get_presets");
      const settings: Record<string, unknown> = {};
      for (const key of ["close_to_tray", "always_on_top", "minimize_on_startup"]) {
        settings[key] = await invoke<boolean>(`get_${key}`);
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
        flushNotice({ kind: "success", text: "Settings exported." });
      }
    } catch (e) {
      console.error("Export failed:", e);
      flushNotice({ kind: "error", text: "Export failed." });
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
      const data = JSON.parse(contents) as SettingsExport;

      if (data.profile) {
        await invoke("set_default_profile", { profile: data.profile });
        await reloadProfile();
      }
      if (Array.isArray(data.presets)) {
        for (const p of data.presets) {
          if (p?.name) await invoke("save_preset", { name: p.name, profile: p.profile });
        }
      }
      // Restore the three window/tray preferences that export captured.
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          const apply = SETTING_COMMANDS[key];
          if (apply && typeof value === "boolean") {
            await apply(value);
          }
        }
      }
      flushNotice({ kind: "success", text: "Settings imported." });
    } catch (e) {
      console.error("Import failed:", e);
      flushNotice({ kind: "error", text: "Import failed." });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          className="h-7 gap-1 px-2 text-[10px] text-muted-foreground"
          title="Export settings"
        >
          <Download size={10} />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleImport}
          className="h-7 gap-1 px-2 text-[10px] text-muted-foreground"
          title="Import settings"
        >
          <Upload size={10} />
          Import
        </Button>
      </div>
      <AnimatePresence>
        {notice && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            role="status"
            className={
              notice.kind === "success" ? "text-[10px] text-status-connected" : "text-[10px] text-status-error"
            }
          >
            {notice.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
