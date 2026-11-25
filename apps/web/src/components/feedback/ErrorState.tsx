import { AlertCircle } from "lucide-react";

import { Button } from "../ui/Button";

export interface ErrorStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Unable to complete request",
  message,
  actionLabel = "Try again",
  onRetry,
  className = "",
}: ErrorStateProps) {
  const classes = ["rounded-xl border border-red-200 bg-pf-error-soft p-6", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="alert" className={classes}>
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-pf-error" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-sm font-semibold text-pf-error">{title}</h2>
          <p className="text-sm text-pf-text">{message}</p>
          {onRetry ? (
            <div className="pt-1">
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
