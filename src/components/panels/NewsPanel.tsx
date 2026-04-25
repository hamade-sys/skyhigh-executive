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
import { Newspaper, ChevronDown, ChevronUp } from "lucide-react";

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

export function NewsPanel() {
  const currentQuarter = useGame((s) => s.currentQuarter);
  const worldCupHostCode = useGame((s) => s.worldCupHostCode);
  const olympicHostCode = useGame((s) => s.olympicHostCode);
  const player = useGame(selectPlayer);

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

  // Past + current quarters only, most recent first (per the no-spoilers rule).
  const quartersToShow = useMemo(() => {
    const out: number[] = [];
    for (let q = currentQuarter; q >= 1; q--) out.push(q);
    return out;
  }, [currentQuarter]);

  return (
    <div className="space-y-5">
      <header>
        <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted mb-1 flex items-center gap-1.5">
          <Newspaper size={12} /> World news · past + current quarter
        </div>
        <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
          Tap a story to see which of your cities and routes it touches.
          Forecasts of upcoming quarters are deliberately not shown — you read
          the world the same way the boardroom does.
        </p>
      </header>

      {quartersToShow.map((q) => {
        // Mix in dynamic host-city announcements (World Cup / Olympics)
        // alongside the static WORLD_NEWS entries for this round.
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
      })}
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

  // Find network cities touched by this specific headline.
  const affectedCities = useMemo(() => {
    const out: { code: string; name: string; pct: number }[] = [];
    for (const code of networkCodes) {
      const impact = cityEventImpact(code, item.quarter);
      if (impact.pct === 0) continue;
      if (!impact.items.some((it) => it.id === item.id)) continue;
      const city = CITIES_BY_CODE[code];
      if (!city) continue;
      out.push({ code, name: city.name, pct: impact.pct });
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
