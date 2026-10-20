"use client";

/**
 * /trivia/boards/[id] — the board editor.
 *
 * Columns side by side, a points row that sets every column at once,
 * and a side panel for each question (question, answer, hint, host
 * notes, picture, Daily Double). AI assist can suggest an answer or a
 * hint, write a single question, fill a whole column, or draft the
 * whole board. Changes autosave; every titled column also lands in the
 * column bank on save, so it can be pulled into another board later.
 *
 * Opening a template that isn't yours shows a read-only preview with
 * "Use template".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Library,
  Loader2,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  blankColumn,
  cloneColumn,
  contentStats,
  DEFAULT_VALUES,
  findCell,
  isPlayable,
  LIMITS,
  MAX_COLUMNS,
  MAX_ROWS,
  MAX_VALUE,
  newId,
  rowValues,
} from "@/lib/trivia/content";
import { api, errorMessage } from "@/lib/trivia/client/api";
import type { BankColumn, TriviaColumn, TriviaContent, TriviaQuestion, TriviaSetFull } from "@/lib/trivia/types";
import { HostGate } from "@/components/trivia/builder/HostGate";
import { SettingsForm, settingsProblem } from "@/components/trivia/builder/SettingsForm";
import { BankFilters, BankRow, filterBank } from "@/components/trivia/builder/bank";
import { BuilderButton, Field, SidePanel, Toast, Toggle, inputClass } from "@/components/trivia/builder/ui";
import { TriviaBoard } from "@/components/trivia/TriviaBoard";
import { Wordmark } from "@/components/trivia/Wordmark";

type SaveState = "saved" | "dirty" | "saving" | "error";
type Panel =
  | { kind: "cell"; cellId: string }
  | { kind: "settings" }
  | { kind: "bank"; replaceColumnId: string | null }
  | { kind: "ai-board" }
  | { kind: "ai-column"; columnId: string | null }
  | { kind: "final" }
  | null;

interface UndoToast {
  message: string;
  undo?: TriviaContent;
}

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");
  return (
    <HostGate next={`/trivia/boards/${encodeURIComponent(id)}`}>
      <EditorLoader id={id} />
    </HostGate>
  );
}

function EditorLoader({ id }: { id: string }) {
  const [set, setSet] = useState<TriviaSetFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ set: TriviaSetFull }>(`/api/trivia/sets/${encodeURIComponent(id)}`)
      .then((res) => !cancelled && setSet(res.set))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (!set) {
    return (
      <div className="grid flex-1 place-items-center bg-[#F9FAFB] p-6 text-center">
        {error ? (
          <div className="space-y-3">
            <p className="text-slate-700">{error}</p>
            <Link href="/trivia" className="font-semibold text-[#02797F] underline-offset-4 hover:underline">
              Back to ICAN Trivia
            </Link>
          </div>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="Loading the board" />
        )}
      </div>
    );
  }
  return set.mine ? <Editor initial={set} /> : <Preview set={set} />;
}

// ─── Read-only preview (library / shared templates) ─────────

function Preview({ set }: { set: TriviaSetFull }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const board = set.content.columns.map((c) => ({
    id: c.id,
    title: c.title,
    cells: c.questions.map((q) => ({ id: q.id, value: q.value, used: false, playable: isPlayable(q), winnerTeamId: null })),
  }));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F9FAFB]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/trivia?tab=templates" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Templates
          </Link>
          <span className="ml-auto">
            <Wordmark size="sm" />
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">{set.visibility === "library" ? "ICAN library template" : `Shared template${set.ownerLabel ? ` · by ${set.ownerLabel}` : ""}`}</p>
        <h1 className="mt-1 t-font text-3xl font-extrabold text-[#3a3a3a]">{set.title}</h1>
        {set.description && <p className="mt-2 max-w-2xl text-slate-600">{set.description}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <BuilderButton
            tone="primary"
            size="lg"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ set: TriviaSetFull }>("/api/trivia/sets", { body: { kind: "board", fromId: set.id } });
                router.push(`/trivia/boards/${res.set.id}`);
              } catch (err) {
                setError(errorMessage(err));
                setBusy(false);
              }
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Use template
          </BuilderButton>
          <Link href={`/trivia/setup/${encodeURIComponent(set.id)}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50">
            <Play className="h-4 w-4" /> Host it as is
          </Link>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="trivia-stage mt-8 aspect-[16/9] max-h-[70vh] rounded-2xl p-3">
          <TriviaBoard board={board} rows={rowValues(set.content).length} />
        </div>
        <p className="mt-3 text-sm text-slate-500">Answers stay hidden here — use the template to see and edit every question.</p>
      </main>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────

function Editor({ initial }: { initial: TriviaSetFull }) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [content, setContentState] = useState<TriviaContent>(initial.content);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const rev = useRef(0);
  const savedRev = useRef(0);
  const latest = useRef({ title, description, content });

  useEffect(() => {
    latest.current = { title, description, content };
  });

  useEffect(() => {
    api<{ enabled: boolean }>("/api/trivia/ai")
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  const touch = useCallback(() => {
    rev.current += 1;
    setSave("dirty");
  }, []);

  const setContent = useCallback(
    (updater: TriviaContent | ((c: TriviaContent) => TriviaContent)) => {
      setContentState((c) => (typeof updater === "function" ? (updater as (c: TriviaContent) => TriviaContent)(c) : updater));
      touch();
    },
    [touch],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (rev.current === savedRev.current) return true;
    const target = rev.current;
    const { title: t, description: d, content: c } = latest.current;
    setSave("saving");
    try {
      const res = await api<{ set: TriviaSetFull }>(`/api/trivia/sets/${meta.id}`, {
        method: "PUT",
        body: { title: t.trim() || "Untitled board", description: d, content: c },
      });
      savedRev.current = target;
      setMeta((m) => ({ ...m, ...res.set, content: m.content }));
      setSaveError(null);
      setSave(rev.current === target ? "saved" : "dirty");
      return true;
    } catch (err) {
      setSaveError(errorMessage(err));
      setSave("error");
      return false;
    }
  }, [meta.id]);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (save !== "dirty") return;
    const t = window.setTimeout(() => void flush(), 900);
    return () => window.clearTimeout(t);
  }, [save, content, title, description, flush]);

  // Don't lose work to a closed tab.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (rev.current !== savedRev.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const stats = useMemo(() => contentStats(content), [content]);
  const rows = useMemo(() => rowValues(content), [content]);
  const competitive = content.settings.mode === "competitive";

  const withUndo = useCallback(
    (message: string, next: (c: TriviaContent) => TriviaContent) => {
      setContentState((c) => {
        const after = next(c);
        setToast({ message, undo: c });
        return after;
      });
      touch();
    },
    [touch],
  );

  const updateColumn = (columnId: string, fn: (c: TriviaColumn) => TriviaColumn) =>
    setContent((c) => ({ ...c, columns: c.columns.map((col) => (col.id === columnId ? fn(col) : col)) }));

  const updateQuestion = (cellId: string, patch: Partial<TriviaQuestion>) =>
    setContent((c) => ({
      ...c,
      columns: c.columns.map((col) => ({ ...col, questions: col.questions.map((q) => (q.id === cellId ? { ...q, ...patch } : q)) })),
    }));

  function setRowValue(index: number, value: number) {
    setContent((c) => ({
      ...c,
      columns: c.columns.map((col) => ({ ...col, questions: col.questions.map((q, i) => (i === index ? { ...q, value } : q)) })),
    }));
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    const value = (rows[rows.length - 1] ?? 0) + (rows.length > 1 ? rows[rows.length - 1] - rows[rows.length - 2] : 200);
    setContent((c) => ({
      ...c,
      columns: c.columns.map((col) => ({ ...col, questions: [...col.questions, { id: newId("q"), value, question: "", answer: "" }] })),
    }));
  }

  function removeRow() {
    if (rows.length <= 1) return;
    withUndo("Removed the bottom row.", (c) => ({ ...c, columns: c.columns.map((col) => ({ ...col, questions: col.questions.slice(0, rows.length - 1) })) }));
  }

  function addColumn(column?: TriviaColumn) {
    if (content.columns.length >= MAX_COLUMNS) {
      setToast({ message: `A board holds up to ${MAX_COLUMNS} columns.` });
      return null;
    }
    const col = column ?? blankColumn(rows.length ? rows : DEFAULT_VALUES);
    setContent((c) => ({ ...c, columns: [...c.columns, col] }));
    return col;
  }

  function moveColumn(columnId: string, dir: -1 | 1) {
    setContent((c) => {
      const i = c.columns.findIndex((col) => col.id === columnId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.columns.length) return c;
      const columns = [...c.columns];
      [columns[i], columns[j]] = [columns[j], columns[i]];
      return { ...c, columns };
    });
  }

  async function host() {
    const ok = await flush();
    if (ok) router.push(`/trivia/setup/${meta.id}`);
  }

  const openCell = (cellId: string) => setPanel({ kind: "cell", cellId });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">
      <header className="z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/trivia" aria-label="Back to ICAN Trivia" className="inline-flex shrink-0 items-center gap-1 text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            <Wordmark size="sm" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor="board-title" className="sr-only">
              Board title
            </label>
            <input
              id="board-title"
              value={title}
              maxLength={LIMITS.setTitle}
              onChange={(e) => {
                setTitle(e.target.value);
                touch();
              }}
              placeholder="Untitled board"
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 t-font text-xl font-extrabold text-[#3a3a3a] hover:border-slate-200 focus:border-[#02797F] focus:outline-none"
            />
            {meta.kind === "template" && <span className="rounded-full bg-[#E6F2F2] px-2.5 py-0.5 text-xs font-semibold text-[#01585D]">Template</span>}
          </div>
          <SaveBadge state={save} error={saveError} retry={() => void flush()} />
          <div className="flex flex-wrap items-center gap-2">
            <BuilderButton size="sm" onClick={() => setPanel({ kind: "settings" })} icon={<Settings2 className="h-4 w-4" />}>
              Game settings
            </BuilderButton>
            <SaveAsTemplate meta={meta} flush={flush} title={title} say={(m) => setToast({ message: m })} setMeta={setMeta} />
            <BuilderButton tone="primary" size="sm" onClick={host} disabled={stats.ready === 0} icon={<Play className="h-4 w-4" />}>
              Host this board
            </BuilderButton>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-4 pb-24 pt-5 sm:px-6">
          <Toolbar
            stats={stats}
            content={content}
            competitive={competitive}
            openCell={openCell}
            openFinal={() => setPanel({ kind: "final" })}
            onAddBlank={() => addColumn()}
            onAddBank={() => setPanel({ kind: "bank", replaceColumnId: null })}
            onAddAi={() => setPanel({ kind: "ai-column", columnId: null })}
            onDraftBoard={() => setPanel({ kind: "ai-board" })}
            aiEnabled={aiEnabled}
            canAdd={content.columns.length < MAX_COLUMNS}
          />

          <PointsRow rows={rows} onChange={setRowValue} onAdd={addRow} onRemove={removeRow} />

          <div className="mt-3 overflow-x-auto pb-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${content.columns.length}, minmax(200px, 1fr))`, minWidth: content.columns.length * 212 }}>
              {content.columns.map((col, ci) => (
                <ColumnEditor
                  key={col.id}
                  col={col}
                  index={ci}
                  count={content.columns.length}
                  rows={rows.length}
                  competitive={competitive}
                  aiEnabled={aiEnabled}
                  onTitle={(t) => updateColumn(col.id, (c) => ({ ...c, title: t }))}
                  onOpenCell={openCell}
                  onMove={(d) => moveColumn(col.id, d)}
                  onReplaceFromBank={() => setPanel({ kind: "bank", replaceColumnId: col.id })}
                  onFillAi={() => setPanel({ kind: "ai-column", columnId: col.id })}
                  onClear={() =>
                    withUndo(`Cleared “${col.title || "column"}”.`, (c) => ({
                      ...c,
                      columns: c.columns.map((x) => (x.id === col.id ? { ...x, questions: x.questions.map((q) => ({ id: q.id, value: q.value, question: "", answer: "" })) } : x)),
                    }))
                  }
                  onDelete={() =>
                    content.columns.length > 1 &&
                    withUndo(`Deleted “${col.title || "column"}”. It's still in your column bank if it was saved.`, (c) => ({ ...c, columns: c.columns.filter((x) => x.id !== col.id) }))
                  }
                />
              ))}
            </div>
          </div>

          <FinalCard content={content} onOpen={() => setPanel({ kind: "final" })} onToggle={(enabled) => setContent((c) => ({ ...c, final: { ...c.final, enabled } }))} />

          <div className="mt-6 max-w-2xl">
            <Field label="Description" htmlFor="board-description" hint="Shown in your boards list and, for templates, to other hosts.">
              <textarea
                id="board-description"
                value={description}
                maxLength={LIMITS.description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  touch();
                }}
                rows={2}
                placeholder="e.g. A 30-question board for the leadership offsite."
                className={cn(inputClass, "resize-y")}
              />
            </Field>
          </div>
        </div>
      </main>

      <CellPanel
        panel={panel}
        content={content}
        setPanel={setPanel}
        update={updateQuestion}
        aiEnabled={aiEnabled}
        say={(m) => setToast({ message: m })}
      />
      <FinalPanel open={panel?.kind === "final"} onClose={() => setPanel(null)} content={content} setContent={setContent} aiEnabled={aiEnabled} say={(m) => setToast({ message: m })} />
      <SidePanel open={panel?.kind === "settings"} title="Game settings" onClose={() => setPanel(null)} wide>
        <p className="mb-6 text-sm text-slate-600">These are this board&apos;s defaults. You can change them again on the setup screen each time you host.</p>
        <SettingsForm value={content.settings} onChange={(settings) => setContent((c) => ({ ...c, settings }))} idPrefix="edit" />
        {settingsProblem(content.settings) && <p className="mt-4 text-sm text-rose-700">{settingsProblem(content.settings)}</p>}
      </SidePanel>
      <BankPanel
        panel={panel}
        onClose={() => setPanel(null)}
        rows={rows}
        onPick={(col, replaceId) => {
          const fitted = cloneColumn(col, rows);
          if (replaceId) {
            withUndo(`Replaced with “${col.title}”.`, (c) => ({ ...c, columns: c.columns.map((x) => (x.id === replaceId ? fitted : x)) }));
          } else if (!addColumn(fitted)) {
            return;
          } else {
            setToast({ message: `Added “${col.title}”.` });
          }
          void api(`/api/trivia/bank/${encodeURIComponent(col.id)}`, { body: { used: true } }).catch(() => undefined);
          setPanel(null);
        }}
      />
      <AiColumnPanel
        panel={panel}
        onClose={() => setPanel(null)}
        content={content}
        rows={rows}
        aiEnabled={aiEnabled}
        onResult={(columnId, generated) => {
          if (columnId) {
            withUndo(`Wrote “${generated.title}” with AI.`, (c) => ({
              ...c,
              columns: c.columns.map((x) => (x.id === columnId ? mergeGenerated(x, generated) : x)),
            }));
          } else {
            const col = blankColumn(rows);
            if (addColumn(mergeGenerated(col, generated))) setToast({ message: `Added “${generated.title}”.` });
          }
          setPanel(null);
        }}
      />
      <AiBoardPanel
        open={panel?.kind === "ai-board"}
        onClose={() => setPanel(null)}
        content={content}
        rows={rows}
        aiEnabled={aiEnabled}
        onResult={(draft) => {
          withUndo("Drafted the board with AI.", (c) => ({
            ...c,
            columns: draft.columns.map((g) => mergeGenerated(blankColumn(rows), g)),
            final: { enabled: true, category: draft.final.category, question: draft.final.question, answer: draft.final.answer, notes: draft.final.notes || undefined },
          }));
          if (!title.trim() || title === "Untitled board") {
            setTitle(draft.title);
            touch();
          }
          setPanel(null);
        }}
      />

      {toast && (
        <Toast
          message={toast.message}
          onClose={() => setToast(null)}
          action={
            toast.undo
              ? {
                  label: "Undo",
                  onClick: () => {
                    setContent(toast.undo!);
                    setToast(null);
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface GeneratedQuestion {
  question: string;
  answer: string;
  hint?: string;
  notes?: string;
}
interface GeneratedColumn {
  title: string;
  questions: GeneratedQuestion[];
}

/** Lay AI-written questions onto a column, keeping its cell ids, points and Daily Doubles. */
function mergeGenerated(col: TriviaColumn, g: GeneratedColumn): TriviaColumn {
  return {
    ...col,
    title: g.title.slice(0, LIMITS.columnTitle) || col.title,
    questions: col.questions.map((q, i) => {
      const x = g.questions[i];
      if (!x) return q;
      return {
        ...q,
        question: x.question.slice(0, LIMITS.question),
        answer: x.answer.slice(0, LIMITS.answer),
        hint: x.hint?.trim() ? x.hint.slice(0, LIMITS.hint) : undefined,
        notes: x.notes?.trim() ? x.notes.slice(0, LIMITS.notes) : undefined,
      };
    }),
  };
}

function SaveBadge({ state, error, retry }: { state: SaveState; error: string | null; retry: () => void }) {
  if (state === "error") {
    return (
      <span role="alert" className="inline-flex items-center gap-2 text-sm text-rose-700">
        <AlertTriangle className="h-4 w-4" /> {error ?? "Not saved"}
        <button type="button" onClick={retry} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[5.5rem] items-center gap-1.5 text-sm text-slate-500" aria-live="polite">
      {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "dirty" ? <CircleDashed className="h-4 w-4" /> : <Check className="h-4 w-4 text-[#3D8A70]" />}
      {state === "saving" ? "Saving…" : state === "dirty" ? "Editing" : "Saved"}
    </span>
  );
}

function SaveAsTemplate({
  meta,
  flush,
  title,
  say,
  setMeta,
}: {
  meta: TriviaSetFull;
  flush: () => Promise<boolean>;
  title: string;
  say: (m: string) => void;
  setMeta: React.Dispatch<React.SetStateAction<TriviaSetFull>>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);

  if (meta.kind === "template") {
    const shared = meta.visibility === "shared";
    return (
      <BuilderButton
        size="sm"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await flush();
            const res = await api<{ set: TriviaSetFull }>(`/api/trivia/sets/${meta.id}`, { method: "PUT", body: { visibility: shared ? "private" : "shared" } });
            setMeta((m) => ({ ...m, visibility: res.set.visibility }));
            say(shared ? "Only you can see this template now." : "Shared — every ICAN Trivia host can use it.");
          } catch (err) {
            say(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {shared ? "Shared with hosts ✓" : "Share with hosts"}
      </BuilderButton>
    );
  }

  return (
    <div className="relative">
      <BuilderButton
        size="sm"
        onClick={() => {
          setName(title);
          setOpen(!open);
        }}
        aria-expanded={open}
        icon={<BookmarkPlus className="h-4 w-4" />}
      >
        Save as template
      </BuilderButton>
      {open && (
        <form
          className="absolute right-0 top-12 z-40 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await flush();
              await api("/api/trivia/sets", { body: { kind: "template", fromId: meta.id, title: name.trim() || title, visibility: share ? "shared" : "private" } });
              say("Saved to your templates. Find it under Templates → My templates.");
              setOpen(false);
            } catch (err) {
              say(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Template name" htmlFor="template-name">
            <input id="template-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.setTitle} className={inputClass} data-autofocus />
          </Field>
          <Toggle id="template-share" checked={share} onChange={setShare} label="Share with ICAN hosts" description="Other hosts can use it. They can't change yours." />
          <div className="flex justify-end gap-2">
            <BuilderButton size="sm" tone="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </BuilderButton>
            <BuilderButton size="sm" tone="primary" type="submit" busy={busy}>
              Save template
            </BuilderButton>
          </div>
        </form>
      )}
    </div>
  );
}

function Toolbar({
  stats,
  content,
  competitive,
  openCell,
  openFinal,
  onAddBlank,
  onAddBank,
  onAddAi,
  onDraftBoard,
  aiEnabled,
  canAdd,
}: {
  stats: ReturnType<typeof contentStats>;
  content: TriviaContent;
  competitive: boolean;
  openCell: (id: string) => void;
  openFinal: () => void;
  onAddBlank: () => void;
  onAddBank: () => void;
  onAddAi: () => void;
  onDraftBoard: () => void;
  aiEnabled: boolean | null;
  canAdd: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const issues = useMemo(() => {
    const list: Array<{ label: string; cellId?: string; final?: boolean }> = [];
    content.columns.forEach((col, ci) => {
      if (!col.title.trim()) list.push({ label: `Column ${ci + 1} has no title`, cellId: col.questions[0]?.id });
      col.questions.forEach((q) => {
        const hasQ = q.question.trim().length > 0;
        const hasA = q.answer.trim().length > 0;
        if (hasQ !== hasA) list.push({ label: `${col.title || `Column ${ci + 1}`} ${q.value}: ${hasQ ? "needs an answer" : "needs a question"}`, cellId: q.id });
      });
    });
    if (content.final.enabled && !stats.finalReady) list.push({ label: "Final Trivia isn't finished", final: true });
    return list;
  }, [content, stats.finalReady]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative mr-auto">
        <button type="button" onClick={() => setIssuesOpen(!issuesOpen)} aria-expanded={issuesOpen} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-slate-700">
          <span className="t-font text-base font-extrabold text-slate-900">
            {stats.ready} of {stats.questions}
          </span>{" "}
          questions ready
          {!competitive && stats.dailyDoubles > 0 && <span className="text-slate-500">· {stats.dailyDoubles} Daily Double{stats.dailyDoubles === 1 ? "" : "s"}</span>}
          <span className="text-slate-500">· {content.settings.mode === "competitive" ? "Competitive" : "Traditional"}, {content.settings.teams.length} teams</span>
          {issues.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" /> {issues.length} to fix
            </span>
          )}
        </button>
        {issuesOpen && issues.length > 0 && (
          <ul className="absolute left-0 top-11 z-30 max-h-80 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {issues.map((iss, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setIssuesOpen(false);
                    if (iss.final) openFinal();
                    else if (iss.cellId) openCell(iss.cellId);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {iss.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative">
        <BuilderButton size="sm" onClick={() => setAddOpen(!addOpen)} disabled={!canAdd} aria-expanded={addOpen} icon={<Plus className="h-4 w-4" />}>
          Add column
        </BuilderButton>
        {addOpen && (
          <div role="menu" className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {[
              { label: "Blank column", icon: <Plus className="h-4 w-4" />, onClick: onAddBlank },
              { label: "From the column bank", icon: <Library className="h-4 w-4" />, onClick: onAddBank },
              { label: "Write one with AI", icon: <Sparkles className="h-4 w-4" />, onClick: onAddAi, disabled: aiEnabled === false },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.disabled ? "AI assist isn't switched on for this site yet" : undefined}
                onClick={() => {
                  setAddOpen(false);
                  item.onClick();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <BuilderButton size="sm" onClick={onAddBank} icon={<Library className="h-4 w-4" />}>
        Column bank
      </BuilderButton>
      <BuilderButton size="sm" onClick={onDraftBoard} disabled={aiEnabled === false} title={aiEnabled === false ? "AI assist isn't switched on for this site yet" : undefined} icon={<Sparkles className="h-4 w-4" />}>
        Draft board with AI
      </BuilderButton>
    </div>
  );
}

function PointsRow({ rows, onChange, onAdd, onRemove }: { rows: number[]; onChange: (i: number, v: number) => void; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Points per row</span>
      {rows.map((v, i) => (
        <label key={i} className="inline-flex items-center">
          <span className="sr-only">Row {i + 1} points</span>
          <input
            inputMode="numeric"
            value={v}
            onChange={(e) => onChange(i, Math.min(MAX_VALUE, Number(e.target.value.replace(/\D/g, "") || 0)))}
            className="h-9 w-[4.75rem] rounded-lg border border-slate-300 bg-[#02797F] text-center t-font font-extrabold text-white focus:border-[#02797F] focus:outline-none focus:ring-2 focus:ring-[#02797F]/20"
          />
        </label>
      ))}
      <span className="ml-1 inline-flex gap-1">
        <button type="button" onClick={onRemove} disabled={rows.length <= 1} aria-label="Remove the bottom row" title="Remove the bottom row" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={onAdd} disabled={rows.length >= MAX_ROWS} aria-label="Add a row" title="Add a row" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30">
          <Plus className="h-4 w-4" />
        </button>
      </span>
      <span className="text-xs text-slate-500">Changing a row updates every column.</span>
    </div>
  );
}

function ColumnEditor({
  col,
  index,
  count,
  rows,
  competitive,
  aiEnabled,
  onTitle,
  onOpenCell,
  onMove,
  onReplaceFromBank,
  onFillAi,
  onClear,
  onDelete,
}: {
  col: TriviaColumn;
  index: number;
  count: number;
  rows: number;
  competitive: boolean;
  aiEnabled: boolean | null;
  onTitle: (t: string) => void;
  onOpenCell: (id: string) => void;
  onMove: (dir: -1 | 1) => void;
  onReplaceFromBank: () => void;
  onFillAi: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white" aria-label={col.title || `Column ${index + 1}`}>
      <div className="flex items-start gap-1 rounded-t-2xl bg-[#02797F] p-2">
        <label htmlFor={`col-${col.id}`} className="sr-only">
          Column {index + 1} category
        </label>
        <textarea
          id={`col-${col.id}`}
          value={col.title}
          maxLength={LIMITS.columnTitle}
          onChange={(e) => onTitle(e.target.value.replace(/\n/g, " "))}
          rows={2}
          placeholder="Category"
          className="min-h-[3.25rem] min-w-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-center t-font text-sm font-extrabold uppercase leading-tight tracking-wide text-white placeholder:text-white/40 hover:border-white/20 focus:border-white focus:outline-none"
        />
        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu" aria-label={`Options for ${col.title || `column ${index + 1}`}`} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <ColMenuItem
                icon={<Sparkles className="h-4 w-4" />}
                disabled={aiEnabled === false}
                title={aiEnabled === false ? "AI assist isn't switched on for this site yet" : undefined}
                onClick={() => {
                  setMenu(false);
                  onFillAi();
                }}
              >
                Write with AI
              </ColMenuItem>
              <ColMenuItem
                icon={<Library className="h-4 w-4" />}
                onClick={() => {
                  setMenu(false);
                  onReplaceFromBank();
                }}
              >
                Replace from bank
              </ColMenuItem>
              <ColMenuItem icon={<ChevronLeft className="h-4 w-4" />} disabled={index === 0} onClick={() => onMove(-1)}>
                Move left
              </ColMenuItem>
              <ColMenuItem icon={<ChevronRight className="h-4 w-4" />} disabled={index === count - 1} onClick={() => onMove(1)}>
                Move right
              </ColMenuItem>
              <ColMenuItem
                icon={<CircleDashed className="h-4 w-4" />}
                onClick={() => {
                  setMenu(false);
                  onClear();
                }}
              >
                Clear questions
              </ColMenuItem>
              <ColMenuItem
                icon={<Trash2 className="h-4 w-4" />}
                danger
                disabled={count <= 1}
                onClick={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                Delete column
              </ColMenuItem>
            </div>
          )}
        </div>
      </div>
      <ol className="flex flex-col gap-1.5 p-2">
        {Array.from({ length: rows }, (_, ri) => {
          const q = col.questions[ri];
          if (!q) return <li key={`gap-${ri}`} className="h-[84px] rounded-xl bg-slate-50" aria-hidden />;
          const hasQ = q.question.trim().length > 0;
          const hasA = q.answer.trim().length > 0;
          const status = hasQ && hasA ? "ready" : hasQ || hasA ? "half" : "empty";
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onOpenCell(q.id)}
                className={cn(
                  "group flex h-[84px] w-full flex-col rounded-xl border px-2.5 py-2 text-left transition-colors",
                  status === "empty" ? "border-dashed border-slate-300 bg-white hover:border-[#02797F] hover:bg-[#02797F]/[0.03]" : "border-slate-200 bg-white hover:border-[#02797F]",
                )}
                aria-label={`${col.title || `Column ${index + 1}`} ${q.value}: ${hasQ ? q.question : "empty"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="rounded-md bg-[#02797F] px-1.5 py-0.5 t-font text-xs font-extrabold text-white">{q.value.toLocaleString("en-US")}</span>
                  {q.dailyDouble && !competitive && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Daily Double</span>}
                  {q.hint && <span className="text-[10px] font-semibold uppercase text-slate-400">hint</span>}
                  <span className="ml-auto" aria-hidden>
                    {status === "ready" ? <Check className="h-4 w-4 text-[#3D8A70]" /> : status === "half" ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Plus className="h-4 w-4 text-slate-300 group-hover:text-[#02797F]" />}
                  </span>
                </span>
                <span className={cn("mt-1 line-clamp-2 text-[13px] leading-snug", hasQ ? "text-slate-800" : "text-slate-400")}>{hasQ ? q.question : "Add a question"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ColMenuItem({ children, icon, onClick, disabled, danger, title }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-35", danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50")}
    >
      {icon}
      {children}
    </button>
  );
}

function FinalCard({ content, onOpen, onToggle }: { content: TriviaContent; onOpen: () => void; onToggle: (v: boolean) => void }) {
  const f = content.final;
  const ready = f.question.trim() && f.answer.trim();
  return (
    <section className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Final Trivia">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Final Trivia</p>
        {f.enabled ? (
          <p className="mt-1 truncate text-slate-800">
            {f.category ? <span className="t-font font-extrabold uppercase">{f.category}</span> : <span className="text-slate-400">No category yet</span>}
            {f.question && <span className="text-slate-600"> — {f.question}</span>}
          </p>
        ) : (
          <p className="mt-1 text-slate-500">Off — the game ends after the board.</p>
        )}
      </div>
      {f.enabled && (ready ? <span className="inline-flex items-center gap-1 text-sm text-[#3D8A70]"><Check className="h-4 w-4" /> Ready</span> : <span className="inline-flex items-center gap-1 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" /> Not finished</span>)}
      <div className="w-40">
        <Toggle id="final-enabled" checked={f.enabled} onChange={onToggle} label="Play it" />
      </div>
      {f.enabled && (
        <BuilderButton size="sm" onClick={onOpen} icon={<ArrowRight className="h-4 w-4" />}>
          Edit
        </BuilderButton>
      )}
    </section>
  );
}

// ─── Panels ─────────────────────────────────────────────────

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return ref;
}

function CellPanel({
  panel,
  content,
  setPanel,
  update,
  aiEnabled,
  say,
}: {
  panel: Panel;
  content: TriviaContent;
  setPanel: (p: Panel) => void;
  update: (cellId: string, patch: Partial<TriviaQuestion>) => void;
  aiEnabled: boolean | null;
  say: (m: string) => void;
}) {
  const cellId = panel?.kind === "cell" ? panel.cellId : null;
  const found = cellId ? findCell(content, cellId) : null;
  const order = useMemo(() => content.columns.flatMap((c) => c.questions.map((q) => q.id)), [content.columns]);
  const [aiBusy, setAiBusy] = useState<"answer" | "question" | null>(null);
  const questionRef = useAutoResize(found?.question.question ?? "");
  const competitive = content.settings.mode === "competitive";

  if (!found || !cellId) return <SidePanel open={false} title="" onClose={() => setPanel(null)}>{null}</SidePanel>;
  const { question: q, column } = found;
  const idx = order.indexOf(cellId);
  const go = (d: number) => {
    const next = order[idx + d];
    if (next) setPanel({ kind: "cell", cellId: next });
  };
  const avoid = content.columns.flatMap((c) => c.questions.map((x) => x.question)).filter((x) => x.trim() && x !== q.question);

  async function suggestAnswer() {
    setAiBusy("answer");
    try {
      const res = await api<{ data: { answer: string; hint: string; notes: string } }>("/api/trivia/ai", {
        body: { mode: "answer", category: column.title, question: q.question, value: q.value },
      });
      update(q.id, {
        answer: res.data.answer.slice(0, LIMITS.answer),
        hint: q.hint?.trim() ? q.hint : res.data.hint.slice(0, LIMITS.hint) || undefined,
        notes: q.notes?.trim() ? q.notes : res.data.notes.slice(0, LIMITS.notes) || undefined,
      });
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }

  async function writeQuestion() {
    setAiBusy("question");
    try {
      const res = await api<{ data: { question: string; answer: string; hint: string; notes: string } }>("/api/trivia/ai", {
        body: { mode: "question", category: column.title, value: q.value, avoid, audience: "" },
      });
      update(q.id, {
        question: res.data.question.slice(0, LIMITS.question),
        answer: res.data.answer.slice(0, LIMITS.answer),
        hint: res.data.hint.slice(0, LIMITS.hint) || undefined,
        notes: res.data.notes.slice(0, LIMITS.notes) || undefined,
      });
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }

  const aiOff = aiEnabled === false;
  return (
    <SidePanel
      open
      title={`${column.title || "Untitled column"} · ${q.value.toLocaleString("en-US")}`}
      onClose={() => setPanel(null)}
      footer={
        <div className="flex items-center gap-2">
          <BuilderButton size="sm" tone="ghost" onClick={() => go(-1)} disabled={idx <= 0} icon={<ChevronLeft className="h-4 w-4" />}>
            Previous
          </BuilderButton>
          <BuilderButton size="sm" tone="ghost" onClick={() => go(1)} disabled={idx >= order.length - 1}>
            Next <ChevronRight className="h-4 w-4" />
          </BuilderButton>
          <BuilderButton size="sm" tone="primary" className="ml-auto" onClick={() => setPanel(null)}>
            Done
          </BuilderButton>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Question" htmlFor="cell-question" hint="What the host reads out and the big screen shows.">
          <textarea
            id="cell-question"
            ref={questionRef}
            data-autofocus
            value={q.question}
            maxLength={LIMITS.question}
            onChange={(e) => update(q.id, { question: e.target.value })}
            rows={3}
            placeholder="e.g. This framework names eight steps for leading change."
            className={cn(inputClass, "resize-none text-base leading-relaxed")}
          />
        </Field>
        {!q.question.trim() && (
          <BuilderButton size="sm" onClick={writeQuestion} busy={aiBusy === "question"} disabled={aiOff || !column.title.trim()} title={aiOff ? "AI assist isn't switched on for this site yet" : !column.title.trim() ? "Give the column a category first" : undefined} icon={<Sparkles className="h-4 w-4" />}>
            Write this question with AI
          </BuilderButton>
        )}
        <Field label="Answer" htmlFor="cell-answer" hint="Only the host sees it until it's revealed.">
          <div className="flex gap-2">
            <input id="cell-answer" value={q.answer} maxLength={LIMITS.answer} onChange={(e) => update(q.id, { answer: e.target.value })} placeholder="e.g. Kotter's 8-Step Model" className={cn(inputClass, "font-semibold")} />
            <BuilderButton
              size="md"
              onClick={suggestAnswer}
              busy={aiBusy === "answer"}
              disabled={aiOff || !q.question.trim()}
              title={aiOff ? "AI assist isn't switched on for this site yet" : !q.question.trim() ? "Write the question first" : "Suggest an answer with AI"}
              icon={<Sparkles className="h-4 w-4" />}
            >
              Suggest
            </BuilderButton>
          </div>
        </Field>
        <Field label="Hint" htmlFor="cell-hint" hint={competitive ? "Unlocked by a team's Hint tool. Leave blank and teams get the answer's first letter and length." : "Used in Competitive mode. Leave blank to use the answer's first letter and length."}>
          <input id="cell-hint" value={q.hint ?? ""} maxLength={LIMITS.hint} onChange={(e) => update(q.id, { hint: e.target.value || undefined })} placeholder="e.g. Think of a Harvard professor's eight steps" className={inputClass} />
        </Field>
        <Field label="Notes for the host" htmlFor="cell-notes" hint="Other answers you'll accept, or a fun fact to share.">
          <input id="cell-notes" value={q.notes ?? ""} maxLength={LIMITS.notes} onChange={(e) => update(q.id, { notes: e.target.value || undefined })} placeholder="Also accept: Kotter" className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Points" htmlFor="cell-points" hint="Use “Points per row” to change a whole row.">
            <input id="cell-points" inputMode="numeric" value={q.value} onChange={(e) => update(q.id, { value: Math.min(MAX_VALUE, Number(e.target.value.replace(/\D/g, "") || 0)) })} className={cn(inputClass, "t-font font-extrabold")} />
          </Field>
          <Field label="Picture (optional)" htmlFor="cell-image" hint="An https link to an image.">
            <input id="cell-image" type="url" value={q.imageUrl ?? ""} onChange={(e) => update(q.id, { imageUrl: e.target.value || undefined })} placeholder="https://…" className={inputClass} />
          </Field>
        </div>
        <div className="rounded-xl border border-slate-200 px-4">
          <Toggle
            id="cell-dd"
            checked={Boolean(q.dailyDouble)}
            onChange={(v) => update(q.id, { dailyDouble: v || undefined })}
            label="Daily Double"
            description={competitive ? "Only plays in Traditional mode — Competitive uses Double Down instead." : "Only the team in control answers, for a wager."}
          />
        </div>
        {q.question.trim() && !q.answer.trim() && (
          <p className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Questions without an answer stay off the board.
          </p>
        )}
      </div>
    </SidePanel>
  );
}

function FinalPanel({
  open,
  onClose,
  content,
  setContent,
  aiEnabled,
  say,
}: {
  open: boolean;
  onClose: () => void;
  content: TriviaContent;
  setContent: (fn: (c: TriviaContent) => TriviaContent) => void;
  aiEnabled: boolean | null;
  say: (m: string) => void;
}) {
  const f = content.final;
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TriviaContent["final"]>) => setContent((c) => ({ ...c, final: { ...c.final, ...patch } }));
  return (
    <SidePanel open={open} title="Final Trivia" onClose={onClose} footer={<BuilderButton tone="primary" onClick={onClose}>Done</BuilderButton>}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600">After the board, every team wagers some of its points, writes an answer against the clock, and the host judges each one.</p>
        <Field label="Category" htmlFor="final-category" hint="Shown before teams wager — the question stays hidden until wagers are in.">
          <input id="final-category" data-autofocus value={f.category} maxLength={LIMITS.columnTitle} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Management Classics" className={inputClass} />
        </Field>
        <Field label="Question" htmlFor="final-question">
          <textarea id="final-question" value={f.question} maxLength={LIMITS.question} onChange={(e) => set({ question: e.target.value })} rows={3} className={cn(inputClass, "resize-y")} />
        </Field>
        <Field label="Answer" htmlFor="final-answer">
          <div className="flex gap-2">
            <input id="final-answer" value={f.answer} maxLength={LIMITS.answer} onChange={(e) => set({ answer: e.target.value })} className={cn(inputClass, "font-semibold")} />
            <BuilderButton
              busy={busy}
              disabled={aiEnabled === false || !f.question.trim()}
              title={aiEnabled === false ? "AI assist isn't switched on for this site yet" : undefined}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await api<{ data: { answer: string; notes: string } }>("/api/trivia/ai", { body: { mode: "answer", category: f.category, question: f.question, value: 0 } });
                  set({ answer: res.data.answer.slice(0, LIMITS.answer), notes: f.notes?.trim() ? f.notes : res.data.notes.slice(0, LIMITS.notes) || undefined });
                } catch (err) {
                  say(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Suggest
            </BuilderButton>
          </div>
        </Field>
        <Field label="Notes for the host" htmlFor="final-notes">
          <input id="final-notes" value={f.notes ?? ""} maxLength={LIMITS.notes} onChange={(e) => set({ notes: e.target.value || undefined })} className={inputClass} />
        </Field>
      </div>
    </SidePanel>
  );
}

function BankPanel({ panel, onClose, rows, onPick }: { panel: Panel; onClose: () => void; rows: number[]; onPick: (col: BankColumn, replaceId: string | null) => void }) {
  const open = panel?.kind === "bank";
  const replaceId = panel?.kind === "bank" ? panel.replaceColumnId : null;
  const [bank, setBank] = useState<{ mine: BankColumn[]; shared: BankColumn[]; library: BankColumn[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "shared" | "library">("mine");
  const [query, setQuery] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<{ mine: BankColumn[]; shared: BankColumn[]; library: BankColumn[] }>("/api/trivia/bank")
      .then((b) => {
        if (cancelled) return;
        setBank(b);
        if (b.mine.length === 0) setScope("library");
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const list = filterBank(bank?.[scope] ?? [], query, starredOnly);
  return (
    <SidePanel open={open} title={replaceId ? "Replace with a column from the bank" : "Add a column from the bank"} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-600">Columns take this board&apos;s points ({rows.join(" · ")}). Daily Doubles don&apos;t carry over.</p>
      {error && <p className="text-rose-700">{error}</p>}
      {!bank && !error ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-label="Loading the bank" />
      ) : bank ? (
        <>
          <BankFilters scope={scope} setScope={setScope} counts={{ mine: bank.mine.length, shared: bank.shared.length, library: bank.library.length }} query={query} setQuery={setQuery} starredOnly={starredOnly} setStarredOnly={setStarredOnly} />
          {list.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-600">
              {query ? `No columns match “${query}”.` : scope === "mine" ? "Your bank fills up as you save boards. Try the ICAN library meanwhile." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {list.map((col) => (
                <BankRow
                  key={col.id}
                  col={col}
                  actions={
                    <BuilderButton size="sm" tone="primary" onClick={() => onPick(col, replaceId)} icon={<Plus className="h-4 w-4" />}>
                      {replaceId ? "Use here" : "Add to board"}
                    </BuilderButton>
                  }
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </SidePanel>
  );
}

function AiColumnPanel({
  panel,
  onClose,
  content,
  rows,
  aiEnabled,
  onResult,
}: {
  panel: Panel;
  onClose: () => void;
  content: TriviaContent;
  rows: number[];
  aiEnabled: boolean | null;
  onResult: (columnId: string | null, generated: GeneratedColumn) => void;
}) {
  const open = panel?.kind === "ai-column";
  const columnId = panel?.kind === "ai-column" ? panel.columnId : null;
  const existing = columnId ? content.columns.find((c) => c.id === columnId) : null;
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(existing?.title ?? "");
      setError(null);
    }
  }, [open, existing?.title]);

  const values = existing ? existing.questions.map((q) => q.value) : rows;
  const hasContent = existing?.questions.some((q) => q.question.trim() || q.answer.trim());

  return (
    <SidePanel open={open} title={existing ? "Write this column with AI" : "Write a new column with AI"} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!category.trim()) return setError("Give the column a category.");
          setBusy(true);
          setError(null);
          try {
            const avoid = content.columns.filter((c) => c.id !== columnId).flatMap((c) => c.questions.map((q) => q.question)).filter((q) => q.trim());
            const res = await api<{ data: GeneratedColumn }>("/api/trivia/ai", { body: { mode: "column", category, values, avoid, audience } });
            onResult(columnId, res.data);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {aiEnabled === false && <AiOffNote />}
        <Field label="Category" htmlFor="ai-col-category" hint={`${values.length} questions, worth ${values.join(", ")} — easy to hard.`}>
          <input id="ai-col-category" data-autofocus value={category} maxLength={LIMITS.columnTitle} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Change Management" className={inputClass} />
        </Field>
        <Field label="Who's playing? (optional)" htmlFor="ai-col-audience" hint="Helps pitch the difficulty.">
          <input id="ai-col-audience" value={audience} maxLength={120} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. HR business partners in Dubai" className={inputClass} />
        </Field>
        {hasContent && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This replaces the questions already in the column. You can undo it.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <BuilderButton tone="primary" type="submit" busy={busy} disabled={aiEnabled === false} icon={<Sparkles className="h-4 w-4" />}>
          {busy ? "Writing…" : "Write the column"}
        </BuilderButton>
        <p className="text-xs text-slate-500">AI can get facts wrong — check each answer before you play.</p>
      </form>
    </SidePanel>
  );
}

function AiBoardPanel({
  open,
  onClose,
  content,
  rows,
  aiEnabled,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  content: TriviaContent;
  rows: number[];
  aiEnabled: boolean | null;
  onResult: (draft: { title: string; columns: GeneratedColumn[]; final: { category: string; question: string; answer: string; notes: string } }) => void;
}) {
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [columns, setColumns] = useState(content.columns.length || 6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasContent = contentStats(content).ready > 0;
  return (
    <SidePanel open={open} title="Draft the board with AI" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!theme.trim()) return setError("Describe a theme for the board.");
          setBusy(true);
          setError(null);
          try {
            const res = await api<{ data: { title: string; columns: GeneratedColumn[]; final: { category: string; question: string; answer: string; notes: string } } }>("/api/trivia/ai", {
              body: { mode: "board", theme, columns, values: rows, audience },
            });
            onResult(res.data);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {aiEnabled === false && <AiOffNote />}
        <Field label="Theme" htmlFor="ai-board-theme" hint="What the game is about. Be as specific as you like.">
          <textarea id="ai-board-theme" data-autofocus value={theme} maxLength={120} onChange={(e) => setTheme(e.target.value)} rows={2} placeholder="e.g. Customer service excellence for a hotel group's front-office team" className={cn(inputClass, "resize-none")} />
        </Field>
        <Field label="Who's playing? (optional)" htmlFor="ai-board-audience">
          <input id="ai-board-audience" value={audience} maxLength={120} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. New graduate hires" className={inputClass} />
        </Field>
        <Field label="Categories" htmlFor="ai-board-cols" hint={`Each with ${rows.length} questions worth ${rows.join(", ")}, plus a Final Trivia question.`}>
          <input id="ai-board-cols" type="number" min={1} max={MAX_COLUMNS} value={columns} onChange={(e) => setColumns(Math.min(MAX_COLUMNS, Math.max(1, Number(e.target.value) || 1)))} className={cn(inputClass, "w-28")} />
        </Field>
        {hasContent && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This replaces every column and the Final Trivia question. Your game settings stay. You can undo it.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <BuilderButton tone="primary" type="submit" busy={busy} disabled={aiEnabled === false} icon={<Sparkles className="h-4 w-4" />}>
          {busy ? "Drafting — this takes a moment…" : "Draft the board"}
        </BuilderButton>
        <p className="text-xs text-slate-500">AI can get facts wrong — check each answer before you play.</p>
      </form>
    </SidePanel>
  );
}

function AiOffNote() {
  return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">AI assist isn&apos;t switched on for this site yet. Everything else works — write questions yourself or pull columns from the bank.</p>;
}
