import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description: string;
  badge?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, badge, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-pf-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-pf-text">{title}</h1>
          {badge}
        </div>
        <p className="max-w-3xl text-sm leading-6 text-pf-muted">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
