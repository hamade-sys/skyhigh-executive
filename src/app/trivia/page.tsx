"use client";

/**
 * /trivia — ICAN Trivia home.
 *
 * Visitors get the pitch and a way in (sign in to build, or join a game
 * with a code). Signed-in hosts get their workspace:
 *   Boards       their working games
 *   Templates    the templates bank — ICAN library, their own, shared
 *   Column bank  every column they've saved, plus shared and library ones
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookmarkPlus,
  ChevronDown,
  Copy,
  Library,
  Loader2,
  Pencil,
  Play,
  Plus,
  Radio,
  Share2,
  Star,
  Swords,
  Trophy,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import { blankContent, cloneColumn, rowValues, TOOL_INFO } from "@/lib/trivia/content";
import { api, errorMessage } from "@/lib/trivia/client/api";
import { TOOL_KINDS, type BankColumn, type TriviaSetFull, type TriviaSetSummary } from "@/lib/trivia/types";
import { TriviaFooter, TriviaHeader } from "@/components/trivia/builder/TriviaChrome";
import { IcanStamp } from "@/components/trivia/IcanStamp";
import { TriviaBoard } from "@/components/trivia/TriviaBoard";
import { ToolIcon } from "@/components/trivia/Teams";
import { BuilderButton, Toast } from "@/components/trivia/builder/ui";
import { BankFilters, BankRow, filterBank } from "@/components/trivia/builder/bank";

type Tab = "boards" | "templates" | "bank";

interface SetsResponse {
  boards: TriviaSetSummary[];
  templates: { mine: TriviaSetSummary[]; shared: TriviaSetSummary[]; library: TriviaSetSummary[] };
}

interface LiveRoom {
  id: string;
  code: string;
  title: string;
  status: string;
}

export default function TriviaHome() {
  return (
    <Suspense fallback={<div className="flex-1 bg-white" />}>
      <TriviaHomeInner />
    </Suspense>
  );
}

function TriviaHomeInner() {
  const { user, loading } = useAuth();
  const signedIn = Boolean(user && !user.is_anonymous);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F8FAFC]">
      <TriviaHeader />
      {loading ? (
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="Loading" />
        </div>
      ) : signedIn ? (
        <Workspace />
      ) : (
        <Landing guest={Boolean(user?.is_anonymous)} />
      )}
      <TriviaFooter />
    </div>
  );
}

// ─── Landing ────────────────────────────────────────────────

const PREVIEW_BOARD = [
  ["Leadership", [true, true, false, true, true]],
  ["Strategy", [true, false, true, true, true]],
  ["GCC Economies", [true, true, true, false, true]],
  ["HR Metrics", [false, true, true, true, true]],
  ["Wordplay", [true, true, true, true, false]],
] as const;

function Landing({ guest }: { guest: boolean }) {
  const board = PREVIEW_BOARD.map(([title, cells], ci) => ({
    id: `p${ci}`,
    title,
    cells: cells.map((live, ri) => ({
      id: `p${ci}-${ri}`,
      value: (ri + 1) * 200,
      used: !live,
      playable: true,
      winnerTeamId: !live ? (ci % 2 ? "a" : "b") : null,
    })),
  }));
  const teams = [
    { id: "a", name: "Falcons", color: "#00C2CB" },
    { id: "b", name: "Pearls", color: "#F7E300" },
  ];
  return (
    <main>
      <section className="bg-[linear-gradient(135deg,#EFF6FF_0%,#FFFFFF_45%,#E6F9FA_100%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#02797F]">New from ICAN Simulations</p>
            <h1 className="mt-3 t-font text-5xl font-extrabold leading-[1.04] tracking-tight text-[#545454] md:text-6xl">
              ICAN <span className="t-hl text-[#02797F]">Trivia</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Jeopardy-style quiz games for workshops, offsites and team events. Build a board in minutes — or let AI draft it — put it on the big screen, and teams buzz in from their phones with a four-letter code. No app, no sign-up for players.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?next=%2Ftrivia" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#02797F] px-6 font-semibold text-white hover:bg-[#026167]">
                {guest ? "Sign in to build a board" : "Build a board"} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/play" className="inline-flex min-h-12 items-center rounded-full border border-slate-300 bg-white px-6 font-semibold text-slate-800 hover:bg-slate-50">
                Join a game
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">Hosts sign in so their boards, templates and column bank are saved.</p>
          </div>
          <div className="trivia-stage aspect-[16/10] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_30px_60px_-24px_rgba(2,121,127,0.35)]" aria-hidden>
            <TriviaBoard board={board} teams={teams} rows={5} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="t-font text-3xl font-extrabold text-[#545454]">How it plays</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {[
            ["Build", "Write your categories, points and questions — or pull in whole columns from your bank, start from an ICAN template, or let AI draft answers, hints and full columns."],
            ["Host", "Pick Traditional or Competitive, set up to five teams with names and colours, and open a room. Put the big screen on the projector; run the game from your laptop."],
            ["Play", "Teams join at sim.icanmena.com/play with the four-letter code and buzz in from their phones. Cells take the colour of the team that answers them."],
          ].map(([title, body], i) => (
            <li key={title}>
              <span className="t-font text-5xl font-extrabold text-[#02797F]/25">{i + 1}</span>
              <h3 className="mt-2 t-font text-xl font-extrabold text-slate-900">{title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-[#F9FAFB]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <Zap className="h-7 w-7 text-[#02797F]" aria-hidden />
            <h2 className="mt-3 t-font text-2xl font-extrabold text-[#545454]">Traditional</h2>
            <p className="mt-2 leading-relaxed text-slate-600">
              The TV show. The host reads the question, buzzers open, and the first team in answers. A right answer wins control of the board; a wrong one costs the points. Daily Doubles and a wagered Final Trivia round.
            </p>
          </div>
          <div>
            <Swords className="h-7 w-7 text-[#02797F]" aria-hidden />
            <h2 className="mt-3 t-font text-2xl font-extrabold text-[#545454]">Competitive</h2>
            <p className="mt-2 leading-relaxed text-slate-600">Teams take turns — and every team brings tools to the table.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {TOOL_KINDS.map((k) => (
                <li key={k} className="flex gap-3">
                  <ToolIcon tool={k} className="mt-0.5 h-5 w-5 shrink-0 text-[#02797F]" />
                  <span>
                    <span className="block font-semibold text-slate-900">{TOOL_INFO[k].label}</span>
                    <span className="block text-sm text-slate-600">{TOOL_INFO[k].blurb}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

// ─── Workspace ──────────────────────────────────────────────

function Workspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (["boards", "templates", "bank"].includes(params.get("tab") ?? "") ? params.get("tab") : "boards") as Tab;
  const [sets, setSets] = useState<SetsResponse | null>(null);
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api<SetsResponse>("/api/trivia/sets"), api<{ rooms: LiveRoom[] }>("/api/trivia/rooms")]);
      setSets(s);
      setRooms(r.rooms);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const setTab = (next: Tab) => router.replace(`${pathname}?tab=${next}`, { scroll: false });

  async function newBoard(fromId?: string) {
    setCreating(true);
    try {
      const res = await api<{ set: TriviaSetFull }>("/api/trivia/sets", { body: { kind: "board", fromId } });
      router.push(`/trivia/boards/${res.set.id}`);
    } catch (err) {
      setToast(errorMessage(err));
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-4">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center" aria-hidden>
            <IcanStamp className="absolute inset-0 h-full w-full text-[#00C2CB] opacity-[0.18]" />
            <Trophy className="relative h-5 w-5 text-[#01585D]" />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#01585D]">ICAN Simulations</p>
            <h1 className="t-font text-2xl font-bold tracking-tight text-slate-900">ICAN Trivia</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">Build a board, set up your teams, and host it on the big screen. Players join from their phones with a four-letter code.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/play" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Join a game
          </Link>
          <BuilderButton tone="primary" onClick={() => newBoard()} busy={creating} icon={<Plus className="h-4 w-4" />}>
            New board
          </BuilderButton>
        </div>
      </div>

      {rooms.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#02797F]/20 bg-[#02797F]/[0.04] p-4" aria-label="Games running now">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#02797F]">
            <Radio className="h-4 w-4" aria-hidden /> Running now
          </p>
          <ul className="flex flex-wrap gap-2">
            {rooms.map((r) => (
              <li key={r.id}>
                <Link href={`/trivia/host/${r.code}`} className="inline-flex min-h-10 items-center gap-3 rounded-lg bg-white px-3 text-sm shadow-sm ring-1 ring-slate-200 hover:ring-[#02797F]/40">
                  <span className="t-font font-extrabold tracking-[0.14em] text-[#02797F]">{r.code}</span>
                  <span className="max-w-[16rem] truncate text-slate-700">{r.title}</span>
                  <span className="text-xs text-slate-500">{r.status === "lobby" ? "waiting room" : "in play"}</span>
                  <span className="font-semibold text-slate-900">Resume →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 border-b border-slate-200" role="tablist" aria-label="ICAN Trivia sections">
        {(
          [
            ["boards", "My boards", sets?.boards.length],
            ["templates", "Templates", sets ? sets.templates.library.length + sets.templates.mine.length + sets.templates.shared.length : undefined],
            ["bank", "Column bank", undefined],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px mr-6 inline-flex min-h-11 items-center gap-2 border-b-2 text-sm font-semibold transition-colors",
              tab === key ? "border-[#02797F] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
            {count !== undefined && <span className="rounded-full bg-slate-100 px-2 text-xs tabular-nums text-slate-600">{count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel">
        {error && (
          <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
            <BuilderButton size="sm" onClick={() => load()}>
              Try again
            </BuilderButton>
          </div>
        )}
        {!sets && !error ? (
          <div className="grid min-h-[30vh] place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />
          </div>
        ) : sets ? (
          tab === "boards" ? (
            <BoardsTab boards={sets.boards} reload={load} say={setToast} newBoard={newBoard} creating={creating} goTemplates={() => setTab("templates")} />
          ) : tab === "templates" ? (
            <TemplatesTab templates={sets.templates} reload={load} say={setToast} onUseTemplate={(id) => newBoard(id)} />
          ) : (
            <BankTab say={setToast} />
          )
        ) : null}
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CategoryLine({ titles }: { titles: string[] }) {
  return <p className="mt-1 truncate text-sm text-slate-500">{titles.filter(Boolean).join(" · ") || "No categories yet"}</p>;
}

function BoardsTab({
  boards,
  reload,
  say,
  newBoard,
  creating,
  goTemplates,
}: {
  boards: TriviaSetSummary[];
  reload: () => Promise<void>;
  say: (m: string) => void;
  newBoard: () => void;
  creating: boolean;
  goTemplates: () => void;
}) {
  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center">
        <span className="relative mb-3 grid h-12 w-12 place-items-center" aria-hidden>
          <IcanStamp className="absolute inset-0 h-full w-full text-[#00C2CB] opacity-[0.16]" />
          <Trophy className="relative h-5 w-5 text-[#01585D]" />
        </span>
        <p className="text-sm font-semibold text-slate-900">No boards yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">Start from a blank 6 × 5 board, or pick one of the ICAN templates and make it yours.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <BuilderButton tone="primary" onClick={newBoard} busy={creating} icon={<Plus className="h-4 w-4" />}>
            New blank board
          </BuilderButton>
          <BuilderButton onClick={goTemplates} icon={<Library className="h-4 w-4" />}>
            Browse templates
          </BuilderButton>
        </div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {boards.map((b) => (
        <SetRow key={b.id} set={b} reload={reload} say={say} />
      ))}
    </ul>
  );
}

function SetRow({ set, reload, say, onUse }: { set: TriviaSetSummary; reload: () => Promise<void>; say: (m: string) => void; onUse?: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function copy(kind: "board" | "template") {
    setBusy(kind);
    try {
      const res = await api<{ set: TriviaSetFull }>("/api/trivia/sets", {
        body: { kind, fromId: set.id, title: kind === "board" && set.kind === "board" ? `${set.title} (copy)` : set.title },
      });
      if (kind === "template") {
        say("Saved to your templates.");
        await reload();
      } else router.push(`/trivia/boards/${res.set.id}`);
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setBusy(null);
      setMenu(false);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/api/trivia/sets/${set.id}`, { method: "DELETE" });
      say(`Deleted “${set.title}”. Its columns stay in your column bank.`);
      await reload();
    } catch (err) {
      say(errorMessage(err));
      setBusy(null);
    }
  }

  async function toggleShare() {
    setBusy("share");
    try {
      await api(`/api/trivia/sets/${set.id}`, { method: "PUT", body: { visibility: set.visibility === "shared" ? "private" : "shared" } });
      say(set.visibility === "shared" ? "Only you can see this template now." : "Shared — every ICAN Trivia host can use it.");
      await reload();
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setBusy(null);
      setMenu(false);
    }
  }

  const editable = set.mine;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2">
          {editable ? (
            <Link href={`/trivia/boards/${set.id}`} className="truncate t-font text-lg font-extrabold text-slate-900 hover:text-[#02797F]">
              {set.title}
            </Link>
          ) : (
            <span className="truncate t-font text-lg font-extrabold text-slate-900">{set.title}</span>
          )}
          {set.visibility === "shared" && <span className="rounded-full bg-[#02797F]/10 px-2 py-0.5 text-xs font-semibold text-[#02797F]">Shared</span>}
          {set.visibility === "library" && <span className="rounded-full bg-[#E6F2F2] px-2 py-0.5 text-xs font-semibold text-[#01585D]">ICAN library</span>}
        </div>
        {set.description && <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">{set.description}</p>}
        <CategoryLine titles={set.columnTitles} />
        <p className="mt-1 text-xs text-slate-400">
          {set.questionCount} questions ready
          {set.visibility !== "library" && ` · updated ${timeAgo(set.updatedAt)}`}
          {set.plays > 0 && ` · played ${set.plays}×`}
          {!set.mine && set.ownerLabel && set.visibility === "shared" && ` · by ${set.ownerLabel}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onUse && (
          <BuilderButton size="sm" onClick={onUse} icon={<Copy className="h-4 w-4" />}>
            Use template
          </BuilderButton>
        )}
        {editable && !onUse && (
          <Link href={`/trivia/boards/${set.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        )}
        <Link
          href={`/trivia/setup/${encodeURIComponent(set.id)}`}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#00C2CB] px-3 text-sm font-semibold text-white hover:bg-[#009AA1]",
            set.questionCount === 0 && "pointer-events-none opacity-45",
          )}
          aria-disabled={set.questionCount === 0}
        >
          <Play className="h-4 w-4" /> Host
        </Link>
        {(editable || set.kind === "template") && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-haspopup="menu"
              aria-label={`More for ${set.title}`}
              className="inline-grid min-h-9 min-w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <MenuItem onClick={() => copy("board")} busy={busy === "board"} icon={<Copy className="h-4 w-4" />}>
                  {set.kind === "board" ? "Duplicate board" : "Make a board from it"}
                </MenuItem>
                {set.kind === "board" && (
                  <MenuItem onClick={() => copy("template")} busy={busy === "template"} icon={<BookmarkPlus className="h-4 w-4" />}>
                    Save as a template
                  </MenuItem>
                )}
                {editable && set.kind === "template" && (
                  <MenuItem onClick={toggleShare} busy={busy === "share"} icon={<Share2 className="h-4 w-4" />}>
                    {set.visibility === "shared" ? "Stop sharing" : "Share with ICAN hosts"}
                  </MenuItem>
                )}
                {editable &&
                  (confirmDelete ? (
                    <div className="flex items-center gap-2 px-2 py-2 text-sm">
                      <span className="flex-1 text-slate-600">Delete for good?</span>
                      <button type="button" onClick={remove} className="rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white">
                        {busy === "delete" ? "Deleting…" : "Delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="px-1 text-slate-500">
                        Keep
                      </button>
                    </div>
                  ) : (
                    <MenuItem onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />} danger>
                      Delete…
                    </MenuItem>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({ children, onClick, icon, busy, danger }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; busy?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm", danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50")}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function TemplatesTab({
  templates,
  reload,
  say,
  onUseTemplate,
}: {
  templates: SetsResponse["templates"];
  reload: () => Promise<void>;
  say: (m: string) => void;
  onUseTemplate: (id: string) => void;
}) {
  const [scope, setScope] = useState<"library" | "mine" | "shared">("library");
  const list = templates[scope];
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Which templates">
        {(
          [
            ["library", "ICAN library", templates.library.length],
            ["mine", "My templates", templates.mine.length],
            ["shared", "Shared by hosts", templates.shared.length],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={scope === key}
            onClick={() => setScope(key)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
              scope === key ? "border-[#02797F]/30 bg-[#E6F2F2] text-[#01585D]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {label} <span className={cn("text-xs tabular-nums", scope === key ? "text-[#01585D]/70" : "text-slate-400")}>{n}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center text-slate-600">
          {scope === "mine"
            ? "Save any board as a template (Boards → ⌄ → Save as a template) and it lands here, ready to reuse."
            : "No other host has shared a template yet. Share one of yours from My templates."}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {list.map((t) => (
            <SetRow key={t.id} set={t} reload={reload} say={say} onUse={() => onUseTemplate(t.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BankTab({ say }: { say: (m: string) => void }) {
  const router = useRouter();
  const [bank, setBank] = useState<{ mine: BankColumn[]; shared: BankColumn[]; library: BankColumn[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "shared" | "library">("mine");
  const [query, setQuery] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      setBank(await api("/api/trivia/bank"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const list = useMemo(() => filterBank(bank?.[scope] ?? [], query, starredOnly), [bank, scope, query, starredOnly]);

  async function patch(col: BankColumn, body: Record<string, unknown>, message?: string) {
    try {
      await api(`/api/trivia/bank/${col.id}`, { method: "PATCH", body });
      if (message) say(message);
      await load();
    } catch (err) {
      say(errorMessage(err));
    }
  }

  async function startBoard(col: BankColumn) {
    try {
      const content = blankContent(6);
      content.columns[0] = cloneColumn(col, rowValues(content));
      const created = await api<{ set: TriviaSetFull }>("/api/trivia/sets", { body: { kind: "board", title: `${col.title} board` } });
      await api(`/api/trivia/sets/${created.set.id}`, { method: "PUT", body: { content: { ...created.set.content, columns: content.columns } } });
      void api(`/api/trivia/bank/${encodeURIComponent(col.id)}`, { body: { used: true } }).catch(() => undefined);
      router.push(`/trivia/boards/${created.set.id}`);
    } catch (err) {
      say(errorMessage(err));
    }
  }

  if (error) return <p className="text-rose-700">{error}</p>;
  if (!bank) {
    return (
      <div className="grid min-h-[30vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />
      </div>
    );
  }
  return (
    <div>
      <p className="mb-4 max-w-2xl text-slate-600">Every titled column you save on a board or template lands here, and stays even if the board is deleted. In the editor, “Add from bank” drops any of them into a board.</p>
      <BankFilters scope={scope} setScope={setScope} counts={{ mine: bank.mine.length, shared: bank.shared.length, library: bank.library.length }} query={query} setQuery={setQuery} starredOnly={starredOnly} setStarredOnly={setStarredOnly} />
      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center text-slate-600">
          {query ? `No columns match “${query}”.` : scope === "mine" ? "Your bank fills up as you save boards. Give a column a title and at least one question." : "Nothing here yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((col) => (
            <BankRow
              key={col.id}
              col={col}
              actions={
                <>
                  <BuilderButton size="sm" onClick={() => startBoard(col)} icon={<Plus className="h-4 w-4" />}>
                    New board with it
                  </BuilderButton>
                  {col.scope === "mine" && (
                    <>
                      <IconToggle on={col.starred} label={col.starred ? "Unstar" : "Star"} onClick={() => patch(col, { starred: !col.starred })}>
                        <Star className={cn("h-4 w-4", col.starred && "fill-[#F7E300] text-[#b3a400]")} />
                      </IconToggle>
                      <IconToggle on={col.shared} label={col.shared ? "Stop sharing" : "Share with ICAN hosts"} onClick={() => patch(col, { shared: !col.shared }, col.shared ? "Column is private again." : "Column shared with ICAN hosts.")}>
                        <Share2 className={cn("h-4 w-4", col.shared && "text-[#02797F]")} />
                      </IconToggle>
                      <DeleteColumn col={col} onDeleted={load} say={say} />
                    </>
                  )}
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IconToggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
      {children}
    </button>
  );
}

function DeleteColumn({ col, onDeleted, say }: { col: BankColumn; onDeleted: () => Promise<void>; say: (m: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <button
          type="button"
          onClick={async () => {
            try {
              await api(`/api/trivia/bank/${col.id}`, { method: "DELETE" });
              say(`Removed “${col.title}” from your bank.`);
              await onDeleted();
            } catch (err) {
              say(errorMessage(err));
            }
          }}
          className="rounded-md bg-rose-600 px-2.5 py-1.5 font-semibold text-white"
        >
          Remove
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="px-2 py-1.5 text-slate-500">
          Keep
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setConfirm(true)} aria-label={`Remove ${col.title} from the bank`} title="Remove from bank" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
