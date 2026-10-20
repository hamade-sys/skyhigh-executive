import { ArrowLeftRight, Ban, ChevronsUp, HandGrab, Lightbulb, SkipForward, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/trivia/codes";
import { TOOL_INFO } from "@/lib/trivia/content";
import type { ToolKind } from "@/lib/trivia/types";

export const TOOL_ICONS: Record<ToolKind, LucideIcon> = {
  steal: HandGrab,
  hint: Lightbulb,
  block: Ban,
  swap: ArrowLeftRight,
  skip: SkipForward,
  doubleDown: ChevronsUp,
};

export function ToolIcon({ tool, className }: { tool: ToolKind; className?: string }) {
  const Icon = TOOL_ICONS[tool];
  return <Icon className={className} aria-hidden />;
}

export function toolLabel(tool: ToolKind): string {
  return TOOL_INFO[tool].label;
}

/** A team's colour as a seal-like badge with its initials (colour never stands alone). */
export function TeamBadge({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-[30%] t-font font-extrabold text-slate-900", className)}
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

/** Pill with the team colour and name. */
export function TeamPill({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 font-semibold text-slate-900", className)} style={{ background: color }}>
      <span className="inline-block h-2 w-2 rounded-full bg-[#0b1d20]/40" aria-hidden />
      {name}
    </span>
  );
}

/** Row of remaining tools for a team (Competitive). */
export function ToolCounts({ tools, className, size = "sm" }: { tools: Record<ToolKind, number> | null; className?: string; size?: "sm" | "md" }) {
  if (!tools) return null;
  const kinds = (Object.keys(TOOL_ICONS) as ToolKind[]).filter((k) => tools[k] !== undefined);
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Tools left">
      {kinds.map((k) => (
        <li
          key={k}
          title={`${toolLabel(k)}: ${tools[k]} left`}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md tabular-nums",
            size === "sm" ? "px-1 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-sm",
            tools[k] > 0 ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-300 line-through",
          )}
        >
          <ToolIcon tool={k} className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
          {tools[k]}
          <span className="sr-only">{toolLabel(k)}</span>
        </li>
      ))}
    </ul>
  );
}
