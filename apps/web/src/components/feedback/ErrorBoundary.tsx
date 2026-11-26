import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorState } from "./ErrorState";

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches unexpected React rendering and lifecycle errors within its subtree
 * and displays a safe recovery view without exposing internal stack traces.
 *
 * Note: React error boundaries do not catch asynchronous rejections or errors
 * thrown inside event handlers; future API and interaction failures must be
 * handled explicitly by feature state or shared API utilities.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Intentionally omit raw error details from the rendered UI.
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 py-12">
          <ErrorState
            title="Unexpected workspace error"
            message="PaperForge encountered an unexpected display error. Reload the view to continue working."
            actionLabel="Reload view"
            onRetry={this.handleReset}
            className="w-full"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
