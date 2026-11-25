import type { ComponentPropsWithRef } from "react";

export interface InputProps extends ComponentPropsWithRef<"input"> {
  hasError?: boolean;
}

export function Input({ hasError = false, className = "", ...props }: InputProps) {
  const classes = [
    "block w-full rounded-lg border bg-pf-surface px-3 py-2 text-sm text-pf-text",
    "placeholder:text-pf-muted transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary",
    "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-pf-muted",
    hasError ? "border-pf-error" : "border-pf-border",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <input aria-invalid={hasError || undefined} className={classes} {...props} />;
}
