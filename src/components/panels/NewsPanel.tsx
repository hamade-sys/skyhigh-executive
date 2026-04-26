"use client";

import { useMemo, useState } from "react";
import { NEWS_BY_QUARTER, dynamicHostNews } from "@/data/world-news";
import { CITIES_BY_CODE } from "@/data/cities";
import { cityEventImpact } from "@/lib/city-events";
import { useGame, selectPlayer } from "@/store/game";
import { getArticle } from "@/lib/news-articles";
import { fmtQuarter } from "@/lib/format";
import type { NewsItem } from "@/types/game";
import { cn } from "@/lib/cn";
import { Newspaper, ChevronDown, ChevronUp, LayoutList, BookOpen } from "lucide-react";

/** Same fictional outlet pool used by the sidebar ticker — kept in sync via id-hash. */
const OUTLETS: string[] = [
  "Sky News", "Bloomberg", "Reuters", "FT", "The Air Reporter",
  "AP", "BBC World", "WSJ", "Al Arabiya", "Nikkei Asia",
];
function outletFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return OUTLETS[Math.abs(h) % OUTLETS.length];
}

type NewsView = "compact" | "newspaper";

export function NewsPanel() {
  const currentQuarter = useGame((s) => s.currentQuarter);
  const worldCupHostCode = useGame((s) => s.worldCupHostCode);
  const olympicHostCode = useGame((s) => s.olympicHostCode);
  const player = useGame(selectPlayer);
  const [view, setView] = useState<NewsView>("compact");

  // Player's current network (hub + secondary hubs + every endpoint of their routes)
  const networkCodes = useMemo(() => {
    if (!player) return new Set<string>();
    const s = new Set<string>([player.hubCode, ...player.secondaryHubCodes]);
    for (const r of player.routes) {
      if (r.status !== "closed") {
        s.add(r.originCode);
        s.add(r.destCode);
      }
    }
    return s;
  }, [player]);

  const quartersToShow = useMemo(() => {
    const out: number[] = [];
    for (let q = currentQuarter; q >= 1; q--) out.push(q);
    return out;
  }, [currentQuarter]);

  // All items flattened (newspaper view selects from this list)
  const allItems = useMemo(() => {
    const out: NewsItem[] = [];
    for (const q of quartersToShow) {
      const dynamic = dynamicHostNews(q, worldCupHostCode, olympicHostCode,
        (code) => CITIES_BY_CODE[code]?.name);
      out.push(...dynamic, ...(NEWS_BY_QUARTER[q] ?? []));
    }
    return out;
  }, [quartersToShow, worldCupHostCode, olympicHostCode]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted mb-1 flex items-center gap-1.5">
            <Newspaper size={12} /> World news · current + past quarters
          </div>
          <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
            {view === "compact"
              ? "Tap a story to see which of your cities and routes it touches."
              : "Click a headline on the left to read the full article on the right. Forecasts are not shown — you read the world the same way the boardroom does."}
          </p>
        </div>
        {/* View toggle: compact (current behavior) vs newspaper (two-pane) */}
        <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5 shrink-0">
          <button
            onClick={() => setView("compact")}
            className={cn(
              "px-2 py-1 rounded-sm text-[0.6875rem] flex items-center gap-1",
              view === "compact"
                ? "bg-primary text-primary-fg font-medium"
                : "text-ink-2 hover:text-ink",
            )}
            title="Compact list"
          >
            <LayoutList size={11} /> Compact
          </button>
          <button
            onClick={() => setView("newspaper")}
            className={cn(
              "px-2 py-1 rounded-sm text-[0.6875rem] flex items-center gap-1",
              view === "newspaper"
                ? "bg-primary text-primary-fg font-medium"
                : "text-ink-2 hover:text-ink",
            )}
            title="Newspaper layout"
          >
            <BookOpen size={11} /> Newspaper
          </button>
        </div>
      </header>

      {view === "newspaper" ? (
        <NewspaperView items={allItems} networkCodes={networkCodes} currentQuarter={currentQuarter} />
      ) : (
        quartersToShow.map((q) => {
          const dynamic = dynamicHostNews(q, worldCupHostCode, olympicHostCode,
            (code) => CITIES_BY_CODE[code]?.name);
          const items = [...dynamic, ...(NEWS_BY_QUARTER[q] ?? [])];
          if (items.length === 0) return null;
          return (
            <section key={q}>
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2 flex items-center gap-2">
                <span className="font-mono tabular text-ink">{fmtQuarter(q)}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="tabular text-ink-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    networkCodes={networkCodes}
                    isCurrent={q === currentQuarter}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

/** Two-pane newspaper layout — column of headlines on the left, the
 *  selected story's full article body on the right. Picks the most
 *  recent headline by default; clicking another headline updates the
 *  right pane in place. The article body comes from
 *  `getArticle(item)` which already returns dateline + byline + 2-3
 *  paragraph body for every news id. */
function NewspaperView({
  items, networkCodes, currentQuarter,
}: {
  items: NewsItem[];
  networkCodes: Set<string>;
  currentQuarter: number;
}) {
  // Sort by quarter desc — newest first, like a real news feed.
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.quarter - a.quarter),
    [items],
  );
  const [activeId, setActiveId] = useState<string | null>(sorted[0]?.id ?? null);
  const active = sorted.find((it) => it.id === activeId) ?? sorted[0];
  const article = active ? getArticle(active) : null;

  // Cities-on-network impacted by the active headline — same logic as
  // the compact card, but dropped here as a sidebar block in the right
  // pane so the player still sees their direct exposure.
  const affectedCities = useMemo(() => {
    if (!active) return [];
    const out: { code: string; name: string; pct: number; cat?: string }[] = [];
    if (active.modifiers && active.modifiers.length > 0) {
      const byCity = new Map<string, { pct: number; cat?: string }>();
      for (const m of active.modifiers) {
        if (!networkCodes.has(m.city)) continue;
        const prev = byCity.get(m.city);
        if (prev) {
          byCity.set(m.city, {
            pct: prev.pct + m.pct,
            cat: prev.cat === m.category ? prev.cat : "mixed",
          });
        } else {
          byCity.set(m.city, { pct: m.pct, cat: m.category });
        }
      }
      for (const [code, { pct, cat }] of byCity) {
        const city = CITIES_BY_CODE[code];
        if (!city) continue;
        out.push({ code, name: city.name, pct, cat });
      }
    }
    return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }, [active, networkCodes]);

  if (!active || !article) {
    return (
      <div className="rounded-md border border-line bg-surface p-6 text-center text-ink-muted">
        No headlines this period.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4 min-h-[520px]">
      {/* Left column — headlines grouped by quarter with subtle section
          headers so the player can scan an issue's date range at a
          glance instead of seeing every story stuck together. */}
      <aside className="border border-line rounded-md bg-surface overflow-hidden md:max-h-[640px] md:overflow-y-auto">
        {(() => {
          // Group sorted (newest-first) headlines by quarter while
          // preserving order. Insert a section header the first time
          // each new quarter appears.
          const out: React.ReactElement[] = [];
          let prevQuarter: number | null = null;
          for (const it of sorted) {
            if (it.quarter !== prevQuarter) {
              out.push(
                <div
                  key={`section-${it.quarter}`}
                  className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur-sm px-3 py-1.5 border-b border-line/60 flex items-center gap-2"
                >
                  <span className="text-[0.625rem] uppercase tracking-[0.2em] font-semibold text-ink-muted tabular font-mono">
                    {fmtQuarter(it.quarter)}
                  </span>
                  <span className="h-px flex-1 bg-line/60" />
                </div>,
              );
              prevQuarter = it.quarter;
            }
            const isActive = it.id === active.id;
            out.push(
              <button
                key={it.id}
                onClick={() => setActiveId(it.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-line/40 transition-colors",
                  isActive
                    ? "bg-[var(--accent-soft)] border-l-2 border-l-accent"
                    : "hover:bg-surface-hover",
                )}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[0.5625rem] uppercase tracking-wider font-bold text-accent">
                    {outletFor(it.id)}
                  </span>
                </div>
                <h3 className={cn(
                  "text-[0.8125rem] leading-snug",
                  isActive ? "font-semibold text-ink" : "text-ink-2",
                )}>
                  {it.headline}
                </h3>
              </button>,
            );
          }
          return out;
        })()}
      </aside>

      {/* Right pane — full article */}
      <article className="border border-line rounded-md bg-surface px-5 py-5 md:px-7 md:py-6">
        {/* Masthead — outlet + dateline + byline like a real paper */}
        <div className="border-b border-line pb-3 mb-4">
          <div className="text-[0.625rem] uppercase tracking-[0.2em] font-bold text-accent mb-1">
            {outletFor(active.id)}
          </div>
          <h1 className="font-display text-[1.5rem] md:text-[1.75rem] text-ink leading-tight">
            {active.headline}
          </h1>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-2 text-[0.6875rem] text-ink-muted">
            <span className="font-mono uppercase tracking-wider text-ink">
              {article.dateline}
            </span>
            <span>·</span>
            <span>{fmtQuarter(active.quarter)}</span>
            <span>·</span>
            <span className="italic">By {article.byline}</span>
            {active.quarter === currentQuarter && (
              <>
                <span>·</span>
                <span className="text-accent font-semibold uppercase tracking-wider">Today</span>
              </>
            )}
          </div>
        </div>

        {/* Article body — drop cap on first paragraph for newspaper feel */}
        <div className="space-y-3 text-[0.875rem] text-ink-2 leading-relaxed columns-1 md:columns-2 md:gap-7">
          {article.body.map((p, i) => (
            <p key={i} className={cn(i === 0 && "first-letter:font-display first-letter:text-[3rem] first-letter:leading-none first-letter:float-left first-letter:mr-1.5 first-letter:text-ink")}>
              {p}
            </p>
          ))}
        </div>

        {/* Pull quote (if the article carries one) */}
        {article.quote && (
          <blockquote className="my-5 border-l-2 border-accent pl-4 italic text-[0.9375rem] text-ink leading-relaxed">
            &ldquo;{article.quote.text}&rdquo;
            <footer className="not-italic mt-1.5 text-[0.6875rem] text-ink-muted uppercase tracking-wider">
              — {article.quote.attribution}
            </footer>
          </blockquote>
        )}

        {/* Network exposure sidebar — what this story does to YOUR cities */}
        {affectedCities.length > 0 && (
          <div className="mt-6 pt-4 border-t border-line">
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-2">
              Your network · cities affected
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {affectedCities.map((c) => (
                <div
                  key={c.code}
                  className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-2 py-1.5"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[0.6875rem] text-ink-muted">{c.code}</span>
                    <span className="text-[0.75rem] text-ink truncate">{c.name}</span>
                  </span>
                  <span className={cn(
                    "tabular font-mono text-[0.6875rem] font-semibold shrink-0",
                    c.pct >= 0 ? "text-positive" : "text-negative",
                  )}>
                    {c.pct >= 0 ? "+" : ""}{c.pct}%
                  </span>
                </div>
              ))}
            </div>
            {active.modifiers && active.modifiers.some((m) => m.rounds > 1) && (
              <p className="text-[0.6875rem] text-ink-muted italic mt-2">
                Demand effect persists for {Math.max(...active.modifiers.map((m) => m.rounds))} quarters from when this news fired.
              </p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

function NewsCard({
  item,
  networkCodes,
  isCurrent,
}: {
  item: NewsItem;
  networkCodes: Set<string>;
  isCurrent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Find network cities touched by this specific headline. Show the
  // per-city modifier pct that THIS news contributes (not the blended
  // total across all current-quarter news), so a +25% MXP modifier on
  // an Expo headline is what shows even if a separate Olympics +20%
  // modifier is also active on the same city.
  const affectedCities = useMemo(() => {
    const out: { code: string; name: string; pct: number; cat?: string }[] = [];
    if (item.modifiers && item.modifiers.length > 0) {
      // Structured path: walk this news's own modifiers, filter to network.
      const byCity = new Map<string, { pct: number; cat?: string }>();
      for (const m of item.modifiers) {
        if (!networkCodes.has(m.city)) continue;
        const prev = byCity.get(m.city);
        // Same city + multiple categories: stack and label as "mixed".
        if (prev) {
          byCity.set(m.city, {
            pct: prev.pct + m.pct,
            cat: prev.cat === m.category ? prev.cat : "mixed",
          });
        } else {
          byCity.set(m.city, { pct: m.pct, cat: m.category });
        }
      }
      for (const [code, { pct, cat }] of byCity) {
        const city = CITIES_BY_CODE[code];
        if (!city) continue;
        out.push({ code, name: city.name, pct, cat });
      }
    } else {
      // Legacy fallback: rely on cityEventImpact() detecting the headline
      // (regex / region match) and surface its blended pct.
      for (const code of networkCodes) {
        const impact = cityEventImpact(code, item.quarter);
        if (impact.pct === 0) continue;
        if (!impact.items.some((it) => it.id === item.id)) continue;
        const city = CITIES_BY_CODE[code];
        if (!city) continue;
        out.push({ code, name: city.name, pct: impact.pct });
      }
    }
    return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }, [item, networkCodes]);

  const totalImpact = affectedCities.reduce((s, c) => s + c.pct, 0);
  const hasImpact = affectedCities.length > 0;
  const positive = totalImpact >= 0;
  const article = expanded ? getArticle(item) : null;

  return (
    <article
      className={cn(
        "rounded-lg border bg-surface px-4 py-3 transition-colors",
        hasImpact
          ? positive
            ? "border-[var(--positive-soft)] hover:bg-surface-hover"
            : "border-[var(--negative-soft)] hover:bg-surface-hover"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="text-[0.625rem] uppercase tracking-[0.18em] font-bold text-accent shrink-0">
            {outletFor(item.id)}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {isCurrent && (
              <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-accent">
                Today
              </span>
            )}
            {hasImpact && (
              <span className={cn(
                "text-[0.6875rem] tabular font-mono font-semibold px-1.5 py-0.5 rounded",
                positive
                  ? "bg-[var(--positive-soft)] text-positive"
                  : "bg-[var(--negative-soft)] text-negative",
              )}>
                {positive ? "+" : ""}{totalImpact}%
              </span>
            )}
            {expanded ? (
              <ChevronUp size={12} className="text-ink-muted" />
            ) : (
              <ChevronDown size={12} className="text-ink-muted" />
            )}
          </div>
        </div>
        <h3 className="text-[1rem] font-display text-ink leading-snug">
          {item.headline}
        </h3>
        {!expanded && (
          <div className="text-[0.75rem] text-ink-2 mt-1 leading-relaxed line-clamp-2">
            {item.detail}
          </div>
        )}
        {!expanded && (
          <div className="text-[0.6875rem] text-ink-muted mt-1.5 italic">
            {hasImpact
              ? `Touches ${affectedCities.length} of your cit${affectedCities.length === 1 ? "y" : "ies"} · tap to read`
              : "Tap to read"}
          </div>
        )}
      </button>

      {expanded && article && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          {/* Dateline + byline like a real newspaper */}
          <div className="text-[0.6875rem] text-ink-muted leading-relaxed">
            <span className="font-mono uppercase tracking-wider text-ink">
              {article.dateline}
            </span>
            <span className="text-ink-muted"> · </span>
            <span>{fmtQuarter(item.quarter)}</span>
            <span className="text-ink-muted"> · </span>
            <span className="italic">By {article.byline}</span>
          </div>

          {/* Article body */}
          <div className="space-y-2 text-[0.8125rem] text-ink-2 leading-relaxed">
            {article.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {hasImpact ? (
            <div className="pt-2 border-t border-line/60">
              <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">
                Your network · cities affected
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {affectedCities.map((c) => (
                  <div
                    key={c.code}
                    className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-2 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[0.6875rem] text-ink-muted">{c.code}</span>
                      <span className="text-[0.75rem] text-ink truncate">{c.name}</span>
                      {c.cat && c.cat !== "all" && (
                        <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted shrink-0">
                          {c.cat}
                        </span>
                      )}
                    </span>
                    <span className={cn(
                      "tabular font-mono text-[0.6875rem] font-semibold shrink-0",
                      c.pct >= 0 ? "text-positive" : "text-negative",
                    )}>
                      {c.pct >= 0 ? "+" : ""}{c.pct}%
                    </span>
                  </div>
                ))}
              </div>
              {item.modifiers && item.modifiers.some((m) => m.rounds > 1) && (
                <p className="text-[0.6875rem] text-ink-muted italic mt-2">
                  Demand effect persists for {Math.max(...item.modifiers.map((m) => m.rounds))} rounds from when this news fired.
                </p>
              )}
            </div>
          ) : (
            <div className="pt-2 border-t border-line/60 text-[0.75rem] text-ink-muted italic">
              No direct impact on your current network.
            </div>
          )}
        </div>
      )}
    </article>
  );
}
