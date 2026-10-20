"use client";

/**
 * Header and footer for the ICAN Trivia builder pages — the same
 * lock-up and light chrome as portal.icanmena.com: real ICAN logo,
 * white bar, slate links, bright-teal action, white footer.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/trivia/Wordmark";

export function TriviaHeader() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const signedIn = Boolean(user && !user.is_anonymous);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/trivia" aria-label="ICAN Trivia home" className="shrink-0">
          <Wordmark size="sm" />
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-medium md:flex" aria-label="ICAN Trivia">
          <Link href="/trivia" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            My trivia
          </Link>
          <Link href="/play" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            Join a game
          </Link>
          <Link href="/" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            Simulations
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <div className="relative" ref={ref}>
              <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#00C2CB] text-xs font-bold text-white">
                  {(user?.email?.[0] ?? "U").toUpperCase()}
                </span>
                <span className="hidden max-w-[12rem] truncate sm:inline">{user?.email}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
              </button>
              {open && (
                <div role="menu" className="absolute right-0 top-12 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Signed in as
                    <span className="block truncate text-sm font-medium text-slate-900">{user?.email}</span>
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      void signOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4 text-slate-400" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login?next=%2Ftrivia" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900">
                Sign in
              </Link>
              <Link href="/play" className="inline-flex min-h-10 items-center rounded-full bg-[#02797F] px-4 text-sm font-semibold text-white hover:bg-[#026167]">
                Join a game
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function TriviaFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-slate-500 sm:px-6">
        <Wordmark size="sm" />
        <span>© {new Date().getFullYear()} ICAN MENA</span>
        <nav className="ml-auto flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link href="/" className="hover:text-slate-900">
            ICAN Simulations
          </Link>
          <Link href="/play" className="hover:text-slate-900">
            Join a game
          </Link>
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-900">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
