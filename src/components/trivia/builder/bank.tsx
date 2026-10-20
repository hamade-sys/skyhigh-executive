"use client";

/** Column-bank list pieces shared by the hub and the editor's bank panel. */

import { useState } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BankColumn } from "@/lib/trivia/types";
import { inputClass } from "./ui";

export function filterBank(list: BankColumn[], query: string, starredOnly: boolean): BankColumn[] {
  const q = query.trim().toLowerCase();
  return list.filter((c) => {
    if (starredOnly && !c.starred) return false;
    if (!q) return true;
    if (c.title.toLowerCase().includes(q) || (c.sourceTitle ?? "").toLowerCase().includes(q)) return true;
    return c.questions.some((x) => x.question.toLowerCase().includes(q) || x.answer.toLowerCase().includes(q));
  });
}

export function BankFilters({
  scope,
  setScope,
  counts,
  query,
  setQuery,
  starredOnly,
  setStarredOnly,
}: {
  scope: "mine" | "shared" | "library";
  setScope: (s: "mine" | "shared" | "library") => void;
  counts: Record<"mine" | "shared" | "library", number>;
  query: string;
  setQuery: (q: string) => void;
  starredOnly: boolean;
  setStarredOnly: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, questions and answers" aria-label="Search the column bank" className={cn(inputClass, "pl-9")} />
      </div>
      {(
        [
          ["mine", "Mine"],
          ["shared", "Shared"],
          ["library", "ICAN library"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={scope === key}
          onClick={() => setScope(key)}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold",
            scope === key ? "border-[#02797F] bg-[#02797F] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          {label} <span className={cn("text-xs tabular-nums", scope === key ? "text-white/80" : "text-slate-500")}>{counts[key]}</span>
        </button>
      ))}
      {scope === "mine" && (
        <button
          type="button"
          aria-pressed={starredOnly}
          onClick={() => setStarredOnly(!starredOnly)}
          className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", starredOnly ? "border-[#b3a400] bg-[#F7E300]/30 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}
        >
          <Star className="h-4 w-4" /> Starred
        </button>
      )}
    </div>
  );
}

export function BankRow({ col, actions }: { col: BankColumn; actions: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ready = col.questions.filter((q) => q.question.trim() && q.answer.trim()).length;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 basis-56 items-center gap-3 text-left">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate t-font font-extrabold uppercase tracking-wide text-slate-900">{col.title}</span>
            <span className="block truncate text-xs text-slate-500">
              {ready} of {col.questions.length} ready
              {col.sourceTitle && ` · from ${col.sourceTitle}`}
              {col.timesUsed > 0 && ` · used ${col.timesUsed}×`}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {open && (
        <ol className="divide-y divide-slate-100 border-t border-slate-100">
          {col.questions.map((q) => (
            <li key={q.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[4.5rem_1fr_minmax(0,14rem)] sm:gap-4">
              <span className="t-font font-extrabold text-[#02797F]">{q.value.toLocaleString("en-US")}</span>
              <span className="text-slate-800">{q.question || <em className="text-slate-400">no question</em>}</span>
              <span className="font-semibold text-slate-900">{q.answer || <em className="font-normal text-slate-400">no answer</em>}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

