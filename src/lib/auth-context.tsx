"use client";

/**
 * Lightweight Supabase Auth context for SkyForce.
 *
 * Optional auth — anonymous play still works without signing in. When
 * a user IS signed in we use their auth user.id as the durable
 * session id (replacing the old per-browser UUID path), so
 * their saved games + history follow them across devices.
 *
 * Three sign-in surfaces: Google OAuth, Microsoft OAuth (cohort
 * partners often run Microsoft 365), and email + password. All
 * three call into the same `signIn*` methods exposed on the
 * context so the LoginPage doesn't need to know which provider it's
 * driving.
 *
 * Auth-backed identity is now the primary path for active gameplay and
 * persistence. Unsigned-in surfaces fall back to non-durable in-memory
 * behavior rather than browser storage.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True when Supabase env vars are populated. Marketing header etc.
   *  hide the sign-in chip when false to avoid a 500 on click. */
  authConfigured: boolean;
  /** Optional `next` path (e.g. "/games/new") is appended to the
   *  OAuth callback URL so the user lands back where they started. */
  signInWithGoogle: (next?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInWithMicrosoft: (next?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supa = getBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Loading is only meaningful when Supabase is configured. When it's
  // not, there's nothing to wait for — the AuthState lands in its
  // permanent "not signed in, not loading" state on the first render.
  // Deriving the initial loading flag from `supa` (instead of using
  // an effect to flip it false) avoids the React 19
  // set-state-in-effect cascading-render warning.
  const [loading, setLoading] = useState(supa !== null);
  const router = useRouter();
  const authConfigured = supa !== null;

  useEffect(() => {
    if (!supa) return; // initial loading was already false
    let mounted = true;
    supa.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supa.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signInWithGoogle(next?: string) {
    if (!supa) return { ok: false as const, error: "Auth not configured" };
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = next
      ? `${base}/auth/callback?next=${encodeURIComponent(next)}`
      : `${base}/auth/callback`;
    const { error } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signInWithMicrosoft(next?: string) {
    if (!supa) return { ok: false as const, error: "Auth not configured" };
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = next
      ? `${base}/auth/callback?next=${encodeURIComponent(next)}`
      : `${base}/auth/callback`;
    const { error } = await supa.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo, scopes: "email" },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signInWithPassword(email: string, password: string) {
    if (!supa) return { ok: false as const, error: "Auth not configured" };
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signUpWithPassword(email: string, password: string) {
    if (!supa) return { ok: false as const, error: "Auth not configured" };
    const { error } = await supa.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined,
      },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  async function signOut() {
    if (!supa) return;
    await supa.auth.signOut();
    router.refresh();
  }

  return (
    <Ctx.Provider
      value={{
        user, session, loading, authConfigured,
        signInWithGoogle, signInWithMicrosoft,
        signInWithPassword, signUpWithPassword, signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    // Render-safe fallback when AuthProvider isn't mounted (e.g.
    // legacy game-canvas surfaces that don't need auth). All methods
    // return error envelopes; user/session null.
    return {
      user: null,
      session: null,
      loading: false,
      authConfigured: false,
      signInWithGoogle: async (_next?: string) => ({ ok: false, error: "Auth provider not mounted" }),
      signInWithMicrosoft: async (_next?: string) => ({ ok: false, error: "Auth provider not mounted" }),
      signInWithPassword: async () => ({ ok: false, error: "Auth provider not mounted" }),
      signUpWithPassword: async () => ({ ok: false, error: "Auth provider not mounted" }),
      signOut: async () => {},
    };
  }
  return v;
}
