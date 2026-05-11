"use client";

import { useEffect } from "react";
import { Plane, Map, Hexagon, Info, Keyboard, BookOpen, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Quick-reference cheat sheet — opens from a "?" button in the topbar.
 *  Aimed at the facilitator running a live session and any player who
 *  needs a refresher on what each panel does.
 *
 *  Implementation note: this used to be a `<Modal>` (native `<dialog>`).
 *  Native dialog stacking proved fragile in this app — when a second
 *  showModal() landed on top of an already-open dialog (close-quarter
 *  pre-flight + route-config), the browser correctly inerted everything
 *  outside the topmost dialog, but the underneath dialogs stayed
 *  visually present with their backdrops competing. Players read this
 *  as "windows that won't go away" because clicking buttons on the
 *  underneath modal did nothing (inert). After three rounds of trying
 *  to coordinate native dialog mutex, we switched HelpModal to a
 *  fixed-position slide-in panel modeled after ChatPanel — same pattern,
 *  different mounting layer (regular DOM, NOT top layer), so it can
 *  never stack with `<dialog>` modals. The cheat sheet is reference
 *  content; a side panel is actually the better UX anyway.
 *
 *  Closing affordances: X button (top-right), Escape key, click on the
 *  scrim. All three close.
 */
export function HelpModal({ open, onClose }: Props) {
  // Esc-to-close — native dialog provided this for free; we wire it
  // explicitly here. Listener active only while open so we don't
  // interfere with parent components when the panel is closed.
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Cross-component mutex — when any other top-level dialog opens
  // via the Modal primitive (e.g. close-quarter pre-flight or
  // route-config), the primitive dispatches `ican:overlay-opened`.
  // This panel listens and closes itself so we never end up with
  // help layered alongside a dialog. The panel itself doesn't go
  // in the top layer, so without this listener it could persist
  // visually behind a dialog.
  useEffect(() => {
    if (!open) return;
    function handler() {
      onClose();
    }
    window.addEventListener("ican:overlay-opened", handler);
    return () => window.removeEventListener("ican:overlay-opened", handler);
  }, [open, onClose]);

  // Body scroll lock while the panel is open. The panel itself owns
  // its own scroll region (the body section); without a body lock,
  // scrolling the wheel inside the panel could "leak" through to the
  // map / canvas underneath, which feels glitchy. Restored on close.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ICAN Simulations cheat sheet"
      className="fixed inset-0 z-[80] flex"
    >
      {/* Scrim — click anywhere outside the panel to close. */}
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="flex-1 bg-slate-900/30 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
      />
      {/* Panel — full-width on mobile, anchored right at md+. Same
          width band as ChatPanel for visual consistency between the
          two reference surfaces in the game chrome. */}
      <aside
        className={cn(
          "h-full w-full md:max-w-md md:w-[28rem]",
          "flex flex-col bg-surface border-l border-line shadow-[var(--shadow-3)]",
        )}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <span className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent">
              ICAN Simulations reference
            </span>
            <h2 className="font-display text-[1.25rem] text-ink leading-tight mt-0.5 truncate">
              Quick-reference cheat sheet
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="shrink-0 -m-1 p-2 rounded-lg text-ink-2 hover:bg-line/40 hover:text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          <Section icon={<Map size={14} />} title="Map flow">
            <Row label="Click a city" detail="Selects it as origin (turns yellow)." />
            <Row label="Click another city" detail="Auto-opens the route setup modal." />
            <Row label="Click the same city again" detail="Deselects it." />
            <Row label="Click empty water" detail="Clears selection." />
          </Section>

          <Section icon={<Plane size={14} />} title="Routes &amp; fleet">
            <Row label="Routes panel" detail="Search by IATA or city. Click a row to manage frequency, fares, suspend, close." />
            <Row label="Fleet panel" detail="Order aircraft (buy or lease), inspect by type, eco-upgrade or retire individual planes." />
            <Row label="Yellow Review chip" detail="Route is losing 2+ consecutive quarters — consider re-pricing or closing." />
            <Row label="Lease return penalty" detail="Returning a leased aircraft within 4Q costs 2 quarters of lease as penalty." />
          </Section>

          <Section icon={<Hexagon size={14} />} title="Quarterly loop">
            <Row label="Ops panel sliders" detail="Six levers (Staff, Marketing, Service, Rewards, Operations, CS). Streak ≥3 quarters compounds at 1.2×." />
            <Row label="Decisions panel" detail="Resolve any open board scenarios this quarter. Final once submitted; deferred consequences shown below." />
            <Row label="Next Quarter" detail="Locks ops, runs the engine, opens the digest modal — read News, Routes, People, P&amp;L tabs before continuing." />
            <Row label="Brand grade" detail="Letter grade from A+ to F based on brand pts, loyalty, and ops pts. Drives airline-value multiplier." />
          </Section>

          <Section icon={<BookOpen size={14} />} title="Strategy">
            <Row label="Hub investments" detail="One-time capital that compounds: fuel tank −5% fuel, lounge +4% demand, depot −20% maintenance, ops +5 slots." />
            <Row label="Secondary hubs" detail="Unlock from Q3. Pay tier-priced activation fee + 2× terminal fee, gain new origin/destination flexibility." />
            <Row label="Doctrine bonuses" detail="Onboarding choices propagate forever: passenger / cargo focus, geographic priority, CSR theme." />
            <Row label="Crew strikes" detail="Below-market salary + low labour relations = wildcat (−6% revenue) or general strike (−12%)." />
          </Section>

          <Section icon={<Keyboard size={14} />} title="Keyboard">
            <Row label="Esc" detail="Close any modal or clear selection." />
            <Row label="Tab" detail="Move focus through interactive controls in reading order." />
            <Row label="Enter" detail="Activates the focused button (works inside the dialog focus trap)." />
          </Section>

          <Section icon={<Info size={14} />} title="If something breaks">
            <Row label="Buttons unresponsive" detail="Engine likely threw on a click. Hard refresh (Cmd+Shift+R)." />
            <Row label="Stuck on a modal" detail="Press Escape, or use the Reset Simulation button on the error card." />
            <Row label="Save state corrupt" detail="Facilitator panel → Reset simulation clears the current in-memory view and reloads authoritative state." />
          </Section>
        </div>

        <footer className="flex items-center justify-end px-5 py-3 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-primary text-primary-fg text-[0.875rem] font-semibold hover:bg-primary-hover transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Got it
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section({
  icon, title, children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-accent font-semibold mb-2">
        {icon} {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-baseline gap-3 text-[0.8125rem]">
      <span className="font-mono font-semibold text-ink shrink-0 w-44 truncate">{label}</span>
      <span className="text-ink-2 leading-relaxed">{detail}</span>
    </div>
  );
}
