import { useEffect, useRef } from "react";
import { Activity, Network, RefreshCcw, Terminal } from "lucide-react";
import { useIpChangerStore } from "@/stores/ipChangerStore";
import { StatusIndicator } from "@/components/ip-changer/StatusIndicator";
import { IpDisplay } from "@/components/ip-changer/IpDisplay";
import { RotationControls } from "@/components/ip-changer/RotationControls";
import { ProxyEndpointSettings, IpProxyToggle } from "@/components/ip-changer/ProxyEndpointSettings";
import { TorEngineSource } from "@/components/ip-changer/TorEngineSource";
import { AutoRotateSettings } from "@/components/ip-changer/AutoRotateSettings";
import { LogViewer } from "@/components/ip-changer/LogViewer";
import { Section } from "@/components/ui/panel-section";

export function IpChangerContent() {
  const openedRef = useRef(false);
  useEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      void useIpChangerStore.getState().refreshAll();
    }
    let poll: ReturnType<typeof setInterval> | null = null;
    const makePoll = (ms: number) => {
      if (poll) clearInterval(poll);
      poll = setInterval(() => void useIpChangerStore.getState().refreshIp(), ms);
    };
    makePoll(document.hidden ? 30000 : 10000);
    const onVis = () => makePoll(document.hidden ? 30000 : 10000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (poll) clearInterval(poll);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 overflow-hidden">
      <Section title="Status" icon={Activity}>
        <StatusIndicator />
        <IpDisplay />
        <RotationControls />
      </Section>

      <Section title="Proxy" icon={Network}>
        <ProxyEndpointSettings />
        <IpProxyToggle />
        <TorEngineSource />
      </Section>

      <Section title="Auto-rotate" icon={RefreshCcw}>
        <AutoRotateSettings />
      </Section>

      <Section title="Logs" icon={Terminal}>
        <LogViewer />
      </Section>
    </div>
  );
}

// Back-compat shim
export function IpChangerPanel(props: { open: boolean; onToggle: () => void }) {
  void props;
  return <IpChangerContent />;
}
