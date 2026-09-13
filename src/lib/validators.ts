import { z } from "zod";

// ── helpers ──────────────────────────────────────────────────────────

export const hostPortRegex = /^\S+:\d+$/;
export const hostRegex = /^\S+$/;

function isValidOctet(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= 0 && n <= 255 && String(n) === s;
}

export function isValidIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every(isValidOctet);
}

export function isValidPort(p: string): boolean {
  if (!/^\d+$/.test(p)) return false;
  const n = Number(p);
  return n >= 1 && n <= 65535;
}

function hostHasSpaces(s: string): boolean {
  return /\s/.test(s);
}

// ── zod schemas ──────────────────────────────────────────────────────

export const bindAddressSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+\.\d+:\d+$/, "Must be host:port")
  .refine(
    (v) => {
      const [host, port] = v.split(":");
      return isValidIPv4(host!) && isValidPort(port!);
    },
    { message: "Invalid IPv4 or port (1-65535)" },
  );

export const httpProxyAddressSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      if (hostHasSpaces(v)) return false;
      const colon = v.lastIndexOf(":");
      if (colon === -1) return false;
      const host = v.slice(0, colon);
      const port = v.slice(colon + 1);
      return host.length > 0 && isValidPort(port);
    },
    { message: "Must be host:port" },
  );

export const upstreamSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      if (hostHasSpaces(v)) return false;
      let rest = v;
      const schemeMatch = rest.match(/^(socks5h?:\/\/|https?:\/\/)/i);
      if (schemeMatch) rest = rest.slice(schemeMatch[0].length);
      const atIdx = rest.lastIndexOf("@");
      if (atIdx !== -1) rest = rest.slice(atIdx + 1);
      if (!rest) return false;
      if (rest.startsWith("[")) {
        const close = rest.indexOf("]");
        if (close === -1) return false;
        const portPart = rest.slice(close + 1);
        if (portPart && !/^:\d+$/.test(portPart)) return false;
        if (portPart && !isValidPort(portPart.slice(1))) return false;
        return true;
      }
      const colon = rest.lastIndexOf(":");
      if (colon !== -1) {
        const host = rest.slice(0, colon);
        const port = rest.slice(colon + 1);
        if (!host) return false;
        if (!isValidPort(port)) return false;
      } else {
        if (!rest) return false;
      }
      return true;
    },
    { message: "Invalid upstream proxy" },
  );

export const wiwPeersSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      const entries = v.split(",").map((s) => s.trim()).filter(Boolean);
      if (entries.length === 0) return true;
      for (const e of entries) {
        if (hostHasSpaces(e)) return false;
        const colon = e.lastIndexOf(":");
        if (colon === -1) return false;
        const host = e.slice(0, colon);
        const port = e.slice(colon + 1);
        if (!host) return false;
        if (!isValidPort(port)) return false;
      }
      return true;
    },
    { message: "Each peer must be host:port" },
  );

export const dnsServersSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      const tokens = v.split(",").map((s) => s.trim());
      for (const t of tokens) {
        if (t === "") continue;
        if (hostHasSpaces(t)) return false;
      }
      return true;
    },
    { message: "DNS entries must not contain spaces" },
  );

export const routeRuleSchema = z
  .string()
  .min(1, "Rule must not be empty")
  .refine((v) => !/\s/.test(v), {
    message: "Rules can't contain spaces — separate entries with commas or new lines.",
  });

export const ztTeamSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      return !hostHasSpaces(v);
    },
    { message: "Team name must not contain spaces" },
  );

// ── Aether ≥2.0.0 ─────────────────────────────────────────────
export const mimPeersSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      const t = v.trim();
      if (t.toLowerCase() === "auto") return true;
      const entries = t.split(",").map((s) => s.trim()).filter(Boolean);
      if (entries.length === 0) return true;
      for (const e of entries) {
        if (hostHasSpaces(e)) return false;
        if (e.toLowerCase() === "auto") return false;
        const colon = e.lastIndexOf(":");
        if (colon === -1) return false;
        const host = e.slice(0, colon);
        const port = e.slice(colon + 1);
        if (!host) return false;
        if (!isValidPort(port)) return false;
      }
      return true;
    },
    { message: "Each MiM peer must be host:port or 'auto'" },
  );

export const fwMarkSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      const t = v.trim();
      if (/^0x[0-9a-fA-F]+$/.test(t)) {
        try { const n = parseInt(t.slice(2), 16); return n >= 0 && n <= 0xffffffff; } catch { return false; }
      }
      if (!/^\d+$/.test(t)) return false;
      const n = Number(t);
      return Number.isInteger(n) && n >= 0 && n <= 4294967295;
    },
    { message: "Mark must be 0..4294967295 or 0x hex" },
  );

export const engineTorBindSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      if (hostHasSpaces(v)) return false;
      const colon = v.trim().lastIndexOf(":");
      if (colon === -1) return false;
      const host = v.trim().slice(0, colon);
      const port = v.trim().slice(colon + 1);
      return host.length > 0 && isValidPort(port);
    },
    { message: "Must be host:port" },
  );

export const countrySchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      return /^[A-Za-z]{2}$/.test(v.trim());
    },
    { message: "Country must be 2-letter code" },
  );

// ── imperative validators (return error string or null) ─────────────

export function validateBindAddress(v: string): string | null {
  const res = bindAddressSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid bind address";
}

export function validateUpstream(v: string | null): string | null {
  const res = upstreamSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid upstream proxy";
}

export function validateWiwPeers(v: string | null): string | null {
  const res = wiwPeersSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid WARP-in-WARP peers";
}

export function validateDnsServers(v: string | null): string | null {
  const res = dnsServersSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid DNS servers";
}

export function validateRouteRules(rules: string[]): string | null {
  for (const r of rules) {
    const res = routeRuleSchema.safeParse(r);
    if (!res.success) return res.error.issues[0]?.message ?? `"${r}" is invalid`;
  }
  return null;
}

export function validateZtTeam(v: string | null): string | null {
  const res = ztTeamSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid team name";
}

export function validateRouteSniffMs(v: number | null): string | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return "Must be a number";
  if (v < 0) return "Must be ≥ 0";
  if (v > 60000) return "Must be ≤ 60000";
  return null;
}

export function validateMimPeers(v: string | null): string | null {
  const res = mimPeersSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid MiM peers";
}
export function validateFwMark(v: string | null): string | null {
  const res = fwMarkSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid mark";
}
export function validateEngineTorBind(v: string | null): string | null {
  const res = engineTorBindSchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid Tor bind address";
}
export function validateCountry(v: string | null): string | null {
  const res = countrySchema.safeParse(v);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? "Invalid country";
}

// ── connectionProfileSchema for SettingsIO import ──────────────────

export const connectionProfileSchema = z
  .object({
    protocol: z.enum(["auto", "masque", "wireguard", "gool"]),
    scan_mode: z.enum(["turbo", "balanced", "thorough", "stealth", "ironclad"]),
    ip_version: z.enum(["v4", "v6", "both"]),
    quick_reconnect: z.boolean(),
    masque_http2: z.boolean(),
    masque_noize: z.enum(["firewall", "gfw", "light", "off"]),
    wg_noize: z.enum(["balanced", "aggressive", "light", "off"]),
    bind_address: z.string(),
    http_proxy_address: z.string().nullable(),
    upstream_proxy: z.string().nullable(),
    wiw_peers: z.string().nullable(),
    log_level: z.enum(["error", "warn", "info", "debug", "trace"]).nullable(),
    perf: z.enum(["low", "medium", "high"]).nullable(),
    capture_mode: z.enum(["proxy", "tun", "both"]),
    dns_mode: z.enum(["forward", "direct"]),
    tun_address: z.string(),
    tun_dns: z.string(),
    dns_servers: z.string().nullable(),
    route_block: z.array(z.string()),
    route_direct: z.array(z.string()),
    route_sniff: z.boolean(),
    route_sniff_ms: z.number().nullable(),
    auto_reprovision: z.boolean(),
    zt_team: z.string().nullable(),
    zt_access_email: z.string().nullable(),
    zt_access_id: z.string().nullable(),
    zt_access_secret: z.string().nullable(),
    zt_access_token: z.string().nullable(),
    zt_gateway: z.boolean(),
    mim: z.boolean(),
    mim_peers: z.string().nullable(),
    quic_v2: z.boolean(),
    fw_mark: z.string().nullable(),
    engine_tor_mode: z.enum(["disabled", "tor", "tor-reverse", "tor-only"]),
    engine_tor_bind: z.string().nullable(),
    engine_tor_dir: z.string().nullable(),
    engine_tor_bridges: z.array(z.string()),
    engine_tor_bridges_file: z.string().nullable(),
    engine_tor_no_bridges: z.boolean(),
    engine_tor_pt: z.string().nullable(),
    engine_tor_pt_dir: z.string().nullable(),
    engine_tor_country: z.string().nullable(),
    engine_tor_direct_secs: z.number().nullable(),
    engine_tor_stall_secs: z.number().nullable(),
    max_clients: z.number().nullable(),
    half_close_secs: z.number().nullable(),
    tcp_keepalive_secs: z.number().nullable(),
    tcp_connect_secs: z.number().nullable(),
  })
  .passthrough();

export function validateProfile(profile: unknown): string | null {
  const res = connectionProfileSchema.safeParse(profile);
  if (res.success) return null;
  return res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
