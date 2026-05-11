"use client";

/**
 * Cohort Reveal — celebratory lineup card shown once after server-side
 * team seeding completes (just before the play canvas renders for the
 * first time). Each airline in the cohort gets a card with its
 * brand-color band, name + code, home hub city, and doctrine icon +
 * name. Cards stagger in (50ms apart) for a "starting grid" feel.
 *
 * Show-once-per-game-per-browser: the user sees this immediately after
 * the lobby flips to "playing", but if they reload the page mid-game
 * they shouldn't see it again. The durable preference is now stored
 * server-side; this module keeps a lightweight in-memory fast path so
 * the current tab doesn't need to refetch before continuing.
 *
 * Trigger: dropped between the "Loading game canvas…" placeholder
 * and the actual `<GameCanvas />` render in `/games/[id]/play/page.tsx`.
 */

import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import {
  AIRLINE_COLOR_BY_ID,
  airlineColorFor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { DOCTRINE_BY_ID, DOCTRINE_ICON_TINT } from "@/data/doctrines";
import { CITIES_BY_CODE } from "@/data/cities";
import type { Team } from "@/types/game";
import { cn } from "@/lib/cn";

interface Props {
  gameId: string;
  teams: Team[];
  /** Called when the user clicks "Begin simulation". The play page
   *  then re-renders without this overlay. */
  onContinue: () => void;
}

// In-memory set of gameIds whose reveal has been dismissed this
// session. No storage — the reveal shows once per page load, which
// is fine: multiplayer state comes from the server on every load.
const _seenThisSession = new Set<string>();

export function CohortReveal({ gameId, teams, onContinue }: Props) {
  // Stagger the entrance — cards fade-in 50ms apart so the player
  // can feel the lineup forming. Capped so even an 8-team cohort
  // finishes its reveal in under half a second; we don't want to
  // delay the CTA too long.
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (revealed >= teams.length) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), 60);
    return () => clearTimeout(t);
  }, [revealed, teams.length]);

  const allRevealed = revealed >= teams.length;

  // Sort teams: human player first (their team has isPlayer / a real
  // claimedBySessionId), then bots in seat order. This is mostly
  // cosmetic — the player wants to see their card first.
  const sortedTeams = [...teams].sort((a, b) => {
    const aHuman = a.controlledBy === "human" || a.isPlayer;
    const bHuman = b.controlledBy === "human" || b.isPlayer;
    if (aHuman && !bHuman) return -1;
    if (!aHuman && bHuman) return 1;
    return 0;
  });

  function continueAndRemember() {
    _seenThisSession.add(gameId);
    onContinue();
  }

  return (
    // Fixed-position overlay so the underlying GameCanvas can mount
    // and warm up while the player reads the lineup. When the user
    // clicks "Begin simulation", revealDismissed flips to true and
    // this overlay unmounts — the canvas underneath is already
    // rendered, so the transition feels instant instead of triggering
    // a fresh canvas mount.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cohort starting grid"
      className="fixed inset-0 z-[1300] overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white"
    >
      <div className="max-w-5xl mx-auto px-6 py-10 md:py-14">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-[0.6875rem] uppercase tracking-[0.28em] text-cyan-300/80 mb-3 font-semibold">
            Starting grid
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
            Meet your{" "}
            <span className="text-cyan-300">cohort</span>
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto text-sm md:text-[0.9375rem] leading-relaxed">
            {teams.length} airline{teams.length === 1 ? "" : "s"} on the
            map. Each carrier has chosen its hub and its strategic
            doctrine. The next 40 quarters decide who leads.
          </p>
        </div>

        {/* Card grid — staggered fade-in */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTeams.map((team, idx) => {
            const visible = idx < revealed;
            const color = airlineColorFor({
              colorId: team.airlineColorId as AirlineColorId | undefined,
              fallbackKey: team.id,
            });
            const isHuman = team.controlledBy === "human" || team.isPlayer;
            const hubCity = CITIES_BY_CODE[team.hubCode];
            const doctrine = DOCTRINE_BY_ID[team.doctrine] ?? DOCTRINE_BY_ID["premium-service"];
            const Icon = doctrine.Icon;
            const tint = DOCTRINE_ICON_TINT[doctrine.iconAccent];
            return (
              <div
                key={team.id}
                className={cn(
                  "rounded-2xl bg-white/5 backdrop-blur ring-1 ring-white/10 overflow-hidden",
                  "transition-all duration-300 ease-out",
                  visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 pointer-events-none",
                )}
                style={{ transitionDelay: `${idx * 30}ms` }}
              >
                {/* Top color band — full-width airline brand stripe. */}
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden
                />
                <div className="p-4 md:p-5">
                  {/* Header row — code chip, name, human/bot tag */}
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular"
                      style={{
                        backgroundColor: color.hex,
                        color: color.textOn === "white" ? "#ffffff" : "#0f172a",
                      }}
                    >
                      {team.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.9375rem] font-semibold text-white truncate">
                        {team.name}
                      </div>
                      <div className="text-[0.6875rem] uppercase tracking-wider text-slate-400 mt-0.5 font-semibold">
                        {isHuman ? "Human player" : `AI · ${team.botDifficulty ?? "medium"}`}
                      </div>
                    </div>
                  </div>

                  {/* Hub row */}
                  <div className="flex items-center gap-2 text-[0.8125rem] text-slate-300 mb-2.5">
                    <MapPin size={13} className="text-cyan-400 shrink-0" aria-hidden />
                    <span className="font-mono font-semibold text-white">{team.hubCode}</span>
                    <span className="text-slate-400 truncate">
                      · {hubCity?.name ?? "Unknown city"}
                    </span>
                  </div>

                  {/* Doctrine row — icon pad + name */}
                  <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2 border border-white/5">
                    <span
                      className={cn(
                        "shrink-0 w-7 h-7 rounded-md flex items-center justify-center ring-2",
                        tint,
                      )}
                      aria-hidden
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.8125rem] font-semibold text-white">
                        {doctrine.name}
                      </div>
                      <div className="text-[0.625rem] italic text-slate-400 truncate">
                        &ldquo;{doctrine.tagline}&rdquo;
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA — appears once all cards have revealed */}
        <div className="mt-10 flex flex-col items-center">
          <button
            type="button"
            onClick={continueAndRemember}
            disabled={!allRevealed}
            className={cn(
              "inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              allRevealed
                ? "bg-cyan-300 text-slate-900 hover:bg-cyan-200 shadow-[0_8px_30px_-8px_rgba(103,232,249,0.5)]"
                : "bg-white/10 text-white/40 cursor-not-allowed",
            )}
          >
            Begin simulation
            <ArrowRight size={16} />
          </button>
          {!allRevealed && (
            <p className="text-[0.6875rem] text-slate-500 mt-3 tabular">
              Loading airlines… {revealed} / {teams.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Has the user already seen the cohort reveal for this gameId
 *  during the current page session? */
export function hasSeenCohortReveal(gameId: string): boolean {
  return _seenThisSession.has(gameId);
}

// Eliminate unused import warning in production builds where the
// `AIRLINE_COLOR_BY_ID` re-export from this file would be tree-shaken.
// (kept in import block above so the symbol is referenced for some
// downstream consumers that import together.)
void AIRLINE_COLOR_BY_ID;
