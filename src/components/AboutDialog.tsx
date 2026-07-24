import { useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function AboutDialog() {
  const [open_, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 px-1.5 text-[10px] text-muted-foreground/60"
        title="About Aether-GUI"
      >
        <Info size={10} />
        About
      </Button>

      <Dialog open={open_} onOpenChange={setOpen}>
        <DialogContent className="w-80 gap-0">
          <DialogHeader>
            <DialogTitle className="text-sm">Aether-GUI</DialogTitle>
            <DialogDescription className="text-xs">v0.8.0</DialogDescription>
          </DialogHeader>

          <DialogDescription className="mt-3 text-xs leading-relaxed text-muted-foreground">
            A one-click desktop GUI for the{" "}
            <span className="text-foreground">Aether</span>{" "}
            censorship-circumvention tunnel.
          </DialogDescription>

          <Separator className="my-3 bg-white/5" />

          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void open("https://github.com/MatinSenPai/Aether-GUI")}
              className="h-7 justify-start gap-1.5 px-1.5 text-xs text-muted-foreground"
            >
              <ExternalLink size={10} />
              Aether-GUI on GitHub
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void open("https://github.com/CluvexStudio/Aether")}
              className="h-7 justify-start gap-1.5 px-1.5 text-xs text-muted-foreground"
            >
              <ExternalLink size={10} />
              Aether engine on GitHub
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void open("https://github.com/FreaksLxss/Aether-GUI-Remake")}
              className="h-7 justify-start gap-1.5 px-1.5 text-xs text-muted-foreground"
            >
              <ExternalLink size={10} />
              Further Improvements
            </Button>
          </div>

          <p className="mt-4 text-[10px] text-muted-foreground/60">
            Licensed under AGPL v3.0
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
