import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "⌘K / Ctrl+K", desc: "Search everything" },
  { keys: "Ctrl+Shift+C", desc: "Connect / Disconnect" },
  { keys: "Esc", desc: "Close panel or palette" },
  { keys: "?  ·  ⌘/ ", desc: "Open this help" },
  { keys: "Enter", desc: "Connect when idle" },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("aether:open-shortcuts", onOpen as EventListener);
    return () => window.removeEventListener("aether:open-shortcuts", onOpen as EventListener);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs">Quick reference for Aether-GUI.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 py-1">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.06]">
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <kbd className="rounded bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
