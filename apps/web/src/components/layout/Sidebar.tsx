import { BookOpen } from "lucide-react";
import { Link, NavLink } from "react-router";

import { APP_ROUTES, NAVIGATION_ITEMS } from "../../app/navigation";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-pf-sidebar-border bg-pf-sidebar text-slate-100 lg:flex">
      <div className="flex h-16 items-center border-b border-pf-sidebar-border px-5">
        <Link
          to={APP_ROUTES.dashboard}
          className="flex items-center gap-2.5 rounded-lg text-base font-semibold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pf-primary text-white">
            <BookOpen aria-hidden="true" className="h-4 w-4" />
          </span>
          <span>PaperForge</span>
        </Link>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-4">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  isActive
                    ? "bg-pf-primary text-white"
                    : "text-slate-300 hover:bg-pf-sidebar-hover hover:text-white",
                ].join(" ")
              }
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-pf-sidebar-border px-5 py-4">
        <p className="text-xs font-medium text-slate-200">Local development shell</p>
        <p className="mt-0.5 text-xs text-slate-400">Backend integration pending</p>
      </div>
    </aside>
  );
}
