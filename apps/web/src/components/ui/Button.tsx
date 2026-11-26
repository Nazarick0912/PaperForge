import type { ComponentPropsWithRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-pf-primary text-white hover:bg-pf-primary-hover border border-transparent shadow-xs",
  secondary: "bg-pf-surface text-pf-text border border-pf-border hover:bg-slate-50 shadow-xs",
  ghost: "bg-transparent text-pf-text border border-transparent hover:bg-slate-100",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}
