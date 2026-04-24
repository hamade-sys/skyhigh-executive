"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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
  const router = useRouter();
  const params = useSearchParams();

  function close() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("panel");
    const q = sp.toString();
    router.push(q ? `/?${q}` : "/");
  }

  return (
    <aside
      className={cn(
        "pointer-events-auto fixed top-20 bottom-3 right-3 z-30 flex flex-col",
        "rounded-xl border border-line bg-surface/95 backdrop-blur shadow-[var(--shadow-4)]",
        "animate-[fade-in_180ms_var(--ease-out-quart)]",
        width === "narrow" ? "w-[min(440px,calc(100vw-5rem))]" : "w-[min(720px,calc(100vw-5rem))]",
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
        <div>
          <h2 className="font-display text-[1.375rem] text-ink leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[0.8125rem] text-ink-muted mt-0.5 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            onClick={close}
            aria-label="Close panel"
            className="w-8 h-8 rounded-md flex items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink"
          >
            <span className="text-[1.25rem] leading-none">×</span>
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">{children}</div>
    </aside>
  );
}
