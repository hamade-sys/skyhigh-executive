"use client";

/**
 * Airline logo picker (D-007) — a grid of emblem tiles.
 *
 * Unlike the color picker there is no server claim and no taken-set:
 * emblems carry no uniqueness, so a click just fires `onChange` in both
 * solo and multiplayer flows. The leading tile is "Letters" (value
 * `null`) — the default, which keeps the airline's IATA code in the brand
 * mark exactly as before; the remaining 20 tiles are the Lucide emblems.
 *
 * The selected tile previews in the airline's chosen color, so the picker
 * shows the brand mark the way it will actually render across the app.
 *
 * Accessibility: a `radiogroup` of `radio` buttons with `aria-checked`;
 * each tile's aria-label names the emblem + airline.
 */

import type { ReactNode } from "react";
import { Type } from "lucide-react";
import {
  AIRLINE_ICON_SET,
  type AirlineIconId,
} from "@/lib/games/airline-icons";
import {
  airlineColorFor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { cn } from "@/lib/cn";

interface Props {
  /** Selected emblem id, or null for the "Letters" (code) default. */
  value: AirlineIconId | null;
  onChange: (id: AirlineIconId | null) => void;
  /** IATA code shown inside the "Letters" tile + as a fallback hint. */
  code?: string;
  /** Preview the selected tile in this airline color (WYSIWYG mark). */
  colorId?: AirlineColorId | null;
  /** Team-stable key for a deterministic preview color when colorId is unset. */
  fallbackKey?: string;
  airlineName?: string;
}

/** One emblem tile. Hoisted to module scope (not nested in the picker) so
 *  it isn't re-created on every render. */
function IconTile({
  selected,
  label,
  ariaLabel,
  onClick,
  colorHex,
  fg,
  children,
}: {
  selected: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  colorHex: string;
  fg: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      title={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex w-10 h-10 rounded-lg items-center justify-center shrink-0 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        selected
          ? "scale-105 ring-2 ring-offset-2 ring-offset-surface shadow-sm"
          : "bg-surface ring-1 ring-line text-ink-muted hover:ring-line-strong hover:text-ink hover:scale-105",
      )}
      style={
        selected
          ? { background: colorHex, color: fg, boxShadow: `0 0 0 2px ${colorHex}` }
          : undefined
      }
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function AirlineIconPicker({
  value,
  onChange,
  code = "",
  colorId,
  fallbackKey,
  airlineName,
}: Props) {
  const color = airlineColorFor({ colorId, fallbackKey });
  const fg = color.textOn === "white" ? "#ffffff" : "#0f172a";

  return (
    <div
      role="radiogroup"
      aria-label="Airline logo"
      className="flex flex-wrap items-center gap-2"
    >
      <IconTile
        selected={value === null}
        label="Letters"
        ariaLabel={`Use code letters${airlineName ? ` — ${airlineName}` : ""}`}
        onClick={() => onChange(null)}
        colorHex={color.hex}
        fg={fg}
      >
        {code ? (
          <span className="font-mono text-caption font-semibold tabular-nums leading-none">
            {code.slice(0, 3)}
          </span>
        ) : (
          <Type size={18} aria-hidden />
        )}
      </IconTile>

      {AIRLINE_ICON_SET.map((emblem) => {
        const Icon = emblem.Icon;
        return (
          <IconTile
            key={emblem.id}
            selected={value === emblem.id}
            label={emblem.label}
            ariaLabel={`${emblem.label} logo${airlineName ? ` — ${airlineName}` : ""}`}
            onClick={() => onChange(emblem.id)}
            colorHex={color.hex}
            fg={fg}
          >
            <Icon size={20} strokeWidth={2.25} aria-hidden />
          </IconTile>
        );
      })}
    </div>
  );
}
