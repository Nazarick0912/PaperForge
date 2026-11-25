import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className = "",
}: EmptyStateProps) {
  const classes = [
    "flex flex-col items-center justify-center rounded-xl border border-dashed border-pf-border bg-pf-surface px-6 py-10 text-center",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-pf-muted">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-pf-text">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-pf-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
