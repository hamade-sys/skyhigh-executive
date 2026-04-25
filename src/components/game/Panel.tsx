"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui";

export interface PanelProps {
  title: string;
  subtitle?: string;
  /** Width tier: narrow (for overview/news), wide (for tables) */
  width?: "narrow" | "wide";
  children: ReactNode;
  actions?: ReactNode;
}

export function Panel({
  title,
  subtitle,
  width = "narrow",
  children,
  actions,
}: PanelProps) {
  const close = useUi((s) => s.closePanel);

  return (
    <aside
      className={cn(
        // z-50 puts the panel above the Leaflet map (which creates a
        // stacking context at z-0) AND above the topbar (z-40).
        // Modal dialogs use the native top layer so they still cover this.
        "fixed top-16 bottom-3 right-3 z-50 flex flex-col",
        "rounded-xl border border-line bg-surface/95 backdrop-blur-md",
        "shadow-[0_24px_60px_-16px_rgba(16,37,63,0.25),0_8px_20px_-8px_rgba(16,37,63,0.12)]",
        "animate-[panel-in_220ms_var(--ease-out-quart)]",
        width === "narrow" ? "w-[min(480px,calc(100vw-5.5rem))]" : "w-[min(780px,calc(100vw-5.5rem))]",
      )}
    >
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-line">
        <div className="min-w-0">
          <h2 className="font-display text-[1.5rem] text-ink leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[0.8125rem] text-ink-muted mt-1 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            onClick={close}
            aria-label="Close panel"
            className="w-8 h-8 rounded-md flex items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink transition-colors"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>
    </aside>
  );
}
