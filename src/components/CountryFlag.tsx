import { Globe } from "lucide-react";

// Local SVG URLs keep flags independent of OS fonts without bundling every flag as React code.
const flags = import.meta.glob<string>(
  "/node_modules/country-flag-icons/3x2/*.svg",
  { eager: true, query: "?url&no-inline", import: "default" },
);

/** Decorative flag: the adjacent location text supplies the country name. */
export function CountryFlag({ code }: { code: string | null | undefined }) {
  const normalized = code?.trim().toUpperCase();
  const src = normalized && /^[A-Z]{2}$/.test(normalized)
    ? flags[`/node_modules/country-flag-icons/3x2/${normalized}.svg`]
    : undefined;

  if (!src) return <Globe size={12} className="shrink-0" aria-hidden="true" />;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={18}
      height={12}
      className="h-3 w-[18px] shrink-0 rounded-[3px] object-contain"
    />
  );
}
