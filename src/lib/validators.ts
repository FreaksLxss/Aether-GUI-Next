import { z } from "zod";
import type { ConnectionProfile } from "@/types/connection";
import { defaultConnectionProfile, supportsFirewallMark } from "./profile-defaults";

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

// URL's IPv6 parser canonicalizes equivalent spellings. Require brackets and
// reject DNS names, zone IDs and IPv4 shorthand before using it.
function canonicalIp(host: string): string | null {
  if (isValidIPv4(host)) return host;
  if (!host.startsWith("[") || !host.endsWith("]") || !host.includes(":")) return null;
  if (!/^\[[0-9a-fA-F:.]+\]$/.test(host)) return null;
  if (host.includes(".") && !isValidIPv4(host.slice(host.lastIndexOf(":") + 1, -1))) return null;
  try {
    const ip = new URL(`http://${host}/`).hostname;
    // Match Rust IpAddr::to_canonical for IPv4-mapped IPv6.
    const mapped = ip.match(/^\[::ffff:([0-9a-f]+):([0-9a-f]+)\]$/);
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return ip;
  } catch { return null; }
}

export function numericSocket(value: string): { ip: string; port: number } | null {
  const v = value.trim();
  const match = v.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
  if (!match || !isValidPort(match[2])) return null;
  const ip = canonicalIp(match[1]);
  return ip ? { ip, port: Number(match[2]) } : null;
}

function validPeers(value: string | null, allowAuto: boolean): boolean {
  const v = value?.trim();
  if (!v || (allowAuto && v.toLowerCase() === "auto")) return true;
  const entries = v.split(",").map(numericSocket);
  return entries.length <= 2 && entries.every((e) => e !== null)
    && new Set(entries.map((e) => e?.ip)).size === entries.length;
}

// ── zod schemas ──────────────────────────────────────────────────────
const socketMessage = "Use numeric IP:port (bracket IPv6), port 1–65535";
export const bindAddressSchema = z.string().refine((v) => numericSocket(v) !== null, socketMessage);
export const httpProxyAddressSchema = z.string().nullable().refine(
  (v) => !v?.trim() || numericSocket(v) !== null, socketMessage,
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

export const wiwPeersSchema = z.string().nullable().refine(
  (v) => validPeers(v, false),
  "Provide one or two numeric IP:port endpoints with different IP addresses",
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
export const mimPeersSchema = z.string().nullable().refine(
  (v) => validPeers(v, true),
  "Use 'auto' or one or two numeric IP:port endpoints with different IP addresses",
);

export const fwMarkSchema = z
  .string()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v === "") return true;
      const t = v.trim();
      if (/^0x[0-9a-f]+$/i.test(t)) {
        try { const n = parseInt(t.slice(2), 16); return n >= 0 && n <= 0xffffffff; } catch { return false; }
      }
      if (!/^\d+$/.test(t)) return false;
      const n = Number(t);
      return Number.isInteger(n) && n >= 0 && n <= 4294967295;
    },
    { message: "Mark must be 0..4294967295 or 0x hex" },
  );

export const engineTorBindSchema = httpProxyAddressSchema;

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
  if (!Number.isInteger(v)) return "Must be an integer";
  if (v < 0) return "Must be ≥ 0";
  if (v > 10000) return "Must be ≤ 10000";
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

const profileShape = z
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
    engine_tor_mode: z.enum(["disabled", "tor", "tor-reverse", "tor-only", "tor_reverse", "tor_only"])
      .transform((v) => v === "tor_reverse" ? "tor-reverse" as const : v === "tor_only" ? "tor-only" as const : v),
    engine_tor_bind: z.string().nullable(),
    engine_tor_dir: z.string().nullable(),
    engine_tor_bridges: z.array(z.string()),
    engine_tor_force_bridges: z.boolean(),
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

// Old imports must contain the three original choices; later fields receive
// the same defaults as serde. Explicit null/invalid values are never replaced.
export const connectionProfileSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { protocol: _protocol, scan_mode: _scan, ip_version: _ip, ...defaults } = defaultConnectionProfile();
  void _protocol; void _scan; void _ip;
  return { ...defaults, ...value };
}, profileShape);

export const LEGACY_BRIDGES_MESSAGE = "Legacy Tor bridges-file setting is unsupported. Paste bridge lines into Manual bridges, then clear the legacy file setting. No file has been read.";

export function validateUint32(value: number | null): string | null {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= 0xffffffff)
    ? null : "Must be an integer from 0 to 4294967295";
}

/** Shared active-field validation for Connect, presets and the advanced banner. */
export function validateActiveProfile(p: ConnectionProfile): string | null {
  if (p.engine_tor_bridges_file?.trim()) return LEGACY_BRIDGES_MESSAGE;
  const listeners: [string, string][] = [["bind_address", p.bind_address]];
  if (p.http_proxy_address?.trim()) listeners.push(["http_proxy_address", p.http_proxy_address]);
  if (p.engine_tor_mode === "tor" || p.engine_tor_mode === "tor-reverse") {
    listeners.push(["engine_tor_bind", p.engine_tor_bind?.trim() || "127.0.0.1:1820"]);
  }
  const parsed: { name: string; ip: string; port: number }[] = [];
  for (const [name, value] of listeners) {
    const addr = numericSocket(value);
    if (!addr) return `${name}: ${socketMessage}`;
    for (const other of parsed) {
      const sameFamily = addr.ip.startsWith("[") === other.ip.startsWith("[");
      if (addr.port === other.port && (addr.ip === other.ip
        || addr.ip === "[::]" || other.ip === "[::]"
        || (sameFamily && (addr.ip === "0.0.0.0" || other.ip === "0.0.0.0")))) {
        return `${name} conflicts with ${other.name}; choose separate listener addresses/ports`;
      }
    }
    parsed.push({ name, ...addr });
  }
  const warp = p.engine_tor_mode !== "tor-only";
  const masque = p.protocol === "auto" || p.protocol === "masque";
  if (p.engine_tor_mode === "tor-reverse" && !masque) {
    return "tor-reverse requires MASQUE (forces HTTP/2, incompatible with WireGuard/gool)";
  }
  const fieldChecks: [string, string | null][] = [
    ["wiw_peers", warp && p.protocol === "gool" ? validateWiwPeers(p.wiw_peers) : null],
    ["mim_peers", warp && masque && p.mim ? validateMimPeers(p.mim_peers) : null],
    ["fw_mark", supportsFirewallMark() ? validateFwMark(p.fw_mark) : null],
    ["route_sniff_ms", p.route_sniff ? validateRouteSniffMs(p.route_sniff_ms) : null],
  ];
  if (p.capture_mode !== "proxy") {
    const [ip, prefix, extra] = p.tun_address.split("/");
    const validIp = canonicalIp(ip.includes(":") ? `[${ip}]` : ip);
    if (!validIp || extra !== undefined || !/^\d+$/.test(prefix ?? "") || Number(prefix) > (ip.includes(":") ? 128 : 32)) {
      return "tun_address: use a valid IP/prefix";
    }
    if (!canonicalIp(p.tun_dns.includes(":") ? `[${p.tun_dns}]` : p.tun_dns)) return "tun_dns: invalid IP";
  }
  if (p.engine_tor_mode !== "disabled") {
    const manual = p.engine_tor_bridges.some((s) => s.trim());
    if ((p.engine_tor_force_bridges && (manual || p.engine_tor_no_bridges)) || (manual && p.engine_tor_no_bridges)) {
      return "Tor bridge policies conflict: choose automatic fallback, force automatic, manual lines, or disabled";
    }
    fieldChecks.push(["engine_tor_country", validateCountry(p.engine_tor_country)]);
  }
  // serde stores these as Option<u32>, including inactive saved values.
  for (const key of ["route_sniff_ms", "engine_tor_direct_secs", "engine_tor_stall_secs", "max_clients", "half_close_secs", "tcp_keepalive_secs", "tcp_connect_secs"] as const) {
    fieldChecks.push([key, validateUint32(p[key])]);
  }
  const failed = fieldChecks.find(([, error]) => error);
  return failed ? `${failed[0]}: ${failed[1]}` : null;
}

export function validateProfile(profile: unknown): string | null {
  const res = connectionProfileSchema.safeParse(profile);
  if (res.success) return validateActiveProfile(res.data);
  return res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
