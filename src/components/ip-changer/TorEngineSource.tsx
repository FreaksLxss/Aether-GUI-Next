import { useState } from "react";
import { Package, PackageCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";

/** Tor engine picker: run the app's bundled Tor, or the `tor` package the
 * OS itself provides (useful on Linux distros, where the app's copy can hit
 * filesystem quirks like AppImage mounts stripping the exec bit). Hidden on
 * machines where no system Tor is installed; takes effect on next start. */
export function TorEngineSource() {
  const running = useIpChangerStore((s) => s.status === "running");
  const engine = useIpChangerStore((s) => s.torEngine);
  const setTorEngine = useIpChangerStore((s) => s.setTorEngine);
  const [warning, setWarning] = useState<string | null>(null);

  if (!engine.system_available) return null;

  const toggle = async (useSystem: boolean) => {
    setWarning(null);
    const err = await setTorEngine(useSystem);
    if (err) setWarning(err);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-opacity duration-150"
        title={running ? "Takes effect on next start" : undefined}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {engine.using_system ? <PackageCheck size={12} /> : <Package size={12} />}
          Tor core
        </div>
        <Switch
          checked={engine.using_system}
          onCheckedChange={toggle}
          disabled={running}
          aria-label="Run the system Tor package instead of the bundled app Tor"
        />
      </div>
      <p className="pl-1.5 text-[10px] leading-tight text-muted-foreground/70">
        {engine.using_system
          ? "Running the OS-provided Tor"
          : "Bundled with the app — switch to the system Tor if it fails here"}
        {engine.system_path ? ` (${engine.system_path})` : ""}
      </p>
      {warning && (
        <p className="pl-1.5 text-[10px] leading-tight text-status-error">{warning}</p>
      )}
    </div>
  );
}