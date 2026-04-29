"use client";

/**
 * ICAN Simulations marketing top bar — ican-crm-style.
 *
 * Sticky, backdrop-blurred, auth-aware. Renders on every public
 * surface above the hero. Brand teal `#00C2CB` for the primary
 * CTA matches the rest of the ICAN family of products.
 *
 * When the user is signed in: shows their initial avatar + a
 * dropdown with Profile / Sign out. When signed out: shows a
 * subtle "Sign in" link plus the primary "Join Game" CTA.
 */

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { Layers, ArrowRight, Menu, X, LogOut, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";

interface Props {
  current?: "home" | "about" | "lobby";
  variant?: "default" | "onDark";
}

const NAV_LINKS = [
  { href: "/", label: "Home", key: "home" },
  { href: "/about", label: "About", key: "about" },
  { href: "/lobby", label: "Public lobby", key: "lobby" },
] as const;

export function MarketingHeader({ current, variant = "default" }: Props) {
  const { user, signOut, authConfigured } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click-away close for profile menu
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  const isDark = variant === "onDark" && !scrolled;
  const initial = user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-200",
          isDark
            ? "bg-transparent border-b border-transparent"
            : "backdrop-blur-xl bg-white/85 border-b",
          scrolled ? "border-slate-200" : "border-transparent",
        )}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 group" aria-label="ICAN Simulations home">
            <div
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                isDark
                  ? "bg-cyan-500/15 ring-2 ring-cyan-500/20"
                  : "bg-cyan-50 ring-2 ring-cyan-100",
              )}
            >
              <Layers className={cn("w-3.5 h-3.5", isDark ? "text-cyan-300" : "text-cyan-700")} />
            </div>
            <span
              className={cn(
                "font-display text-lg font-bold tracking-tight transition-colors",
                isDark ? "text-white" : "text-slate-900",
              )}
            >
              ICAN <span className="font-medium opacity-80">Simulations</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = current === link.key;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    isDark
                      ? active
                        ? "text-white bg-white/10"
                        : "text-slate-200 hover:text-white hover:bg-white/5"
                      : active
                        ? "text-slate-900 bg-slate-100"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop CTA + auth */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              // Signed-in: avatar + dropdown
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors",
                    isDark
                      ? "border-white/20 text-white hover:bg-white/5"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span className="w-6 h-6 rounded-full bg-[#00C2CB] text-white text-xs font-bold flex items-center justify-center">
                    {initial}
                  </span>
                  <span className="hidden lg:inline truncate max-w-[10rem]">
                    {user.email ?? "Account"}
                  </span>
                </button>
                {profileOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-11 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <div className="text-xs text-slate-500 mb-0.5">Signed in as</div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {user.email}
                      </div>
                    </div>
                    <Link
                      href="/lobby"
                      onClick={() => setProfileOpen(false)}
                      className="w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      role="menuitem"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      My games
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        signOut();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      role="menuitem"
                    >
                      <LogOut className="w-3.5 h-3.5 text-slate-400" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Signed-out: subtle Sign in + primary Join Game
              <>
                {authConfigured && (
                  <Link
                    href="/login"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isDark ? "text-slate-200 hover:text-white" : "text-slate-700 hover:text-slate-900",
                    )}
                  >
                    Sign in
                  </Link>
                )}
                <Link
                  href="/lobby"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full bg-[#00C2CB] text-white hover:bg-[#00a9b1] transition-colors shadow-sm"
                >
                  Join game <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "md:hidden p-2 rounded-md",
              isDark ? "text-white" : "text-slate-700",
            )}
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 z-30 bg-white border-b border-slate-100 shadow-sm">
          <nav className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-md"
              >
                {link.label}
              </Link>
            ))}
            <div className="h-px bg-slate-100 my-2" />
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md text-left"
              >
                Sign out ({user.email})
              </button>
            ) : (
              authConfigured && (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-md"
                >
                  Sign in
                </Link>
              )
            )}
            <Link
              href="/lobby"
              onClick={() => setMenuOpen(false)}
              className="mt-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-full bg-[#00C2CB] text-white hover:bg-[#00a9b1] transition-colors"
            >
              Join game <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
