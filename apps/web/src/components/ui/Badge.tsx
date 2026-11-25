import type { ComponentPropsWithRef } from "react";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "error";

export interface BadgeProps extends ComponentPropsWithRef<"span"> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  primary: "border-indigo-200 bg-pf-primary-soft text-pf-primary",
  success: "border-green-200 bg-pf-success-soft text-pf-success",
  warning: "border-amber-200 bg-pf-warning-soft text-pf-warning",
  error: "border-red-200 bg-pf-error-soft text-pf-error",
};

export function Badge({ variant = "neutral", className = "", ...props }: BadgeProps) {
  const classes = [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
    VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} {...props} />;
}
