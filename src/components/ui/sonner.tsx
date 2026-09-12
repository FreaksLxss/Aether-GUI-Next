import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  // Theme follows html.dark / html.light class; sonner reads data-theme but we delegate
  // to CSS vars so dark/light both look native. Position offset below TitleBar (32px).
  return (
    <SonnerToaster
      position="top-center"
      offset={40}
      theme="dark"
      richColors={false}
      closeButton
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          fontSize: "12px",
        },
        className: "shadow-[0_16px_32px_rgba(0,0,0,0.35)]",
      }}
    />
  );
}
