import { useState } from "react";
import { Package, PackageCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIpChangerStore } from "@/stores/ipChangerStore";

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
    <div className="flex flex-col gap-1.5">
      <div
        className="flex w-full items-center justify-between gap-2 rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] transition-opacity light:bg-black/[0.03] light:ring-black/[0.05]"
        title={running ? "Takes effect on next start" : undefined}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
          {engine.using_system ? <PackageCheck size={13} className="text-muted-foreground" /> : <Package size={13} className="text-muted-foreground" />}
          Tor core
        </div>
        <Switch
          checked={engine.using_system}
          onCheckedChange={toggle}
          disabled={running}
          aria-label="Run the system Tor package instead of the bundled app Tor"
        />
      </div>
      <p className="rounded-[35px] bg-white/[0.03] px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/70 ring-1 ring-white/[0.04] light:bg-black/[0.02] light:ring-black/[0.04]">
        {engine.using_system
          ? "Running the OS-provided Tor"
          : "Bundled with the app — switch to the system Tor if it fails here"}
        {engine.system_path ? ` (${engine.system_path})` : ""}
      </p>
      {warning && (
        <p className="rounded-[35px] bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/15">{warning}</p>
      )}
    </div>
  );
}
