"use client";

import { useToasts, type ToastKind } from "@/store/toasts";
import { cn } from "@/lib/cn";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  CircleX,
  Sparkles,
  X,
} from "lucide-react";

const KIND_META: Record<
  ToastKind,
  { Icon: typeof Info; bg: string; border: string; tint: string }
> = {
  info: {
    Icon: Info,
    bg: "bg-surface",
    border: "border-line",
    tint: "text-info",
  },
  success: {
    Icon: CheckCircle2,
    bg: "bg-surface",
    border: "border-[var(--positive-soft)]",
    tint: "text-positive",
  },
  warning: {
    Icon: AlertTriangle,
    bg: "bg-surface",
    border: "border-[var(--warning-soft)]",
    tint: "text-warning",
  },
  negative: {
    Icon: CircleX,
    bg: "bg-surface",
    border: "border-[var(--negative-soft)]",
    tint: "text-negative",
  },
  accent: {
    Icon: Sparkles,
    bg: "bg-surface",
    border: "border-[var(--accent-soft-2)]",
    tint: "text-accent",
  },
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  // Cap visible toasts at 6. Anything older spills off-stack but is still
  // captured in the persistent Notification Center (bell icon in TopBar).
  // Quarter-close events frequently fire 8-10 toasts at once and we don't
  // want to flood the screen.
  const visible = toasts.slice(-6);
  const overflow = toasts.length - visible.length;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-[380px] pointer-events-none"
      aria-live="polite"
    >
      {overflow > 0 && (
        <div className="pointer-events-auto rounded-md border border-line bg-surface/95 backdrop-blur-md px-3 py-1.5 text-label text-ink-muted self-end shadow-[var(--shadow-2)]">
          +{overflow} more in <strong className="text-ink">Notifications</strong>
        </div>
      )}
      {visible.map((t) => {
        const meta = KIND_META[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-lg border shadow-[var(--shadow-3)]",
              "px-4 py-3 flex items-start gap-3",
              "backdrop-blur-md",
              "animate-[toast-in_220ms_var(--ease-out-quart)]",
              meta.bg,
              meta.border,
            )}
          >
            <meta.Icon size={18} className={cn("shrink-0 mt-0.5", meta.tint)} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink text-body-lg leading-tight">
                {t.title}
              </div>
              {t.detail && (
                <div className="text-body text-ink-2 mt-0.5 leading-relaxed">
                  {t.detail}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1 -mt-1 w-6 h-6 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
