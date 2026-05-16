"use client";

/**
 * /login — sign-in surface.
 *
 * Three paths in one card: Google, Microsoft, email + password.
 * Anonymous play still works (skip → /lobby), but signing in saves
 * games and history across sessions/devices.
 *
 * Style mirrors ican-crm's LoginPage — same brand teal CTA, same
 * provider-tile layout, same "skip for now" affordance.
 */

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowRight, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

function LoginInner() {
  const {
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithPassword,
    signInAsGuest,
    user,
    loading: authLoading,
    authConfigured,
    guestPending,
  } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "microsoft" | "email" | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Where to send the user after a successful sign-in.
  // Default to home page so the active-membership check there can
  // redirect returning players straight back into their active game.
  const nextPath = search.get("next") || "/";

  // Surface auth errors from /auth/callback redirects.
  useEffect(() => {
    const authError = search.get("error");
    if (authError) {
      const msgs: Record<string, string> = {
        missing_code: "Sign-in was interrupted. Please try again.",
        auth_not_configured: "Sign-in isn't configured yet. You can still play anonymously.",
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(msgs[authError] ?? authError);
    }
  }, [search]);

  // If already signed in, bounce to next destination
  useEffect(() => {
    if (!authLoading && user) router.replace(nextPath);
  }, [authLoading, user, router, nextPath]);

  async function go(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, label: typeof loading) {
    setError(null);
    setLoading(label);
    const r = await fn();
    if (!r.ok) {
      setError(r.error);
      setLoading(null);
    }
    // OAuth redirects away; password sign-in flips user via onAuthStateChange → effect above handles redirect.
  }

  async function playAsGuest() {
    setError(null);
    const r = await signInAsGuest();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.replace(nextPath);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (email.length === 0 || password.length === 0) {
      setError("Email and password required");
      return;
    }
    await go(() => signInWithPassword(email, password), "email");
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      <MarketingHeader />
      <main className="max-w-md mx-auto px-6 py-16 lg:py-20">
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight mb-2">
          Welcome back.
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          Signing in saves your games and history across devices.
        </p>

        {!authConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
            <p className="text-sm text-amber-900 font-semibold mb-1">
              Sign-in not configured
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Supabase isn&rsquo;t wired up yet. You can{" "}
              <Link href="/lobby" className="underline font-medium">
                play anonymously
              </Link>{" "}
              — your run will save to this browser.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 mb-5 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* OAuth buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => go(() => signInWithGoogle(nextPath), "google")}
            disabled={!authConfigured || loading !== null}
            className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon className="w-4 h-4" />}
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => go(() => signInWithMicrosoft(nextPath), "microsoft")}
            disabled={!authConfigured || loading !== null}
            className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading === "microsoft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicrosoftIcon className="w-4 h-4" />}
            Continue with Microsoft
          </button>
          {!showEmail ? (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              disabled={!authConfigured}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Continue with email
            </button>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@work.com"
                autoComplete="email"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {loading === "email" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Sign in <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Skip / signup links */}
        <div className="mt-8 text-center text-sm text-slate-500 space-y-2">
          <div>
            New to ICAN Simulations?{" "}
            <Link href="/signup" className="text-cyan-700 hover:text-cyan-800 font-medium underline underline-offset-2">
              Create an account
            </Link>
          </div>
          <p className="text-xs">
            Or{" "}
            <button
              type="button"
              onClick={() => void playAsGuest()}
              disabled={!authConfigured || guestPending}
              className="text-slate-600 hover:text-slate-900 underline underline-offset-2 disabled:opacity-50"
            >
              {guestPending ? "Starting guest session…" : "continue as guest"}
            </button>
            {" "}— no account needed for solo and lobby play.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-slate-50" aria-hidden />}>
      <LoginInner />
    </Suspense>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
