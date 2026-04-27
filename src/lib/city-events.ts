import { CITIES_BY_CODE } from "@/data/cities";
import { NEWS_BY_QUARTER, WORLD_NEWS } from "@/data/world-news";
import type { NewsCategory, NewsItem, NewsModifier } from "@/types/game";

/**
 * Per-city event impact for the current quarter, broken down by category.
 *
 * The canonical source is the `modifiers` array on each NewsItem (see
 * `src/data/world-news.ts`). Each modifier has a city + category + pct
 * + rounds-active window — when news fires at quarter `q` with
 * `rounds: 4`, the modifier remains active through `q+3`.
 *
 * For each query, we walk every news item that fired at or before the
 * current quarter and apply any modifier whose window still covers
 * `quarter`. Multiple modifiers stack additively (so two +10% boosts
 * become +20%).
 *
 * `category` filtering:
 *   - "tourism" returns tourism + all
 *   - "business" returns business + all
 *   - "cargo" returns cargo + all
 *   - "all"     returns ALL category buckets blended (legacy aggregate)
 */
export interface CityEventImpact {
  /** Blended overall pct (tourism + business + cargo + all averaged). */
  pct: number;
  /** Per-category breakdown (additive percent points). */
  tourism: number;
  business: number;
  cargo: number;
  /** News items currently active for this city. */
  items: NewsItem[];
}

/** Region-level fallback matchers (for headlines that don't carry an
 *  explicit modifier yet — kept for backwards compat with any non-
 *  modifier-tagged news the doc may still reference by region only). */
const REGION_MATCHERS: Record<string, RegExp> = {
  na: /\b(North America|Americas|NYC|US|Canada)\b/i,
  sa: /\b(South America|Latin America|Mexico|Brazil)\b/i,
  la: /\b(Latin America|South America|Mexico|Brazil)\b/i,
  eu: /\b(Europe|European|EU)\b/i,
  me: /\b(Middle East|Gulf)\b/i,
  mea: /\b(Middle East|Africa|Gulf)\b/i,
  af: /\b(Africa|African)\b/i,
  as: /\b(Asia|Asia[- ]Pacific|South[- ]?East Asia)\b/i,
  oc: /\b(Oceania|Australia|Pacific)\b/i,
};

/** A modifier is active at `quarter` if it fired at q0 ≤ quarter and
 *  the window q0 + rounds covers `quarter` (rounds-active is inclusive
 *  of the firing round itself, so rounds=1 means just the firing round). */
function modifierActiveAt(
  fireQuarter: number,
  rounds: number,
  quarter: number,
): boolean {
  if (quarter < fireQuarter) return false;
  return quarter < fireQuarter + Math.max(1, rounds);
}

/** Per-city impact contributed by a SINGLE news item (rather than the
 *  cumulative impact across every active news). Used by the close-quarter
 *  digest's "News" tab so each headline shows the cities IT affected and
 *  by how much — not the city's net impact across all background noise.
 *
 *  Returns null if this news item has no modifier active for this city
 *  at this quarter (caller skips emitting a row for that city). */
export function newsItemImpactForCity(
  news: NewsItem,
  cityCode: string,
  quarter: number,
): { pct: number; tourism: number; business: number; cargo: number } | null {
  if (news.quarter > quarter) return null;
  if (!news.modifiers || news.modifiers.length === 0) {
    // Legacy fallback: only emits when the firing quarter matches and
    // the headline mentions the city by code. Used for older headlines
    // that haven't been migrated to structured modifiers yet.
    if (news.quarter !== quarter) return null;
    const text = `${news.headline} ${news.detail}`;
    const codeHit = new RegExp(`\\b${cityCode}\\b`).test(text);
    if (!codeHit) return null;
    const nominal = legacyNominalForImpact(news.impact);
    return { pct: nominal, tourism: nominal, business: nominal, cargo: nominal };
  }
  let tourism = 0;
  let business = 0;
  let cargo = 0;
  let touched = false;
  for (const m of news.modifiers) {
    if (m.city !== cityCode && m.city !== "ALL") continue;
    if (!modifierActiveAt(news.quarter, m.rounds, quarter)) continue;
    touched = true;
    if (m.category === "tourism") tourism += m.pct;
    else if (m.category === "business") business += m.pct;
    else if (m.category === "cargo") cargo += m.pct;
    else {
      tourism += m.pct;
      business += m.pct;
      cargo += m.pct;
    }
  }
  if (!touched) return null;
  // Match the cityEventImpact convention: blended pct = average of the
  // three category buckets, rounded to whole %.
  const pct = Math.round((tourism + business + cargo) / 3);
  return {
    pct,
    tourism: Math.round(tourism),
    business: Math.round(business),
    cargo: Math.round(cargo),
  };
}

export function cityEventImpact(
  cityCode: string,
  quarter: number,
): CityEventImpact {
  const city = CITIES_BY_CODE[cityCode];
  if (!city) {
    return { pct: 0, tourism: 0, business: 0, cargo: 0, items: [] };
  }

  let tourism = 0;
  let business = 0;
  let cargo = 0;
  const items: NewsItem[] = [];
  const seenItems = new Set<string>();

  // Walk every news item from quarter 1 → current. Active windows
  // starting earlier than `quarter` may still apply.
  for (const news of WORLD_NEWS) {
    if (news.quarter > quarter) continue;
    let touched = false;

    if (news.modifiers && news.modifiers.length > 0) {
      for (const m of news.modifiers) {
        // "ALL" is the engine wildcard for "every city in the network"
        // — used by global shock events (COVID, recession, etc) so the
        // headline doesn't have to enumerate every airport. Any other
        // city value is matched exactly.
        if (m.city !== cityCode && m.city !== "ALL") continue;
        if (!modifierActiveAt(news.quarter, m.rounds, quarter)) continue;
        touched = true;
        applyModifier(m, (delta, cat) => {
          if (cat === "tourism") tourism += delta;
          else if (cat === "business") business += delta;
          else if (cat === "cargo") cargo += delta;
          else {
            tourism += delta;
            business += delta;
            cargo += delta;
          }
        });
      }
    } else if (news.quarter === quarter) {
      // Legacy fallback: only fires for *current* quarter, no rounds.
      // Used for any headline that hasn't been migrated to structured
      // modifiers yet. Detect by city-code mention or region match.
      const text = `${news.headline} ${news.detail}`;
      const codeHit = new RegExp(`\\b${cityCode}\\b`).test(text);
      const regionRe = REGION_MATCHERS[city.region];
      const regionHit = !!regionRe && regionRe.test(text);
      if (codeHit || regionHit) {
        touched = true;
        const nominal = legacyNominalForImpact(news.impact);
        const delta = codeHit ? nominal : nominal * 0.5;
        // Legacy news has no per-category data; treat as "all".
        tourism += delta;
        business += delta;
        cargo += delta;
      }
    }

    if (touched && !seenItems.has(news.id)) {
      seenItems.add(news.id);
      items.push(news);
    }
  }

  // Round to whole percent points to keep displayed numbers tidy.
  tourism = Math.round(tourism);
  business = Math.round(business);
  cargo = Math.round(cargo);
  // Blended pct is what the legacy single-knob engine path uses;
  // keep it as the average of categorical signals so a +10% tourism /
  // 0% business event still shows a meaningful aggregate.
  const pct = Math.round((tourism + business + cargo) / 3);

  return { pct, tourism, business, cargo, items };
}

function applyModifier(
  m: NewsModifier,
  put: (delta: number, cat: NewsCategory) => void,
) {
  put(m.pct, m.category);
}

function legacyNominalForImpact(impact: NewsItem["impact"]): number {
  switch (impact) {
    case "tourism":
      return 5;
    case "business":
      return 5;
    case "cargo":
      return 4;
    case "brand":
      return 2;
    case "fuel":
      return -3;
    case "ops":
      return -4;
    default:
      return 0;
  }
}

/** Active news items for the current quarter. Used by the news panel
 *  to highlight "currently in effect" lines (including back-dated ones
 *  whose rounds-window still covers `quarter`). */
export function activeNewsAtQuarter(quarter: number): NewsItem[] {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const news of WORLD_NEWS) {
    if (news.quarter > quarter) continue;
    if (news.quarter === quarter) {
      out.push(news);
      seen.add(news.id);
      continue;
    }
    // Earlier quarter — only include if any modifier window still covers `quarter`.
    if (!news.modifiers) continue;
    const stillActive = news.modifiers.some((m) =>
      modifierActiveAt(news.quarter, m.rounds, quarter),
    );
    if (stillActive && !seen.has(news.id)) {
      out.push(news);
      seen.add(news.id);
    }
  }
  return out;
}

/** Re-export so callers don't need a second import path. */
export { NEWS_BY_QUARTER };
