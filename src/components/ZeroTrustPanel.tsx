import { type ReactNode } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStore } from "@/state/connectionStore";

/** Aether ≥1.5.0: Zero Trust (WARP for organizations) enrolment settings.
 *  `--team <name>` enrols as a managed device. The access fields are three
 *  mutually-exclusive sign-in methods; the matching flag is only emitted when
 *  its value is set (see ConnectionProfile::as_args). */
export function ZeroTrustPanel() {
  const p = useConnectionStore((s) => s.profile);
  const setTeam = useConnectionStore((s) => s.setZtTeam);
  const setEmail = useConnectionStore((s) => s.setZtAccessEmail);
  const setId = useConnectionStore((s) => s.setZtAccessId);
  const setSecret = useConnectionStore((s) => s.setZtAccessSecret);
  const setToken = useConnectionStore((s) => s.setZtAccessToken);
  const setGateway = useConnectionStore((s) => s.setZtGateway);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";

  return (
    <div className="flex flex-col gap-2.5">
      <Field label="Team name" tooltip="Your organization's Zero Trust team name (--team). Aether enrols this device into that organization. Leave empty for normal anonymous WARP.">
        <Input
          type="text"
          value={p.zt_team ?? ""}
          disabled={locked}
          onChange={(e) => setTeam(e.target.value.trim() || null)}
          placeholder="your-org"
          className="h-9 bg-surface-3 text-[10px] font-mono ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
        />
      </Field>

      <Field label="Email one-time code" tooltip="Send a one-time sign-in code to this address (--access-email). Aether prompts for the code after startup.">
        <Input
          type="email"
          value={p.zt_access_email ?? ""}
          disabled={locked}
          onChange={(e) => setEmail(e.target.value.trim() || null)}
          placeholder="you@org.com"
          className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
        />
      </Field>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Field label="Access id" tooltip="--access-id: service-token client id for headless enrolment.">
            <Input
              type="text"
              value={p.zt_access_id ?? ""}
              disabled={locked}
              onChange={(e) => setId(e.target.value.trim() || null)}
              placeholder="client id"
              className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Access secret" tooltip="--access-secret: service-token client secret for headless enrolment.">
            <Input
              type="password"
              value={p.zt_access_secret ?? ""}
              disabled={locked}
              onChange={(e) => setSecret(e.target.value ? e.target.value : null)}
              placeholder="client secret"
              className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
            />
          </Field>
        </div>
      </div>

      <Field label="Access token (JWT)" tooltip="--access-token: an enrolment token already obtained from https://<team>.cloudflareaccess.com/warp.">
        <Input
          type="password"
          value={p.zt_access_token ?? ""}
          disabled={locked}
          onChange={(e) => setToken(e.target.value ? e.target.value : null)}
          placeholder="warp token"
          className="h-9 bg-surface-3 font-mono text-[10px] ring-1 ring-inset ring-white/5 focus-visible:ring-primary"
        />
      </Field>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Route through Gateway
          <Tooltip>
            <TooltipTrigger aria-label="About Zero Trust Gateway">
              <Info size={12} />
            </TooltipTrigger>
            <TooltipContent>
              Send HTTP/HTTPS through the organization's Gateway proxy so its filtering
              and logging apply (--gateway). Adds a hop inside the tunnel and logs your
              browsing — off by default.
            </TooltipContent>
          </Tooltip>
        </div>
        <Switch
          checked={p.zt_gateway}
          onCheckedChange={setGateway}
          disabled={locked}
          aria-label="Route through Gateway"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <Tooltip>
          <TooltipTrigger aria-label={`About ${label}`}>
            <Info size={12} />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  );
}