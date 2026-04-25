import type { NewsItem } from "@/types/game";

/**
 * 5 headlines per quarter × 20 quarters. Key PRD events are marked with
 * scenario hooks (§8.3). The rest are credible aviation-industry news that
 * contextualize the era and give player agency cues.
 */
function n(
  quarter: number,
  id: string,
  icon: string,
  impact: NewsItem["impact"],
  headline: string,
  detail: string,
): NewsItem {
  return { id: `Q${quarter}-${id}`, quarter, icon, impact, headline, detail };
}

export const WORLD_NEWS: NewsItem[] = [
  // ─── Q1 Brand building era (year 2000) ─────────────────────
  n(1, "A", "✈︎", "none", "Market opening: 100 cities, $150M seed capital", "Your airline is one of 2–10 competing for a 20-quarter window."),
  n(1, "B", "●", "tourism", "Global tourism up 6% year-on-year", "Baseline demand growth for all tier-1 cities."),
  n(1, "C", "$", "fuel", "Fuel index at 100 (baseline)", "Spot price $0.18/L. Hedging markets open."),
  n(1, "D", "◐", "business", "Business travel index flat", "No macro shift expected before Q3."),
  n(1, "E", "☐", "none", "Your hub selection window closes at Q1 board", "Blind bid triggers if multiple teams pick the same hub."),

  // ─── Q2 World Cup bid (S10) ────────────────────────────────
  n(2, "A", "⚽", "brand", "FIFA opens bidding for World Cup official carrier", "Sealed bid + elevator pitch. Winner decided at L6 (Q7)."),
  n(2, "B", "●", "tourism", "Low-cost carriers expanding Europe-Americas", "Tier-1 tourism demand up 4%."),
  n(2, "C", "◑", "business", "Asia-Pacific business growth outpaces rest of world", "BKK, SIN, HKG seeing accelerated demand."),
  n(2, "D", "☐", "cargo", "E-commerce logistics boom", "Cargo tonnage up 12% for tier-1 and tier-2 hubs."),
  n(2, "E", "$", "fuel", "Oil hovers around index 108", "Hedge-market speculation intensifies."),

  // ─── Q3 Fuel spike (S4) ────────────────────────────────────
  n(3, "A", "⚠", "fuel", "Fuel spike: index jumps to 135", "Quarterly fuel costs up 35%. S4 Oil Gamble triggered."),
  n(3, "B", "◐", "tourism", "Mediterranean tourism peaking", "FCO, BCN, ATH demand up 8% this quarter only."),
  n(3, "C", "●", "none", "FIFA Presidential visit at unnamed venue", "No game impact. Hidden clue for L6 Elevator pitch."),
  n(3, "D", "☐", "cargo", "Panama Canal expansion announced", "PTY tier reassessment pending."),
  n(3, "E", "◑", "business", "Silicon Valley hiring surge", "SFO, SAN, SEA business demand +5%."),

  // ─── Q4 Ghost Fleet (S1) ───────────────────────────────────
  n(4, "A", "⚠", "ops", "Regulatory review: maintenance forgery investigated industry-wide", "S1 Ghost Fleet scenario triggered."),
  n(4, "B", "◐", "tourism", "Chinese New Year travel record", "PEK, PVG, HKG tourism up 15% this quarter."),
  n(4, "C", "$", "fuel", "Fuel steadies at index 120", "OPEC signals stabilization."),
  n(4, "D", "●", "brand", "Cabin safety reporting standards tightened", "Brand-exposed airlines face scrutiny."),
  n(4, "E", "☐", "business", "Tech summit in DFW", "Business demand DFW +10% this quarter only."),

  // ─── Q5 Moscow Signal (S16) ────────────────────────────────
  n(5, "A", "⚠", "none", "Intelligence signal: Moscow corridor may close", "S16 Moscow Signal triggered. Lock-in decision."),
  n(5, "B", "◐", "tourism", "Summer travel season opens strong", "Europe tier-1 cities +6% tourism."),
  n(5, "C", "$", "fuel", "Fuel index 118", "Stable."),
  n(5, "D", "☐", "cargo", "Trans-Pacific cargo demand growing", "NRT, LAX, SFO cargo lanes busy."),
  n(5, "E", "●", "ops", "Pilot union wage negotiations open", "L1 Strike expected between Q4-Q5."),

  // ─── Q6 False alarm reveal + Gov lifeline (S5) ─────────────
  n(6, "A", "✓", "tourism", "False alarm: corridor stays open. Summer surge expected", "S16 plot twist revealed. Locked-in teams miss the surge."),
  n(6, "B", "⚠", "brand", "Government lifeline program announced", "S5 Government Lifeline triggered."),
  n(6, "C", "◐", "tourism", "Beach destination bookings up 20%", "Leisure tier-2 cities riding summer wave."),
  n(6, "D", "$", "fuel", "Fuel steady at 115", "Markets calm."),
  n(6, "E", "☐", "business", "Conference circuit resumes post-crisis", "Tier-1 business demand recovering."),

  // ─── Q7 Olympics + L6/L3 ───────────────────────────────────
  n(7, "A", "●", "brand", "Olympic sponsorship window opens", "S11 Olympic Play triggered."),
  n(7, "B", "⚠", "ops", "Whistleblower report surfaces", "L3 Whistleblower live sim between Q7-Q8."),
  n(7, "C", "◑", "business", "Asia-Pacific M&A wave", "HKG, SIN, TPE business demand +8%."),
  n(7, "D", "$", "fuel", "Fuel index 112", "Slight downward pressure."),
  n(7, "E", "☐", "cargo", "Pharmaceutical cargo surge", "Temperature-controlled tonnage rates up 15%."),

  // ─── Q8 War in Corridor (S2) ───────────────────────────────
  n(8, "A", "⚠", "ops", "Geopolitical conflict closes corridor airspace", "S2 War in Corridor triggered."),
  n(8, "B", "◐", "tourism", "Eastern European tourism craters", "PRG, WAW, BUD -20% demand."),
  n(8, "C", "$", "fuel", "Fuel index jumps to 125 on conflict", "Hedge impact now material."),
  n(8, "D", "●", "brand", "Industry consolidation rumors", "Small regional airlines at risk."),
  n(8, "E", "☐", "ops", "Crisis Operations Room live sim", "L7 between Q8-Q9. CMOs + CFOs extracted."),

  // ─── Q9 Recovery + Hungry Neighbour + Cocoa (S7, S18) ──────
  n(9, "A", "✓", "tourism", "Travel recovery index hits 92%", "Baseline demand returning to pre-crisis norms."),
  n(9, "B", "⚠", "business", "Regional competitor enters administration", "S7 Hungry Neighbour triggered."),
  n(9, "C", "⚠", "brand", "Cocoa supply collapses in West Africa", "S18 Cocoa Crisis triggered. Premium cabin costs triple."),
  n(9, "D", "$", "fuel", "Fuel eases to 115", "Post-conflict stabilization."),
  n(9, "E", "◐", "tourism", "Southern hemisphere winter travel window", "SYD, AKL, SCL uptick."),

  // ─── Q10 World Cup begins + Rate Window (S6) + L4 ──────────
  n(10, "A", "⚽", "brand", "World Cup kicks off. Official carrier at 100% load factor", "S10 winner gets Q10+Q11 load-factor override."),
  n(10, "B", "⚠", "none", "Rate window opens: refinancing available", "S6 Rate Window triggered."),
  n(10, "C", "●", "brand", "Media Podium press conference", "L4 live sim between Q10-Q11. CEO commitments logged."),
  n(10, "D", "◐", "tourism", "Host country tourism +40%", "World Cup bounce."),
  n(10, "E", "$", "fuel", "Fuel index 110", "Calm."),

  // ─── Q11 Political Favour (S8) ─────────────────────────────
  n(11, "A", "⚠", "ops", "State requests route subsidies", "S8 Political Favour triggered."),
  n(11, "B", "◐", "tourism", "Winter travel records in Alps region", "ZRH, MUC, VIE benefitting."),
  n(11, "C", "☐", "cargo", "Christmas cargo peak", "Cargo rates +15% for the quarter."),
  n(11, "D", "$", "fuel", "Fuel index 108", "Markets calm post-World Cup."),
  n(11, "E", "●", "brand", "Consumer confidence surveys strong", "Loyalty programs seeing uptick."),

  // ─── Q12 Talent Heist (S14) + L2 ───────────────────────────
  n(12, "A", "⚠", "ops", "Executive poaching wave hits industry", "S14 Talent Heist + L2 simultaneous."),
  n(12, "B", "◑", "business", "Rate hike announced for Q13", "Borrowing costs rising."),
  n(12, "C", "☐", "cargo", "Transpacific cargo rate normalization", "Rates easing back to baseline."),
  n(12, "D", "$", "fuel", "Fuel at 112", "Stable."),
  n(12, "E", "●", "tourism", "Cruise-and-fly packages booming", "MIA, SDQ, SJU seeing paired bookings."),

  // ─── Q13 Flash Deal (S3) + Recession ───────────────────────
  n(13, "A", "⚠", "none", "Recession declared. Consumer demand softens", "Baseline demand -10% industry-wide."),
  n(13, "B", "✈︎", "ops", "Airbus announces Flash Deal: 20 eco-engine units", "S3 Flash Deal. Pool mechanic active."),
  n(13, "C", "◐", "tourism", "Domestic tourism shift", "Short-haul demand relative uptick."),
  n(13, "D", "$", "fuel", "Fuel index 125 on recession-hedge volatility", "Wide spread markets."),
  n(13, "E", "●", "brand", "Project Aurora live sim window", "L5 between Q13-Q14. Hidden agenda mechanic."),

  // ─── Q14 Recession deepens (S15) ───────────────────────────
  n(14, "A", "⚠", "business", "Recession deepens. Business travel -25%", "S15 Recession Gamble triggered."),
  n(14, "B", "◐", "tourism", "Staycation trend dampens international travel", "Tier-1 tourism -8%."),
  n(14, "C", "$", "fuel", "Fuel index 118", "Recession pulls demand down."),
  n(14, "D", "●", "ops", "Union strike activity rising", "Watch for Ops slider exposure."),
  n(14, "E", "☐", "cargo", "Cargo outperforming passenger", "Cargo capacity tight, rates up."),

  // ─── Q15 Digital Gamble (S13) + Olympics (stimulus) ────────
  n(15, "A", "⚠", "ops", "AI platform rollout across industry", "S13 Digital Gamble triggered."),
  n(15, "B", "●", "tourism", "Government stimulus: travel vouchers distributed", "Tier-2 cities see 12% bump."),
  n(15, "C", "◐", "business", "Green recovery programs funded", "Early signal for Q17 Green Ultimatum."),
  n(15, "D", "$", "fuel", "Fuel index 115", "Markets bullish on recovery."),
  n(15, "E", "☐", "brand", "Loyalty program consolidation industry-wide", "Competitor rewards schemes tightening."),

  // ─── Q16 Recession ends + Blue Ocean (S9) ──────────────────
  n(16, "A", "✓", "business", "Recession officially ends", "Baseline demand recovering. S15 twist applies here."),
  n(16, "B", "⚠", "none", "Diplomatic thaw opens new corridor", "S9 Blue Ocean triggered."),
  n(16, "C", "◐", "tourism", "Pent-up demand releasing", "All tier-1 tourism +15% this quarter."),
  n(16, "D", "$", "fuel", "Fuel index 110", "Markets calm."),
  n(16, "E", "●", "cargo", "777X-9 enters service", "Heavy-lift capacity unlocked."),

  // ─── Q17 Green Ultimatum (S17) + Carbon levy ───────────────
  n(17, "A", "⚠", "ops", "Carbon levy takes effect: $45/tonne CO2", "S17 Green Ultimatum triggered."),
  n(17, "B", "●", "brand", "ESG-driven fund flows into aviation", "Green-flagged airlines see institutional interest."),
  n(17, "C", "◐", "tourism", "Sustainable travel premium segment growing", "Affluent tourists favor green carriers."),
  n(17, "D", "$", "fuel", "Fuel index 115", "Stable."),
  n(17, "E", "☐", "business", "Corporate travel ESG reporting mandated", "Business demand shifts toward green carriers."),

  // ─── Q18 Brand Grenade (S12) + Full recovery ───────────────
  n(18, "A", "⚠", "brand", "Ambassador scandal rocks industry", "S12 Brand Grenade triggered."),
  n(18, "B", "✓", "tourism", "Full recovery: tourism index at 108", "Best travel environment in 5 years."),
  n(18, "C", "◐", "business", "M&A cycle peaks", "Dealmaking travel surge."),
  n(18, "D", "$", "fuel", "Fuel index 112", "Calm."),
  n(18, "E", "●", "cargo", "Cargo division valuations peak", "Strategic opportunity for cargo-focused airlines."),

  // ─── Q19 Mature market ─────────────────────────────────────
  n(19, "A", "◐", "tourism", "Travel demand at cyclical peak", "Record tier-1 tourism."),
  n(19, "B", "●", "brand", "Customer loyalty programs renew", "Brand Value component shifts weighting."),
  n(19, "C", "☐", "cargo", "Asia-Europe cargo corridor expanding", "New Blue Ocean routes monetizing."),
  n(19, "D", "$", "fuel", "Fuel index 108", "Post-SAF adoption pressure."),
  n(19, "E", "⚠", "business", "Rate cycle peaks: borrowing costs at 5-year high", "Debt-heavy airlines exposed."),

  // ─── Q20 Final quarter ─────────────────────────────────────
  n(20, "A", "◐", "tourism", "Final quarter: legacy-defining window", "No new board decision. Investor presentation coming."),
  n(20, "B", "●", "brand", "Analyst coverage ratings finalize", "Brand Value determines winner."),
  n(20, "C", "$", "fuel", "Fuel index 110", "Stable final quarter."),
  n(20, "D", "☐", "cargo", "End-of-year shipping surge", "Final boost for cargo-active airlines."),
  n(20, "E", "✓", "none", "Investor pitch and MVP awards come next", "Final scoring after Q20 close."),
];

export const NEWS_BY_QUARTER: Record<number, NewsItem[]> = WORLD_NEWS.reduce(
  (acc, item) => {
    (acc[item.quarter] ??= []).push(item);
    return acc;
  },
  {} as Record<number, NewsItem[]>,
);

/**
 * Dynamic host-city headlines. The World Cup and Olympic host cities
 * are randomized per-game (tier 1-2, never a player or rival hub), so
 * they can't live in the static WORLD_NEWS array. This helper returns
 * any host-related headline that should fire for the given quarter.
 *
 * Schedule:
 *   - World Cup host announcement: round 3 (S10 round)
 *   - World Cup tournament window: rounds 19-22 main, 23-24 tail
 *   - Olympic host announcement: round 13 (S11 round)
 *   - Olympic tournament window: rounds 29-32
 */
export function dynamicHostNews(
  quarter: number,
  worldCupHostCode: string | null | undefined,
  olympicHostCode: string | null | undefined,
  cityNameLookup: (code: string) => string | undefined,
): NewsItem[] {
  const out: NewsItem[] = [];

  // World Cup
  if (worldCupHostCode) {
    const wcCity = cityNameLookup(worldCupHostCode) ?? worldCupHostCode;
    if (quarter === 3) {
      out.push({
        id: `Q${quarter}-WC-HOST-ANNOUNCED`,
        quarter,
        icon: "⚽",
        impact: "tourism",
        headline: `FIFA names ${wcCity} as official World Cup host city`,
        detail: `Routes touching ${wcCity} (${worldCupHostCode}) will see heavy demand surges in rounds 19-24. S10 sealed-bid carrier auction opens this quarter.`,
      });
    }
    if (quarter === 19) {
      out.push({
        id: `Q${quarter}-WC-OPENING`,
        quarter,
        icon: "⚽",
        impact: "tourism",
        headline: `World Cup opening week — ${wcCity} airports overwhelmed`,
        detail: `Demand on routes touching ${wcCity} (${worldCupHostCode}) is locked at near-full loads through Q4 of this year. Slot leases at the host city are at premium prices.`,
      });
    }
    if (quarter === 23) {
      out.push({
        id: `Q${quarter}-WC-FINALS`,
        quarter,
        icon: "⚽",
        impact: "tourism",
        headline: `World Cup quarterfinals → final stretch in ${wcCity}`,
        detail: `Tail-end uplift on ${wcCity} (${worldCupHostCode}) routes — +50% above your pre-tournament baseline if you held capacity through the group stage.`,
      });
    }
  }

  // Olympics
  if (olympicHostCode) {
    const olCity = cityNameLookup(olympicHostCode) ?? olympicHostCode;
    if (quarter === 13) {
      out.push({
        id: `Q${quarter}-OL-HOST-ANNOUNCED`,
        quarter,
        icon: "🏅",
        impact: "tourism",
        headline: `IOC confirms ${olCity} for the upcoming Summer Olympics`,
        detail: `Demand surge expected on ${olCity} (${olympicHostCode}) routes through the rounds 29-32 window. S11 Olympic Play sponsorship slots open this quarter.`,
      });
    }
    if (quarter === 29) {
      out.push({
        id: `Q${quarter}-OL-OPENING`,
        quarter,
        icon: "🏅",
        impact: "tourism",
        headline: `Olympic torch lit in ${olCity}`,
        detail: `Routes touching ${olCity} (${olympicHostCode}) ride the surge through the Games. Official airline partners get a 95% sealed load floor.`,
      });
    }
  }

  return out;
}
