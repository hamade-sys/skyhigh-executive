"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches engine + render crashes that would otherwise leave the user with
 * a frozen, unclickable UI (the most common path: a runtime error during
 * a state-mutating click handler that React then suspends rendering on).
 *
 * Surfaces the error message + a "Reset simulation" button that wipes
 * persisted localStorage so the user can recover without devtools.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[SkyForce] caught render error:", error);
  }

  handleReset = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("skyforce-game-v1");
      } catch {
        /* noop */
      }
      window.location.href = "/";
    }
  };

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const err = this.state.error;
    if (!err) return this.props.children;

    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-xl text-center">
          <div className="text-[0.6875rem] uppercase tracking-[0.2em] text-negative mb-4">
            Runtime error
          </div>
          <h1 className="font-display text-3xl text-ink leading-tight mb-3">
            Something broke during the simulation.
          </h1>
          <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-2">
            Don&apos;t worry — your saved game is still on disk. Try retrying
            the action; if it keeps crashing, reset the simulation to wipe
            local state and start fresh.
          </p>
          <pre className="text-[0.75rem] text-ink-muted font-mono bg-surface-2 border border-line rounded-md p-3 mt-4 mb-5 text-left overflow-auto max-h-32">
            {err.message}
          </pre>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" size="lg" onClick={this.handleRetry}>
              Retry
            </Button>
            <Button variant="secondary" size="lg" onClick={this.handleReset}>
              Reset simulation
            </Button>
          </div>
        </div>
      </main>
    );
  }
}
