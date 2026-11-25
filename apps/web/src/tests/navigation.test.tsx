import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "../app/App";

function renderApp(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

describe("Application navigation and routing", () => {
  it("renders the dashboard heading, status message, and all four module links", () => {
    renderApp(["/"]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create learning materials" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/backend api integration/i)).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: /open exam generator/i })).toHaveAttribute(
      "href",
      "/exam",
    );
    expect(within(main).getByRole("link", { name: /open quiz generator/i })).toHaveAttribute(
      "href",
      "/quiz",
    );
    expect(within(main).getByRole("link", { name: /open assessment editor/i })).toHaveAttribute(
      "href",
      "/editor",
    );
    expect(within(main).getByRole("link", { name: /open slide generator/i })).toHaveAttribute(
      "href",
      "/slides",
    );
  });

  it.each([
    {
      path: "/exam",
      navLabel: "Exam Generator",
      heading: "Exam Question Paper Generator",
      plannedSnippet: /exam blueprint extraction/i,
    },
    {
      path: "/quiz",
      navLabel: "Quiz Generator",
      heading: "Interactive Source-Based Quiz Generator",
      plannedSnippet: /cognitive-level guidance/i,
    },
    {
      path: "/editor",
      navLabel: "Assessment Editor",
      heading: "Unified Assessment Editor",
      plannedSnippet: /a4 preview/i,
    },
    {
      path: "/slides",
      navLabel: "Slide Generator",
      heading: "Modular Slide Deck Generator",
      plannedSnippet: /pptx export/i,
    },
  ])(
    "navigates to $path, renders $heading, and marks only that sidebar route active",
    ({ path, navLabel, heading, plannedSnippet }) => {
      renderApp(["/"]);

      const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
      const dashboardLink = within(primaryNav).getByRole("link", { name: "Dashboard" });
      expect(dashboardLink).toHaveAttribute("aria-current", "page");

      const targetLink = within(primaryNav).getByRole("link", { name: navLabel });
      fireEvent.click(targetLink);

      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
      expect(within(screen.getByRole("list")).getByText(plannedSnippet)).toBeInTheDocument();
      expect(targetLink).toHaveAttribute("aria-current", "page");
      expect(dashboardLink).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute("href", "/");
      expect(targetLink).toHaveAttribute("href", path);
    },
  );

  it("displays the Not Found page for unknown routes and recovers to the dashboard", () => {
    renderApp(["/non-existent-module"]);

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();

    const recoveryLink = screen.getByRole("link", { name: /return to dashboard/i });
    expect(recoveryLink).toHaveAttribute("href", "/");

    fireEvent.click(recoveryLink);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create learning materials" }),
    ).toBeInTheDocument();
    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primaryNav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("toggles collapsible mobile navigation with accessible expanded state semantics", () => {
    renderApp(["/"]);

    const toggleButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(mobileNav).toBeInTheDocument();

    fireEvent.click(within(mobileNav).getByRole("link", { name: "Slide Generator" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Modular Slide Deck Generator" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
  });
});
