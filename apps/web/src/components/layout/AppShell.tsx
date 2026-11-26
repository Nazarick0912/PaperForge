import { useRef, useState } from "react";
import { Outlet } from "react-router";

import { AppHeader } from "./AppHeader";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const mobileToggleButtonRef = useRef<HTMLButtonElement | null>(null);

  const focusMainContent = () => {
    mainRef.current?.focus();
  };

  const handleSelectMobileNavItem = () => {
    setIsMobileNavOpen(false);
    focusMainContent();
  };

  const handleEscapeMobileNav = () => {
    setIsMobileNavOpen(false);
    mobileToggleButtonRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen bg-pf-bg text-pf-text">
      <a
        href="#main-content"
        onClick={focusMainContent}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-pf-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          isMobileNavOpen={isMobileNavOpen}
          toggleButtonRef={mobileToggleButtonRef}
          onToggleMobileNav={() => setIsMobileNavOpen((open) => !open)}
          onCloseMobileNav={() => setIsMobileNavOpen(false)}
          onSelectMobileNavItem={handleSelectMobileNavItem}
          onEscapeMobileNav={handleEscapeMobileNav}
        />

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
