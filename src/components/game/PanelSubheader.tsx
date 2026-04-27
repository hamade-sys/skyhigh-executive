"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PanelSubheaderProps {
  /** Subheader content — typically a tab strip, filter chips, or
   *  a "showing X of Y" summary toolbar. Should be a single row of
   *  controls; vertical layouts compete with the panel header. */
  children: ReactNode;
  /** When true, applies a stronger blur backdrop so subheader content
   *  reads cleanly over scrolled-past rows. Default true. */
  blur?: boolean;
  className?: string;
}

/**
 * Sticky-at-top subheader for use inside <Panel>'s scrollable body.
 *
 * Why this exists: panels with long lists (Routes, Fleet, Investments,
 * SlotMarket) had tab strips and filter chips that scrolled out of
 * view as soon as the player moved past the top, forcing them to
 * scroll back to switch view. PanelSubheader pins those controls to
 * the top of the scroll region.
 *
 * Implementation note: the parent <Panel> uses `overflow-auto` on its
 * body div, which makes `position: sticky; top: 0` honour the body's
 * scroll context (not the viewport). The body also has `px-6 py-5`,
 * so the subheader uses negative margins to extend full-width and
 * its own padding to maintain the visual gutter.
 */
export function PanelSubheader({
  children,
  blur = true,
  className,
}: PanelSubheaderProps) {
  return (
    <div
      className={cn(
        // Negative top/horizontal margins pull the bar to the body's
        // scroll edges so the backdrop covers fully when content
        // scrolls beneath. Padding restores the inner gutter.
        "sticky top-[-1.25rem] -mx-6 -mt-5 px-6 py-3 mb-3 z-10 border-b border-line",
        blur ? "bg-surface/85 backdrop-blur-md" : "bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}
