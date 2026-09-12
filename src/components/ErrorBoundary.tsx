import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-status-error/20 bg-status-error/[0.06] px-4 py-8 text-center">
          <span className="flex size-9 items-center justify-center rounded-xl bg-status-error/15 text-status-error ring-1 ring-status-error/20">
            <AlertTriangle size={16} />
          </span>
          <p className="text-xs font-semibold text-foreground">Something went wrong</p>
          <p className="max-w-[28ch] break-words text-[11px] leading-relaxed text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            <RefreshCw size={12} /> Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
