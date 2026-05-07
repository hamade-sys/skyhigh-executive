"use client";

/**
 * StorageFailureBanner — Phase 7 P2 of the enterprise-readiness plan.
 *
 * Listens for the `skyforce:storage-failed` window event dispatched
 * by the Zustand persist middleware (src/store/game.ts) when a
 * localStorage write throws. Common causes: private/incognito mode,
 * quota exceeded, browser security policy, OS-level cleanup mid-
 * session.
 *
 * Renders a sticky banner under the ActiveGameRibbon (so it doesn't
 * overlay it). Dismissable for the rest of the session — but the
 * underlying localStorage failure persists, so we surface it on the
 * NEXT failed write too.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export function StorageFailureBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onFail() {
      setVisible(true);
    }
    window.addEventListener("skyforce:storage-failed", onFail as EventListener);
    return () => {
      window.removeEventListener("skyforce:storage-failed", onFail as EventListener);
    };
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] w-full bg-amber-50 border-b border-amber-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden />
        <p className="text-[13px] text-amber-900 leading-snug flex-1 min-w-0">
          <strong className="font-semibold">Progress isn&rsquo;t being saved on this browser.</strong>
          {" "}
          <span className="hidden sm:inline">
            (Private/incognito mode, full storage, or browser security
            settings.) Sign in to save across devices, or copy your
            game code now if you need to resume later.
          </span>
        </p>
        <button
          type="button"
          aria-label="Dismiss storage warning"
          onClick={() => setDismissed(true)}
          className="w-8 h-8 min-h-[40px] min-w-[40px] rounded text-amber-700 hover:bg-amber-100 flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
