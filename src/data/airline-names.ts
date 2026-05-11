/**
 * Bot/competitor airline name pool — 100 plausible airline names with
 * 3-letter IATA-style codes. Used by:
 *
 *   - `/api/games/start/route.ts` for multiplayer bot rivals
 *   - `src/app/games/[gameId]/lobby/page.tsx` for the lobby seat
 *     preview (so the host sees actual names instead of "AI Bot 3")
 *   - `src/store/game.ts` MOCK_COMPETITOR_NAMES for solo runs
 *
 * Workshop feedback (PR #21 → this file): the previous 8-name
 * shortlist was visibly recycling — every cohort saw the same
 * Aurora / Sundial / Meridian. With 100 names and `pickAirlineNames(n)`
 * picking randomly without replacement, two consecutive cohorts in
 * the same workshop now have ~92% chance of zero overlap on a
 * 4-bot game.
 *
 * Naming style: ~70% carry the explicit "Airlines" / "Airways"
 * suffix per workshop direction; the rest use "Air" / "Aviation" /
 * "Carriers" / "Wings" / similar so the cohort doesn't read as
 * monolithic.
 */

export interface AirlineNameEntry {
  name: string;
  /** 3-letter IATA-style code, uppercase, unique within the pool. */
  code: string;
}

export const AIRLINE_NAME_POOL: ReadonlyArray<AirlineNameEntry> = [
  { name: "Aurora Airways",      code: "AUR" },
  { name: "Sundial Airlines",    code: "SND" },
  { name: "Meridian Air",        code: "MRD" },
  { name: "Pacific Crest",       code: "PCR" },
  { name: "Transit Nordique",    code: "TNR" },
  { name: "Solstice Wings",      code: "SLW" },
  { name: "Vermilion Airlines",  code: "VML" },
  { name: "Firth Pacific",       code: "FTH" },
  { name: "Anchor Continental",  code: "ACT" },
  { name: "Phoenix Airways",     code: "PNX" },
  { name: "Atlas Airlines",      code: "ATL" },
  { name: "Helios Aviation",     code: "HEL" },
  { name: "Apollo Air",          code: "APL" },
  { name: "Falcon Airways",      code: "FLN" },
  { name: "Albatross Airlines",  code: "ALB" },
  { name: "Polaris Airways",     code: "PLR" },
  { name: "Cobalt Air",          code: "CBL" },
  { name: "Crimson Airlines",    code: "CRM" },
  { name: "Indigo Airways",      code: "IDG" },
  { name: "Sahara Airlines",     code: "SHR" },
  { name: "Andes Airways",       code: "ADS" },
  { name: "Caspian Air",         code: "CSP" },
  { name: "Atlantic Airways",    code: "ATA" },
  { name: "Tundra Airlines",     code: "TUN" },
  { name: "Steppe Airways",      code: "STP" },
  { name: "Equator Aviation",    code: "EQT" },
  { name: "Zenith Airlines",     code: "ZNT" },
  { name: "Apex Carriers",       code: "APX" },
  { name: "Vantage Airways",     code: "VAN" },
  { name: "Compass Air",         code: "CMP" },
  { name: "Beacon Airlines",     code: "BCN" },
  { name: "Arctic Airways",      code: "ARC" },
  { name: "Tropic Airlines",     code: "TRP" },
  { name: "Coral Air",           code: "CRL" },
  { name: "Onyx Airlines",       code: "ONX" },
  { name: "Jade Airways",        code: "JDE" },
  { name: "Amber Aviation",      code: "AMB" },
  { name: "Sapphire Airlines",   code: "SPR" },
  { name: "Ember Air",           code: "EMB" },
  { name: "Ash Aviation",        code: "ASH" },
  { name: "Lyra Airways",        code: "LYR" },
  { name: "Vega Airlines",       code: "VEG" },
  { name: "Orion Airways",       code: "ORN" },
  { name: "Sirius Air",          code: "SIR" },
  { name: "Cygnus Airlines",     code: "CYG" },
  { name: "Cassiopeia Aviation", code: "CAS" },
  { name: "Andromeda Air",       code: "AMD" },
  { name: "Pegasus Airlines",    code: "PGS" },
  { name: "Hyperion Airways",    code: "HYP" },
  { name: "Titan Aviation",      code: "TTN" },
  { name: "Nova Airlines",       code: "NOV" },
  { name: "Celestial Airways",   code: "CEL" },
  { name: "Ozone Air",           code: "OZN" },
  { name: "Strato Airlines",     code: "STR" },
  { name: "Cirrus Airlines",     code: "CIR" },
  { name: "Mistral Air",         code: "MST" },
  { name: "Monsoon Airways",     code: "MON" },
  { name: "Sirocco Air",         code: "SRC" },
  { name: "Zephyr Airways",      code: "ZPH" },
  { name: "Tradewind Airlines",  code: "TRD" },
  { name: "Mariner Aviation",    code: "MAR" },
  { name: "Voyager Airways",     code: "VYG" },
  { name: "Odyssey Airlines",    code: "ODY" },
  { name: "Pioneer Air",         code: "PIO" },
  { name: "Trident Airways",     code: "TRI" },
  { name: "Continental Crest",   code: "CCR" },
  { name: "Silk Road Airways",   code: "SLK" },
  { name: "Spice Air",           code: "SPC" },
  { name: "Kestrel Airlines",    code: "KST" },
  { name: "Osprey Airways",      code: "OSP" },
  { name: "Heron Air",           code: "HRN" },
  { name: "Ibis Aviation",       code: "IBS" },
  { name: "Crane Airlines",      code: "CRN" },
  { name: "Swan Airways",        code: "SWN" },
  { name: "Petrel Air",          code: "PTR" },
  { name: "Tern Airlines",       code: "TRN" },
  { name: "Skua Air",            code: "SKU" },
  { name: "Puffin Airways",      code: "PFN" },
  { name: "Hawk Aviation",       code: "HWK" },
  { name: "Kite Airlines",       code: "KTE" },
  { name: "Robin Air",           code: "RBN" },
  { name: "Lark Airways",        code: "LRK" },
  { name: "Swallow Airlines",    code: "SWL" },
  { name: "Meadowlark Aviation", code: "MDL" },
  { name: "Sterling Airways",    code: "STG" },
  { name: "Royal Crest",         code: "RCR" },
  { name: "Crown Airlines",      code: "CRW" },
  { name: "Imperial Airways",    code: "IMP" },
  { name: "Sovereign Air",       code: "SOV" },
  { name: "Regent Airlines",     code: "REG" },
  { name: "Cardinal Aviation",   code: "CRD" },
  { name: "Elite Airways",       code: "ELT" },
  { name: "Frontier Air",        code: "FRT" },
  { name: "Horizon Express",     code: "HRZ" },
  { name: "Vista Airlines",      code: "VIS" },
  { name: "Skyway Airlines",     code: "SKW" },
  { name: "Cloudburst Air",      code: "CLD" },
  { name: "Stormpath Airways",   code: "STM" },
  { name: "Lightfoot Airlines",  code: "LGT" },
  { name: "Wayfarer Airways",    code: "WYF" },
  { name: "Driftwood Air",       code: "DRF" },
  { name: "Northstar Airlines",  code: "NRS" },
  { name: "Southwind Airways",   code: "SWD" },
];

/**
 * Pick `n` distinct airline names from the pool, optionally avoiding
 * any names already in `taken`. Random without replacement so a
 * single cohort never sees duplicates.
 *
 * - If `n` exceeds the available pool size, returns the full available
 *   pool (caller should never request more than ~95 since taken
 *   could trim a few).
 * - Stable shape — caller can spread the result into rich team objects.
 */
export function pickAirlineNames(
  n: number,
  taken?: ReadonlySet<string>,
): AirlineNameEntry[] {
  const pool = taken && taken.size > 0
    ? AIRLINE_NAME_POOL.filter((e) => !taken.has(e.name))
    : [...AIRLINE_NAME_POOL];
  // Fisher-Yates partial shuffle — only the first `n` positions need
  // to be randomised. Cheaper than full sort for small n.
  const out: AirlineNameEntry[] = [];
  const arr = [...pool];
  const draw = Math.min(n, arr.length);
  for (let i = 0; i < draw; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
    out.push(arr[i]);
  }
  return out;
}

/** Deterministic seat-index → airline entry (name + code) for the lobby
 *  preview before bots are seeded server-side. Purely deterministic so
 *  the preview stays stable without any browser storage dependency.
 *
 *  The host's browser is the source of truth for preview names: the
 *  names are saved into `plannedSeats` via `/api/games/seat-config`
 *  so the start route uses the exact same names instead of re-rolling. */
const LOBBY_PREVIEW_KEY = "skyforce:lobbyBotNames:v2";

export function lobbyPreviewEntry(seatIndex: number): AirlineNameEntry {
  void LOBBY_PREVIEW_KEY;
  return AIRLINE_NAME_POOL[seatIndex % AIRLINE_NAME_POOL.length];
}

/** Convenience wrapper — returns only the name string (backwards compat). */
export function lobbyPreviewName(seatIndex: number): string {
  return lobbyPreviewEntry(seatIndex).name;
}
