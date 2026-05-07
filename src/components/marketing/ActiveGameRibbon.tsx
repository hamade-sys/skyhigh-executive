"use client";

/**
 * Sticky ribbon that surfaces "you have an active game — Resume →" on
 * the home page and other marketing surfaces (Phase 8.1 of the
 * enterprise-readiness plan).
 *
 * Why a ribbon, not a forced redirect: the previous home-page logic
 * (src/app/page.tsx) called `window.location.replace` whenever it
 * found an active membership for the signed-in user. That made the
 * marketing pages unreachable while in a game — including
 * IMMEDIATELY after clicking "End game", which only cleared local
 * state and left the DB row behind. So users got bounced back into
 * the game they just tried to leave.
 *
 * Now: marketing pages render normally. The ribbon (this component)
 * mounts globally via the root layout and queries
 * /api/games/active-membership to decide whether to render. It's
 * hidden when:
 *   - the user is anonymous
 *   - they have no active membership
 *   - they're already on a /games/[id]/* route (they're IN the game)
 *
 * The ribbon copy adapts to status: lobby vs playing.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Play, Users2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface ActiveGame {
  id: string;
  status: "lobby" | "playing" | "ended";
  name: string;
  current_quarter?: number;
  total_rounds?: number;
  member_count?: number;
  max_teams?: number;
}

export function ActiveGameRibbon() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [game, setGame] = useState<ActiveGame | null>(null);

  // Hide the ribbon when the user is already IN their game — the
  // /games/[id]/play and /games/[id]/lobby routes have their own
  // chrome. Showing "Resume game" while you're inside it is silly.
  const insideActiveGame = (pathname ?? "").startsWith("/games/");

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGame(null);
      return;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(
          `/api/games/active-membership?sessionId=${encodeURIComponent(user!.id)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        const g = json?.game as ActiveGame | null;
        // Defense-in-depth: never surface ended games as "active".
        if (g && g.status !== "ended") {
          setGame(g);
        } else {
          setGame(null);
        }
      } catch {
        if (!cancelled) setGame(null);
      }
    }
    void refresh();
    // Group-E polish — re-poll the active-membership endpoint every
    // 15 seconds so a forfeit or auto-end clears the "Resume" CTA
    // without requiring the user to manually reload. The interval
    // is conservative because most users only see the ribbon for a
    // few seconds before clicking through; 15s catches the
    // post-forfeit replication-lag race without thrashing the API.
    const interval = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authLoading, user?.id, pathname, user]);

  if (authLoading || !user?.id || !game || insideActiveGame) {
    return null;
  }

  const isLobby = game.status === "lobby";
  const href = isLobby
    ? `/games/${game.id}/lobby`
    : `/games/${game.id}/play`;

  const subline = isLobby
    ? game.member_count != null && game.max_teams != null
      ? `Waiting for players · ${game.member_count}/${game.max_teams} joined`
      : "Lobby open — waiting to start"
    : game.current_quarter != null
      ? `Round ${game.current_quarter}${game.total_rounds ? ` / ${game.total_rounds}` : ""} · in progress`
      : "In progress";

  return (
    <div className="sticky top-0 z-50 w-full bg-[#00C2CB] text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-8 h-8 rounded-lg bg-white/15 items-center justify-center shrink-0">
            {isLobby ? (
              <Users2 className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate">
              {isLobby ? "You're in a lobby" : "You have a game in progress"}
              <span className="hidden sm:inline">
                {" "}— {game.name}
              </span>
            </p>
            <p className="text-[11px] text-white/85 truncate">{subline}</p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-[#0A6469] text-[13px] font-semibold hover:bg-white/95 transition-colors shrink-0 min-h-[40px] min-w-[40px]"
          aria-label={isLobby ? `Back to ${game.name} lobby` : `Resume ${game.name}`}
        >
          {isLobby ? "Back to lobby" : "Resume game"}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
