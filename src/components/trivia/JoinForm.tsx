"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { LIMITS } from "@/lib/trivia/content";
import { api, errorMessage } from "@/lib/trivia/client/api";
import { lastName, playerStore, rememberName } from "@/lib/trivia/client/storage";
import type { TriviaView } from "@/lib/trivia/views";

/**
 * Jackbox-style join: four letters and a name. No account — the
 * server hands back a player token this phone keeps for rejoining.
 */
export function JoinForm({
  initialCode = "",
  lockCode = false,
  roomTitle,
  onJoined,
}: {
  initialCode?: string;
  lockCode?: boolean;
  roomTitle?: string | null;
  onJoined: (args: { code: string; token: string; view: TriviaView }) => void;
}) {
  const [code, setCode] = useState(normalizeRoomCode(initialCode));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(lastName());
    if (lockCode || isRoomCode(normalizeRoomCode(initialCode))) nameRef.current?.focus();
    else codeRef.current?.focus();
  }, [initialCode, lockCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = normalizeRoomCode(code);
    if (!isRoomCode(c)) {
      setError("Room codes are four letters, like BKRT. Check the big screen.");
      codeRef.current?.focus();
      return;
    }
    const n = name.trim();
    if (!n) {
      setError("Enter your name or your team's name.");
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ playerId: string; token: string; view: TriviaView }>(`/api/trivia/rooms/${c}/join`, {
        body: { name: n },
      });
      rememberName(n);
      playerStore.set(c, { roomId: res.view.room.id, token: res.token, name: n });
      onJoined({ code: c, token: res.token, view: res.view });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
      {roomTitle && (
        <p className="text-center text-sm text-[var(--t-muted)]">
          Joining <span className="font-semibold text-[var(--t-ink)]">{roomTitle}</span>
        </p>
      )}
      <div>
        <label htmlFor="room-code" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Room code
        </label>
        <input
          ref={codeRef}
          id="room-code"
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          readOnly={lockCode}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          placeholder="ABCD"
          aria-describedby="room-code-help"
          className={cn(
            "h-20 w-full rounded-2xl border-2 bg-[var(--t-panel)] text-center t-font text-5xl font-extrabold uppercase tracking-[0.35em] pl-[0.35em] text-[var(--t-teal-deep)] placeholder:text-slate-300",
            "border-[var(--t-line-strong)] focus:border-[var(--t-teal-deep)] focus:outline-none",
            lockCode && "opacity-90",
          )}
        />
        <p id="room-code-help" className="mt-2 text-xs text-[var(--t-faint)]">
          The four letters on the big screen.
        </p>
      </div>
      <div>
        <label htmlFor="player-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Your name or team
        </label>
        <input
          ref={nameRef}
          id="player-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, LIMITS.playerName))}
          maxLength={LIMITS.playerName}
          autoComplete="nickname"
          enterKeyHint="go"
          placeholder="e.g. Sara or Team Falcon"
          className="h-14 w-full rounded-2xl border-2 border-[var(--t-line-strong)] bg-[var(--t-panel)] px-4 text-lg font-semibold text-[var(--t-text)] placeholder:text-slate-400 focus:border-[var(--t-teal-deep)] focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="relative h-16 w-full rounded-2xl bg-[var(--t-teal)] t-font text-xl font-extrabold text-white transition-[background-color,transform] hover:bg-[var(--t-teal-strong)] active:scale-[0.98] disabled:opacity-70"
      >
        <span className={busy ? "invisible" : undefined}>Join game</span>
        {busy && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin" aria-label="Joining" />}
      </button>
      <p className="text-center text-xs text-[var(--t-faint)]">No account needed. Your name is only shown in this game.</p>
    </form>
  );
}
