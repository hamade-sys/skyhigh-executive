"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of `children` if the 3-D viewer throws. */
  fallback: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Local error boundary for the 3-D aircraft viewer.
 *
 * A WebGL context loss (common on older laptops, or when the GPU drops
 * the context), a corrupt/unreachable `.glb`, or any render error inside
 * the React-Three-Fiber Canvas would otherwise bubble up to the
 * route-level error.tsx and replace the ENTIRE game canvas with a
 * full-page error screen. That is a wildly disproportionate failure for
 * a plane preview hiccup — in a live workshop it looks like the game
 * crashed.
 *
 * This boundary catches the error in place and falls back to the flat
 * 2-D image, so a model failure quietly degrades instead of taking down
 * the session.
 */
export class Viewer3DBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(
      "[Aircraft3DViewer] render failed — falling back to 2D:",
      error,
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
