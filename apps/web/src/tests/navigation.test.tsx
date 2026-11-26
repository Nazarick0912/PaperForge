import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../app/App";

function renderApp(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Application navigation and routing", () => {
  it("renders the dashboard heading, live backend status, no duplicate pending shell copy, and all four module links", async () => {
    renderApp(["/"]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create learning materials" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });

    expect(screen.queryByText(/backend pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend integration pending/i)).not.toBeInTheDocument();

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
    async ({ path, navLabel, heading, plannedSnippet }) => {
      renderApp(["/"]);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
      });

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

  it("displays the Not Found page for unknown routes and recovers to the dashboard", async () => {
    renderApp(["/non-existent-module"]);

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();

    const recoveryLink = screen.getByRole("link", { name: /return to dashboard/i });
    expect(recoveryLink).toHaveAttribute("href", "/");

    fireEvent.click(recoveryLink);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create learning materials" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });

    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primaryNav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps mobile navigation mounted when collapsed, prevents focus on hidden links, and moves focus to main content on selection", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });

    const toggleButton = screen.getByRole("button", { name: "Open navigation menu" });
    const controlledId = toggleButton.getAttribute("aria-controls");
    expect(controlledId).toBe("mobile-navigation");
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");

    // Controlled element stays mounted in the DOM even while collapsed
    const collapsedNav = document.getElementById("mobile-navigation");
    expect(collapsedNav).not.toBeNull();
    expect(collapsedNav).toHaveAttribute("hidden");
    expect(collapsedNav).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();

    // Links inside collapsed mobile nav must not be keyboard-tabbable
    const collapsedLinks = collapsedNav?.querySelectorAll("a") ?? [];
    expect(collapsedLinks.length).toBeGreaterThan(0);
    for (const link of collapsedLinks) {
      expect(link).toHaveAttribute("tabindex", "-1");
    }

    fireEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(mobileNav).not.toHaveAttribute("hidden");
    expect(mobileNav).toHaveAttribute("aria-hidden", "false");

    const slideLink = within(mobileNav).getByRole("link", { name: "Slide Generator" });
    expect(slideLink).not.toHaveAttribute("tabindex", "-1");
    slideLink.focus();
    expect(document.activeElement).toBe(slideLink);

    fireEvent.click(slideLink);

    expect(
      screen.getByRole("heading", { level: 1, name: "Modular Slide Deck Generator" }),
    ).toBeInTheDocument();
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("mobile-navigation")).toHaveAttribute("hidden");

    const mainContent = screen.getByRole("main");
    expect(mainContent).toHaveAttribute("id", "main-content");
    expect(mainContent).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(mainContent);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("closes mobile navigation on Escape and restores focus to the toggle button", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });

    const toggleButton = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(toggleButton);

    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    const examLink = within(mobileNav).getByRole("link", { name: "Exam Generator" });
    examLink.focus();

    fireEvent.keyDown(examLink, { key: "Escape" });

    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("mobile-navigation")).toHaveAttribute("hidden");
    expect(document.activeElement).toBe(toggleButton);
  });

  it("moves focus to the main content landmark via the skip-to-main-content link", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");

    fireEvent.click(skipLink);

    const mainContent = screen.getByRole("main");
    expect(document.activeElement).toBe(mainContent);
  });
});
