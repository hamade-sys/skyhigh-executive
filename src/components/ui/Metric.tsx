import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type MetricProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Change vs previous period. Positive = good (green), negative = bad (red). */
  delta?: {
    value: number;
    format?: (n: number) => string;
  };
  /** Sparkline slot — pass any ReactNode (small chart component). */
  trend?: ReactNode;
};

function defaultDeltaFormat(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString()}`;
}

export function Metric({
  className,
  label,
  value,
  unit,
  delta,
  trend,
  ...rest
}: MetricProps) {
  const deltaTone =
    delta && delta.value > 0
      ? "text-positive"
      : delta && delta.value < 0
        ? "text-negative"
        : "text-ink-muted";

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...rest}>
      <div className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular font-display text-[1.75rem] leading-none text-ink">
          {value}
        </span>
        {unit && (
          <span className="text-[0.8125rem] text-ink-muted">{unit}</span>
        )}
      </div>
      {(delta || trend) && (
        <div className="flex items-center gap-3 pt-0.5">
          {delta && (
            <span
              className={cn(
                "tabular text-[0.75rem] font-medium",
                deltaTone,
              )}
            >
              {(delta.format ?? defaultDeltaFormat)(delta.value)}
            </span>
          )}
          {trend}
        </div>
      )}
    </div>
  );
}
