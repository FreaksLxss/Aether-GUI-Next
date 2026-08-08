import { useEffect, useRef } from "react";
import { Globe } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { GlassAccordion } from "@/components/GlassAccordion";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { StatusIndicator } from "@/components/ip-changer/StatusIndicator";
import { IpDisplay } from "@/components/ip-changer/IpDisplay";
import { RotationControls } from "@/components/ip-changer/RotationControls";
import { ProxyEndpointSettings, IpProxyToggle } from "@/components/ip-changer/ProxyEndpointSettings";
import { TorEngineSource } from "@/components/ip-changer/TorEngineSource";
import { AutoRotateSettings } from "@/components/ip-changer/AutoRotateSettings";
import { LogViewer } from "@/components/ip-changer/LogViewer";

/**
 * IP Changer — a self-contained Tor subprocess that rotates the user's
 * public egress IP on demand or on a schedule. Lives inside the Options
 * stack as a GlassAccordion, exactly like the other panels.
 */
export function IpChangerPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  // Re-sync the section's state each time it opens, and keep the exit IP
  // fresh while visible so the displayed address tracks the actual circuit.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!openedRef.current) {
      openedRef.current = true;
      void useIpChangerStore.getState().refreshAll();
    }
    const poll = setInterval(() => {
      void useIpChangerStore.getState().refreshIp();
    }, 10_000);
    return () => clearInterval(poll);
  }, [open]);

  return (
    <div className="w-full">
      <GlassAccordion
        icon={Globe}
        label="IP Changer"
        open={open}
        onToggle={onToggle}
      >
        <div className="flex flex-col gap-2.5">
          <StatusIndicator />
          <IpDisplay />
          <RotationControls />

          <Separator className="bg-border" />
          <ProxyEndpointSettings />
          <IpProxyToggle />
          <TorEngineSource />

          <Separator className="bg-border" />
          <AutoRotateSettings />

          <Separator className="bg-border" />
          <LogViewer />
        </div>
      </GlassAccordion>
    </div>
  );
}