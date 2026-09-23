import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  group: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.trim();
  if (!q) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = text.split(re);
  const lower = q.toLowerCase();
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === lower ? (
          <mark key={i} className="rounded bg-primary/20 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function isWordBoundary(c: string) {
  return /[\s\-_/.:]/.test(c);
}
function scoreToken(hay: string, token: string): number {
  let score = 0;
  let lastIdx = -2;
  let hayPos = 0;
  let consec = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]!;
    const idx = hay.indexOf(ch, hayPos);
    if (idx === -1) return 0;
    let bonus = 0;
    if (idx === 0) bonus += 10;
    else if (isWordBoundary(hay[idx - 1]!)) bonus += 6;
    if (idx === lastIdx + 1) {
      consec++;
      bonus += 4 + Math.min(consec, 3) * 2;
    } else {
      if (lastIdx !== -2) score -= (idx - lastIdx - 1) * 0.6;
      consec = 0;
    }
    score += 10 + bonus;
    lastIdx = idx;
    hayPos = idx + 1;
  }
  if (hay.startsWith(token)) score += 6;
  return score;
}
function fuzzyScore(hay: string, query: string): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  let total = 0;
  for (const t of tokens) {
    const sc = scoreToken(hay, t);
    if (sc === 0) return 0;
    total += sc;
  }
  return total;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: PaletteItem[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const scored = items
      .map((it) => {
        const hay = `${it.label} ${it.hint ?? ""} ${it.keywords ?? ""} ${it.group}`.toLowerCase();
        const s = fuzzyScore(hay, q);
        return { it, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label));
    return scored.map((x) => x.it);
  }, [items, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const it of filtered) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (it: PaletteItem | undefined) => {
    if (!it) return;
    onOpenChange(false);
    requestAnimationFrame(() => {
      try {
        it.run();
      } catch (e) {
        toast.error(String(e));
      }
    });
  };

  const activeItem = filtered[active];
  const activeId = activeItem ? `palette-item-${active}` : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[max(0.75rem,4dvh)] translate-y-0 max-h-[min(72vh,560px)] w-[calc(100%-1.5rem)] max-w-[min(380px,calc(100%-1.5rem))] gap-0 overflow-hidden rounded-[var(--window-radius)] p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search settings, presets, actions…"
            className="h-11 flex-1 border-0 bg-transparent px-0 text-sm shadow-none ring-0 focus-visible:ring-0"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="palette-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!filtered.length) return;
                setActive((a) => (a + 1) % filtered.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!filtered.length) return;
                setActive((a) => (a - 1 + filtered.length) % filtered.length);
              } else if (e.key === "Home") {
                e.preventDefault();
                setActive(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setActive(filtered.length - 1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(activeItem);
              }
            }}
          />
          <kbd className="hidden rounded bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border sm:inline">
            ESC
          </kbd>
        </div>

        <div ref={listRef} id="palette-listbox" role="listbox" aria-label="Search results" className="max-h-[min(46vh,360px)] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches for "{query}".</p>
          ) : (
            <div className="flex flex-col gap-3 py-1">
              {groups.map(([group, list]) => (
                <div key={group} className="flex flex-col gap-0.5">
                  <span className="px-2 py-1 text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase">
                    {group}
                  </span>
                  {list.map((it) => {
                    const Icon = it.icon;
                    const flatIndex = filtered.indexOf(it);
                    const isActive = flatIndex === active;
                    return (
                      <button
                        key={it.id}
                        role="option"
                        id={`palette-item-${flatIndex}`}
                        aria-selected={isActive}
                        data-active={isActive ? "true" : undefined}
                        onClick={() => choose(it)}
                        onMouseEnter={() => setActive(flatIndex)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                          isActive ? "bg-foreground/[0.07] ring-1 ring-border" : "hover:bg-foreground/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md ring-1",
                            isActive ? "bg-foreground text-background ring-foreground/15" : "bg-surface-3 ring-border",
                          )}
                        >
                          <Icon size={13} className={isActive ? "text-background" : "text-muted-foreground"} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-none text-foreground">
                            <Highlight text={it.label} query={query} />
                          </span>
                          {it.hint && (
                            <span className="block truncate text-[10px] leading-none tracking-wide text-muted-foreground">
                              <Highlight text={it.hint} query={query} />
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2">
          <span className="text-[10px] tracking-wide text-muted-foreground">
            <kbd className="rounded bg-foreground/[0.08] px-1 py-0.5 font-mono ring-1 ring-border">↑↓</kbd> navigate ·{" "}
            <kbd className="rounded bg-foreground/[0.08] px-1 py-0.5 font-mono ring-1 ring-border">↵</kbd> open
          </span>
          <span className="text-[10px] text-muted-foreground/60">{filtered.length} results</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
