import type { ComponentType, ReactNode } from "react";
import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DialogOverlay } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function PanelDialog({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        {/* Full-screen content so the ScrollArea viewport covers the whole window —
            wheel anywhere scrolls natively (no JS forwarding = no jank). */}
        <DialogPrimitive.Content
          data-slot="dialog-content"
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden border-0 bg-transparent p-0 shadow-none outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        >
          <ScrollArea viewportRef={viewportRef} className="flex min-h-0 flex-1 flex-col">
            {/* outer flex centers the column; clicking the empty gutter closes */}
            <div
              className="flex min-h-full flex-col items-center gap-3 px-4 pt-6 pb-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              }}
            >
              <div className="sticky top-0 z-10 flex w-full justify-center py-1">
                <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border-0 bg-card px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45),0_4px_12px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] light:border light:border-black/10 light:bg-white light:shadow-none">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
                    <Icon size={12} />
                  </span>
                  <DialogTitle className="shrink-0 text-xs font-semibold tracking-wide text-foreground">
                    {title}
                  </DialogTitle>
                  {description && (
                    <>
                      <span aria-hidden className="h-3 w-px shrink-0 bg-white/15 light:bg-black/10" />
                      <DialogDescription className="min-w-0 truncate text-[11px] leading-none text-muted-foreground">
                        {description}
                      </DialogDescription>
                    </>
                  )}
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className="ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-muted-foreground ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.12] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring light:bg-black/[0.06] light:ring-black/5 light:hover:bg-black/10"
                  >
                    <XIcon size={12} />
                  </DialogPrimitive.Close>
                </div>
              </div>
              <div className="flex w-full max-w-[min(420px,calc(100%-1.5rem))] flex-col gap-3">
                {children}
              </div>
            </div>
          </ScrollArea>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
