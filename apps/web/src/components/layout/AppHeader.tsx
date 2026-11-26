import { BookOpen, Menu, X } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import { Link, NavLink } from "react-router";

import { APP_ROUTES, NAVIGATION_ITEMS } from "../../app/navigation";
import { Badge } from "../ui/Badge";

export interface AppHeaderProps {
  isMobileNavOpen: boolean;
  toggleButtonRef?: RefObject<HTMLButtonElement | null>;
  onToggleMobileNav: () => void;
  onCloseMobileNav: () => void;
  onSelectMobileNavItem: () => void;
  onEscapeMobileNav: () => void;
}

export function AppHeader({
  isMobileNavOpen,
  toggleButtonRef,
  onToggleMobileNav,
  onCloseMobileNav,
  onSelectMobileNavItem,
  onEscapeMobileNav,
}: AppHeaderProps) {
  const handleMobileNavKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && isMobileNavOpen) {
      event.preventDefault();
      onEscapeMobileNav();
    }
  };

  return (
    <header className="border-b border-pf-border bg-pf-surface">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            ref={toggleButtonRef}
            type="button"
            onClick={onToggleMobileNav}
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-navigation"
            aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex items-center justify-center rounded-lg border border-pf-border bg-pf-surface p-2 text-pf-text hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary lg:hidden"
          >
            {isMobileNavOpen ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>

          <Link
            to={APP_ROUTES.dashboard}
            onClick={onCloseMobileNav}
            className="flex items-center gap-2 rounded-lg text-base font-semibold tracking-tight text-pf-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary lg:hidden"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-pf-primary text-white">
              <BookOpen aria-hidden="true" className="h-4 w-4" />
            </span>
            <span>PaperForge</span>
          </Link>

          <p className="hidden text-sm font-medium text-pf-muted lg:block">
            Educational Authoring Workspace
          </p>
        </div>

        <Badge variant="neutral">Local prototype</Badge>
      </div>

      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        aria-hidden={!isMobileNavOpen}
        hidden={!isMobileNavOpen}
        onKeyDown={handleMobileNavKeyDown}
        className={[
          "border-t border-pf-sidebar-border bg-pf-sidebar px-3 py-3 lg:hidden",
          isMobileNavOpen ? "block" : "hidden",
        ].join(" ")}
      >
        <div className="space-y-1">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.end}
                tabIndex={isMobileNavOpen ? undefined : -1}
                onClick={onSelectMobileNavItem}
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
        </div>
      </nav>
    </header>
  );
}
