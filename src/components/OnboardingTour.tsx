import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConnectionStore } from "@/state/connectionStore";

const STEPS = [
  { title: "Hit Connect", desc: "Tap the big ring to start the tunnel. It scans for a working route automatically." },
  { title: "Fine-tune in Advanced", desc: "Pick protocol, scan mode, and routing rules in Advanced. Ideal when the default doesn't connect." },
  { title: "Press ⌘K to search", desc: "Every setting, action, and field is searchable. Try it now — ⌘K (or Ctrl+K)." },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const KEY = "aether:onboarded";
    if (localStorage.getItem(KEY) === "1") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const decide = async () => {
      // Existing users have history — never show, and mark so we never check again.
      const cur = useConnectionStore.getState().history;
      if (cur.length > 0) {
        localStorage.setItem(KEY, "1");
        return;
      }
      try {
        await useConnectionStore.getState().loadHistory();
      } catch {}
      if (cancelled) return;
      const after = useConnectionStore.getState().history;
      if (after.length > 0) {
        localStorage.setItem(KEY, "1");
        return;
      }
      if (localStorage.getItem(KEY) === "1") return;
      timer = setTimeout(() => {
        if (cancelled) return;
        // Persist immediately on first show so killing the app mid-tour
        // doesn't cause it to reappear every launch.
        localStorage.setItem(KEY, "1");
        setOpen(true);
      }, 900);
    };

    void decide();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem("aether:onboarded", "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {STEPS[step]?.title} — {step + 1} / {STEPS.length}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">{STEPS[step]?.desc}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-border"}`} />
          ))}
        </div>
        <DialogFooter className="gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => dismiss()}>
            Skip
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button size="sm" onClick={() => dismiss()}>
              Got it
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
