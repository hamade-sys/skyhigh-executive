"use client";

/**
 * Light-theme building blocks for the ICAN Trivia builder (hub, editor,
 * game setup). Deep ICAN teal (#02797F) carries white text at 5.2:1;
 * the bright #00C2CB is for accents only.
 */

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "primary" | "secondary" | "ghost" | "danger" | "yellow";

export const BuilderButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" | "lg"; busy?: boolean; icon?: ReactNode }
>(function BuilderButton({ tone = "secondary", size = "md", busy = false, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "min-h-10 px-4 text-sm",
        size === "lg" && "min-h-12 px-5 text-base",
        tone === "primary" && "bg-[#00C2CB] text-white hover:bg-[#009AA1]",
        tone === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        tone === "ghost" && "text-slate-700 hover:bg-slate-100",
        tone === "danger" && "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
        tone === "yellow" && "bg-[#F7E300] text-[#1a1a1a] hover:brightness-95",
        className,
      )}
      {...rest}
    >
      {/* The spinner takes the icon's place, or overlays the label — the button never changes size. */}
      {icon && <span className={cn("inline-flex", busy && "invisible")}>{icon}</span>}
      <span className={cn("inline-flex items-center gap-2", busy && !icon && "invisible")}>{children}</span>
      {busy && <Loader2 className={cn("h-4 w-4 animate-spin", icon ? "absolute left-4" : "absolute inset-0 m-auto")} aria-label="Working" />}
    </button>
  );
});

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm placeholder:text-slate-400 transition-colors focus:border-[#02797F] focus:outline-none";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
          {label}
        </label>
        {description && <p id={`${id}-desc`} className="text-sm text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-[#02797F]" : "bg-slate-300")}
      >
        <span className={cn("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} className="grid h-9 w-9 place-items-center text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label={`Decrease ${label}`}>
        −
      </button>
      <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-slate-900" aria-live="polite">
        {value === 0 && suffix === "s" ? "Off" : `${value}${suffix ?? ""}`}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} className="grid h-9 w-9 place-items-center text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

/**
 * Side panel (slide-over). Esc and the close button dismiss it; focus
 * moves into it on open and back to the trigger on close.
 */
export function SidePanel({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const t = window.setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button");
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/30" tabIndex={-1} />
      <div ref={ref} className={cn("relative flex h-full w-full flex-col bg-white shadow-2xl t-rise", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="t-font text-lg font-extrabold text-[#3a3a3a]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ message, action, onClose }: { message: string; action?: { label: string; onClick: () => void }; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, action ? 9000 : 4000);
    return () => window.clearTimeout(t);
  }, [onClose, action]);
  return (
    <div role="status" aria-live="polite" className="t-rise fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#1f2b2d] px-4 py-3 text-sm text-white shadow-2xl">
      <span>{message}</span>
      {action && (
        <button type="button" onClick={action.onClick} className="rounded-md px-2 py-1 font-bold text-[#F7E300] hover:bg-white/10">
          {action.label}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
