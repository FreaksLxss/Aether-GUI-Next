/** International (flag) to display name for the leak-check panel. Kept as a
 * curated common set — anything unknown falls back to showing the ISO code,
 * which is what the ipinfo API actually guarantees. */
const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AL: "Albania",
  AM: "Armenia", AR: "Argentina", AT: "Austria", AU: "Australia",
  AZ: "Azerbaijan", BA: "Bosnia & Herzegovina", BD: "Bangladesh", BE: "Belgium",
  BG: "Bulgaria", BH: "Bahrain", BO: "Bolivia", BR: "Brazil", BY: "Belarus",
  CA: "Canada", CH: "Switzerland", CL: "Chile", CN: "China", CO: "Colombia",
  CR: "Costa Rica", CY: "Cyprus", CZ: "Czechia", DE: "Germany", DK: "Denmark",
  DO: "Dominican Rep.", DZ: "Algeria", EC: "Ecuador", EE: "Estonia", EG: "Egypt",
  ES: "Spain", ET: "Ethiopia", FI: "Finland", FR: "France", GB: "United Kingdom",
  GE: "Georgia", GR: "Greece", GT: "Guatemala", HK: "Hong Kong", HN: "Honduras",
  HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel",
  IN: "India", IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy", JM: "Jamaica",
  JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KR: "South Korea", KW: "Kuwait", KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon",
  LK: "Sri Lanka", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MD: "Moldova", ME: "Montenegro", MK: "North Macedonia",
  MM: "Myanmar", MN: "Mongolia", MY: "Malaysia", NG: "Nigeria", NL: "Netherlands",
  NO: "Norway", NP: "Nepal", NZ: "New Zealand", OM: "Oman", PA: "Panama",
  PE: "Peru", PH: "Philippines", PK: "Pakistan", PL: "Poland", PR: "Puerto Rico",
  PT: "Portugal", PY: "Paraguay", QA: "Qatar", RO: "Romania", RS: "Serbia",
  RU: "Russia", SA: "Saudi Arabia", SE: "Sweden", SG: "Singapore", SI: "Slovenia",
  SK: "Slovakia", SV: "El Salvador", SY: "Syria", TH: "Thailand", TR: "Turkey",
  TW: "Taiwan", UA: "Ukraine", UY: "Uruguay", US: "United States", UZ: "Uzbekistan",
  VE: "Venezuela", VN: "Vietnam", YE: "Yemen", ZA: "South Africa", ZW: "Zimbabwe",
};

/** ISO-3166 alpha-2 → flag emoji via regional indicator symbols. */
export function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  const base = 0x1f1e6 - 0x41;
  return String.fromCodePoint(
    base + code.charCodeAt(0),
    base + code.charCodeAt(1),
  );
}

export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}