import type { ComponentPropsWithRef } from "react";

export type CardProps = ComponentPropsWithRef<"div">;

export function Card({ className = "", ...props }: CardProps) {
  const classes = ["rounded-xl border border-pf-border bg-pf-surface shadow-xs", className]
    .filter(Boolean)
    .join(" ");

  return <div className={classes} {...props} />;
}

export function CardHeader({ className = "", ...props }: CardProps) {
  const classes = ["px-6 pt-6 pb-3", className].filter(Boolean).join(" ");
  return <div className={classes} {...props} />;
}

export function CardContent({ className = "", ...props }: CardProps) {
  const classes = ["px-6 py-4", className].filter(Boolean).join(" ");
  return <div className={classes} {...props} />;
}

export function CardFooter({ className = "", ...props }: CardProps) {
  const classes = ["px-6 pt-3 pb-6", className].filter(Boolean).join(" ");
  return <div className={classes} {...props} />;
}
