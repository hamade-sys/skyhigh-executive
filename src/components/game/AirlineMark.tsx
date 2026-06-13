"use client";

import { cn } from "@/lib/cn";
import { airlineColorFor, type AirlineColorId } from "@/lib/games/airline-colors";
import { airlineIconFor, type AirlineIconId } from "@/lib/games/airline-icons";

/**
 * The one airline brand mark (D-007).
 *
 * Every surface that shows an airline's identity — TopBar, leaderboard,
 * the team switcher, admin lists, the cohort reveal, the endgame podium —
 * used to hand-roll the same colored square with the IATA code in
 * `font-mono`. This consolidates them: a single mark, colored by the
 * airline's chosen color, that renders the airline's chosen Lucide
 * **logo** when it has one, and falls back to the **code letters** when it
 * doesn't (legacy saves, bots without an emblem, players who skipped the
 * picker). Same component, two faces — so adopting the logo never
 * regresses the old look.
 *
 * Sizing is numeric (px) rather than Tailwind classes so the icon, the
 * letters, and the corner radius all scale together from one `size` prop.
 */

interface AirlineMarkProps {
  /** IATA-ish code, shown as the fallback when no logo is chosen. */
  code: string;
  colorId?: AirlineColorId | null;
  iconId?: AirlineIconId | null;
  /** Team-stable string used to derive a deterministic color when
   *  `colorId` is missing (legacy rows), mirroring `airlineColorFor`. */
  fallbackKey?: string;
  /** Box edge length in px. Default 32 (the TopBar chip size). */
  size?: number;
  shape?: "rounded" | "circle";
  className?: string;
  /** When provided, the mark is announced to screen readers; otherwise it
   *  is decorative (`aria-hidden`) because the airline name sits beside it. */
  ariaLabel?: string;
  title?: string;
}

export function AirlineMark({
  code,
  colorId,
  iconId,
  fallbackKey,
  size = 32,
  shape = "rounded",
  className,
  ariaLabel,
  title,
}: AirlineMarkProps) {
  const color = airlineColorFor({ colorId, fallbackKey });
  const icon = airlineIconFor(iconId);
  const fg = color.textOn === "white" ? "#ffffff" : "#0f172a";
  const Icon = icon?.Icon;

  return (
    <span
      title={title}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={cn(
        "inline-flex items-center justify-center shrink-0 font-mono font-semibold leading-none tabular-nums",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: shape === "circle" ? 9999 : Math.max(4, Math.round(size * 0.22)),
        background: color.hex,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.52)} strokeWidth={2.25} aria-hidden />
      ) : (
        code
      )}
    </span>
  );
}
