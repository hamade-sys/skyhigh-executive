/** Quarter-scoped ready flags shared by client and server close authorization. */

export function isReadyForQuarter(
  team: { readyForNextQuarter?: boolean; readyForQuarter?: number },
  currentQuarter: number,
): boolean {
  return (
    team.readyForNextQuarter === true &&
    team.readyForQuarter === currentQuarter
  );
}

export function allHumansReady(
  teams: Array<{
    id: string;
    controlledBy?: string;
    readyForNextQuarter?: boolean;
    readyForQuarter?: number;
    claimedBySessionId?: string | null;
  }>,
  currentQuarter: number,
  staleSessionIds: Set<string> = new Set(),
): boolean {
  const humans = teams.filter((t) => t.controlledBy === "human");
  if (humans.length === 0) return false;
  return humans.every((t) => {
    if (isReadyForQuarter(t, currentQuarter)) return true;
    if (t.claimedBySessionId && staleSessionIds.has(t.claimedBySessionId)) {
      return true;
    }
    return false;
  });
}
