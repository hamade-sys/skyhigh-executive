"use client";

import { Badge } from "@/components/ui";
import { NEWS_BY_QUARTER } from "@/data/world-news";
import { useGame } from "@/store/game";
import type { NewsItem } from "@/types/game";

export function NewsPanel() {
  const currentQuarter = useGame((s) => s.currentQuarter);
  const today = NEWS_BY_QUARTER[currentQuarter] ?? [];
  const forecast = [currentQuarter + 1, currentQuarter + 2]
    .filter((q) => q <= 20)
    .map((q) => ({ q, items: NEWS_BY_QUARTER[q] ?? [] }));

  return (
    <div className="space-y-5">
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Q{currentQuarter} · 5 headlines
        </div>
        <div className="space-y-3">
          {today.map((item) => <NewsRow key={item.id} item={item} />)}
        </div>
      </section>

      {forecast.length > 0 && (
        <section className="pt-3 border-t border-line">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Upcoming forecast
          </div>
          <div className="space-y-3 opacity-70">
            {forecast.map((f) => (
              <div key={f.q}>
                <div className="text-[0.75rem] text-ink-muted font-mono mb-1">Q{f.q}</div>
                {f.items.slice(0, 2).map((item) => <NewsRow key={item.id} item={item} compact />)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NewsRow({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  return (
    <div className="flex gap-3 items-start">
      <span className={`${compact ? "text-[1rem]" : "text-[1.125rem]"} text-ink-muted mt-0.5 w-5 text-center`}>
        {item.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge tone={newsTone(item.impact)}>{item.impact.toUpperCase()}</Badge>
        </div>
        <div className="text-ink font-medium text-[0.875rem] leading-snug">{item.headline}</div>
        <div className="text-[0.75rem] text-ink-muted mt-0.5 leading-relaxed">{item.detail}</div>
      </div>
    </div>
  );
}

function newsTone(
  impact: NewsItem["impact"],
): "neutral" | "primary" | "accent" | "positive" | "negative" | "warning" | "info" {
  switch (impact) {
    case "tourism": return "accent";
    case "business": return "primary";
    case "cargo": return "positive";
    case "brand": return "info";
    case "fuel": return "warning";
    case "ops": return "negative";
    default: return "neutral";
  }
}
