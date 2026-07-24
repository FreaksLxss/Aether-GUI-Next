import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function LogSearch({ value, onChange }: Props) {
  return (
    <div className="relative">
      <Search
        size={12}
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter logs…"
        className="h-7 w-full rounded-lg bg-surface-3 pl-7 pr-6 text-[10px] text-foreground ring-1 ring-inset ring-white/5 outline-none transition-all duration-150 placeholder:text-muted-foreground/50 hover:bg-surface-4 focus-visible:ring-primary"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
