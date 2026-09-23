import { toast as sonner } from "sonner";
import { cue } from "@/lib/sound";

export const toast = Object.assign(
  (...args: Parameters<typeof sonner>) => sonner(...args),
  {
    success: (...args: Parameters<typeof sonner.success>) => {
      cue("success");
      return sonner.success(...args);
    },
    error: (...args: Parameters<typeof sonner.error>) => {
      cue("error");
      return sonner.error(...args);
    },
    info: sonner.info,
    warning: sonner.warning,
    loading: sonner.loading,
    message: sonner.message,
    promise: sonner.promise,
    custom: sonner.custom,
    dismiss: sonner.dismiss,
  },
);