import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorBoundary } from "../components/feedback/ErrorBoundary";
import { ErrorState } from "../components/feedback/ErrorState";
import { LoadingState } from "../components/feedback/LoadingState";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Sensitive internal token xyz-999");
  }
  return <p>Healthy workspace content</p>;
}

describe("Shared feedback components", () => {
  it("renders LoadingState with accessible status semantics and custom text", () => {
    render(<LoadingState message="Preparing examination draft..." />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Preparing examination draft...");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders ErrorState with alert semantics and invokes recovery callback", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Unable to load draft"
        message="The draft could not be loaded right now. Please try again."
        actionLabel="Retry loading"
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Unable to load draft");
    expect(alert).toHaveTextContent("The draft could not be loaded right now. Please try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders EmptyState with supplied title and description", () => {
    render(
      <EmptyState
        title="No assessments yet"
        description="Generated exam drafts and formative quizzes will appear here once authoring workflows are connected."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "No assessments yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Generated exam drafts and formative quizzes will appear here once authoring workflows are connected.",
      ),
    ).toBeInTheDocument();
  });

  it("catches render errors in ErrorBoundary without exposing raw error details and supports reset", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    try {
      const { rerender } = render(
        <ErrorBoundary onReset={onReset}>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Unexpected workspace error");
      expect(alert).not.toHaveTextContent("Sensitive internal token xyz-999");

      rerender(
        <ErrorBoundary onReset={onReset}>
          <ThrowingChild shouldThrow={false} />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Reload view" }));
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Healthy workspace content")).toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
