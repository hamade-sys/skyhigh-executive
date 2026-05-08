"use client";

import { Modal, ModalBody, ModalFooter, ModalHeader, Button } from "@/components/ui";
import { Plane, Map, Hexagon, Info, Keyboard, BookOpen, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Quick-reference cheat sheet — opens from a "?" button in the topbar.
 *  Aimed at the facilitator running a live session and any player who
 *  needs a refresher on what each panel does.
 *
 *  Layout note: the Modal primitive already constrains us to
 *  `max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden`, so the
 *  body section gets `flex-1` and scrolls within. Earlier the body
 *  also tried to set `max-h-[70vh]` which fought with the parent
 *  cap — on shorter viewports (13" laptops) the inner cap won and
 *  pushed the header off-screen, leaving users staring at the middle
 *  of the cheat sheet with no visible close affordance. Removed the
 *  inner cap and added an explicit X close button in the header so
 *  there's always a one-click escape regardless of stacking quirks
 *  with concurrent route-config dialogs. */
export function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <ModalHeader className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent">
            ICAN Simulations reference
          </span>
          <h2 className="font-display text-[1.5rem] text-ink leading-tight mt-1">
            Quick-reference cheat sheet
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          className="shrink-0 -m-1 p-2 rounded-lg text-ink-2 hover:bg-line/40 hover:text-ink transition"
        >
          <X size={18} />
        </button>
      </ModalHeader>

      <ModalBody className="space-y-5">
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
          <Row label="Save state corrupt" detail="Facilitator panel → Reset simulation wipes localStorage cleanly." />
        </Section>
      </ModalBody>

      <ModalFooter>
        <Button variant="primary" onClick={onClose}>Got it</Button>
      </ModalFooter>
    </Modal>
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
