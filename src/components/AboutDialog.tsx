import { useState } from "react";
import { Info, ExternalLink, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { motion, AnimatePresence } from "motion/react";

export function AboutDialog() {
  const [open_, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        title="About Aether-GUI"
      >
        <Info size={10} />
        About
      </button>

      <AnimatePresence>
        {open_ && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-80 rounded-lg bg-surface-1 p-5 ring-1 ring-white/10"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    Aether-GUI
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    v0.5.0
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                A one-click desktop GUI for the{" "}
                <span className="text-foreground">Aether</span>{" "}
                censorship-circumvention tunnel.
              </p>

              <div className="mt-4 flex flex-col gap-1.5">
                <button
                  onClick={() =>
                    void open("https://github.com/MatinSenPai/Aether-GUI")
                  }
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink size={10} />
                  Aether-GUI on GitHub
                </button>
                <button
                  onClick={() =>
                    void open("https://github.com/CluvexStudio/Aether")
                  }
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink size={10} />
                  Aether engine on GitHub
                </button>
                <button
                  onClick={() =>
                    void open("https://github.com/FreaksLxss/Aether-GUI-Remake")
                  }
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink size={10} />
                  Further Improvements
                </button>
              </div>

              <p className="mt-4 text-[10px] text-muted-foreground/60">
                Licensed under AGPL v3.0
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
