import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone =
  | "neutral"
  | "primary"
  | "accent"
  | "positive"
  | "negative"
  | "warning"
  | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  primary: "bg-[rgba(20,53,94,0.08)] text-primary border-[rgba(20,53,94,0.16)]",
  accent: "bg-[var(--accent-soft)] text-accent border-[var(--accent-soft-2)]",
  positive: "bg-[var(--positive-soft)] text-positive border-[var(--positive-soft)]",
  negative: "bg-[var(--negative-soft)] text-negative border-[var(--negative-soft)]",
  warning: "bg-[var(--warning-soft)] text-warning border-[var(--warning-soft)]",
  info: "bg-[var(--info-soft)] text-info border-[var(--info-soft)]",
};

export function Badge({ className, tone = "neutral", ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
        "text-[0.6875rem] font-medium tracking-wide uppercase",
        toneClass[tone],
        className,
      )}
      {...rest}
    />
  );
}
