import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/state/connectionStore";
import { validateBindAddress } from "@/lib/validators";

const DEFAULT_PORT = "1819";
const LOOPBACK = "127.0.0.1";
const ANY = "0.0.0.0";

function splitAddr(addr: string): { host: string; port: string } {
  const last = addr.lastIndexOf(":");
  if (last === -1) return { host: LOOPBACK, port: addr || DEFAULT_PORT };
  return { host: addr.slice(0, last) || LOOPBACK, port: addr.slice(last + 1) || DEFAULT_PORT };
}

export function BindAddressField({ id }: { id?: string }) {
  const bind = useConnectionStore((s) => s.profile.bind_address);
  const setBindAddress = useConnectionStore((s) => s.setBindAddress);
  const status = useConnectionStore((s) => s.status);
  const locked = status.state !== "Idle" && status.state !== "Error";
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { host, port } = splitAddr(bind);
  const lan = host === ANY;

  const rebuild = (h: string, p: string) => setBindAddress(`${h}:${p || DEFAULT_PORT}`);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={port}
          disabled={locked}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
            rebuild(host, v);
            if (invalid) {
              setInvalid(false);
              setError(null);
              if (timerRef.current) clearTimeout(timerRef.current);
            }
          }}
          onBlur={() => {
            const n = Number(port);
            const full = `${host}:${port || DEFAULT_PORT}`;
            const msg = validateBindAddress(full);
            const portInvalid = !port || n < 1 || n > 65535;
            if (portInvalid || msg) {
              if (portInvalid) rebuild(host, DEFAULT_PORT);
              const display = msg ?? "Invalid port";
              setError(display);
              setInvalid(true);
              if (timerRef.current) clearTimeout(timerRef.current);
              timerRef.current = setTimeout(() => {
                setInvalid(false);
                setError(null);
              }, 2500);
            }
          }}
          className={`h-9 w-20 rounded-xl bg-black/20 text-center font-mono text-[11px] ring-1 ring-inset ${
            invalid
              ? "ring-status-error focus-visible:ring-status-error"
              : "ring-white/[0.07] focus-visible:ring-primary"
          }`}
          aria-label="SOCKS5 port"
          aria-invalid={invalid}
          aria-describedby={invalid ? "bind-error" : undefined}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Allow connections from the LAN</span>
          <Switch
            checked={lan}
            onCheckedChange={(on) => rebuild(on ? ANY : LOOPBACK, port)}
            disabled={locked}
            aria-label="Allow connections from the LAN"
          />
        </div>
      </div>
      {invalid && error && (
        <p id="bind-error" className="text-[11px] text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
