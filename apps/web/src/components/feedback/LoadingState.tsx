import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "Loading workspace content...",
  className = "",
}: LoadingStateProps) {
  const classes = [
    "flex flex-col items-center justify-center gap-3 rounded-xl border border-pf-border bg-pf-surface px-6 py-10 text-center",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="status" aria-live="polite" className={classes}>
      <Loader2
        aria-hidden="true"
        className="h-6 w-6 animate-spin text-pf-primary motion-reduce:animate-none"
      />
      <p className="text-sm font-medium text-pf-text">{message}</p>
    </div>
  );
}
