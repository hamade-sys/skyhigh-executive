"use client";

/**
 * /trivia/setup/[id] — set up one game before the room opens: mode,
 * teams (names and colours), tools and clocks. Starts from the board's
 * saved settings; "Remember for this board" saves them back.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { contentStats } from "@/lib/trivia/content";
import { api, errorMessage } from "@/lib/trivia/client/api";
import { hostStore } from "@/lib/trivia/client/storage";
import type { TriviaSetFull, TriviaSettings } from "@/lib/trivia/types";
import { HostGate } from "@/components/trivia/builder/HostGate";
import { SettingsForm, settingsProblem } from "@/components/trivia/builder/SettingsForm";
import { BuilderButton, Toggle } from "@/components/trivia/builder/ui";
import { Wordmark } from "@/components/trivia/Wordmark";

export default function SetupPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");
  return (
    <HostGate next={`/trivia/setup/${encodeURIComponent(id)}`}>
      <Setup id={id} />
    </HostGate>
  );
}

function Setup({ id }: { id: string }) {
  const router = useRouter();
  const [set, setSet] = useState<TriviaSetFull | null>(null);
  const [settings, setSettings] = useState<TriviaSettings | null>(null);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ set: TriviaSetFull }>(`/api/trivia/sets/${encodeURIComponent(id)}`)
      .then((res) => {
        if (cancelled) return;
        setSet(res.set);
        setSettings(res.set.content.settings);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!set || !settings) {
    return (
      <div className="grid flex-1 place-items-center bg-[#F9FAFB] p-6 text-center">
        {error ? (
          <div className="space-y-4">
            <p className="text-slate-700">{error}</p>
            <Link href="/trivia" className="font-semibold text-[#02797F] underline-offset-4 hover:underline">
              Back to ICAN Trivia
            </Link>
          </div>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="Loading" />
        )}
      </div>
    );
  }

  const stats = contentStats(set.content);
  const problem = settingsProblem(settings);

  async function open() {
    if (!set || !settings) return;
    setBusy(true);
    setError(null);
    try {
      const clean = { ...settings, teams: settings.teams.map((t) => ({ ...t, name: t.name.trim() })) };
      if (remember && set.mine) {
        await api(`/api/trivia/sets/${set.id}`, { method: "PUT", body: { content: { ...set.content, settings: clean } } });
      }
      const res = await api<{ code: string; roomId: string; hostToken: string }>("/api/trivia/rooms", { body: { setId: set.id, settings: clean } });
      hostStore.set(res.code, { roomId: res.roomId, token: res.hostToken });
      router.push(`/trivia/host/${res.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F9FAFB]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href={set.mine ? `/trivia/boards/${set.id}` : "/trivia"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <span className="ml-auto">
            <Wordmark size="sm" />
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Set up your game</p>
        <h1 className="mt-1 t-font text-3xl font-extrabold text-[#3a3a3a]">{set.title}</h1>
        <p className="mt-2 text-slate-600">
          {stats.columns} categories · {stats.ready} questions ready{stats.finalReady ? " · Final Trivia" : ""}
          {stats.ready < stats.questions && <span className="text-amber-700"> · {stats.questions - stats.ready} blank cells will stay dark</span>}
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <SettingsForm value={settings} onChange={setSettings} idPrefix="setup" />
        </div>
        {set.mine && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5">
            <Toggle id="remember" checked={remember} onChange={setRemember} label="Remember these settings for this board" description="Next time you host it, it starts with these teams and rules." />
          </div>
        )}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="mr-auto text-sm text-slate-600" role={problem || error ? "alert" : undefined}>
            {error ? <span className="text-rose-700">{error}</span> : problem ? <span className="text-rose-700">{problem}</span> : `${settings.mode === "competitive" ? "Competitive" : "Traditional"} · ${settings.teams.length} ${settings.teams.length === 1 ? "team" : "teams"}`}
          </p>
          <BuilderButton tone="primary" size="lg" onClick={open} busy={busy} disabled={Boolean(problem) || stats.ready === 0} icon={<Play className="h-4 w-4" />}>
            Open the room
          </BuilderButton>
        </div>
      </div>
    </div>
  );
}
