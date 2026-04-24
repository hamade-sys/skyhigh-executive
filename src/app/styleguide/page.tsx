"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Metric,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui";

export default function StyleGuide() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="flex-1">
      <header className="px-8 py-6 border-b border-line">
        <p className="text-[0.6875rem] uppercase tracking-[0.22em] text-accent mb-2">
          SkyForce · Flight Deck Modernist
        </p>
        <h1 className="font-display text-4xl leading-tight text-ink mb-1">
          Style guide
        </h1>
        <p className="text-ink-2 text-[0.9375rem] max-w-[60ch]">
          Visual system reference — tokens, type, color, components. Use as QA
          surface when shipping anything that should feel native to SkyForce.
        </p>
      </header>

      <div className="px-8 py-8 space-y-16">
        {/* ── Typography ───────────────────────────────────── */}
        <Section title="Typography" subtitle="Switzer · Gambarino · JetBrains Mono">
          <div className="space-y-6">
            <div>
              <Label>Display — Gambarino (h1, h2)</Label>
              <p className="font-display text-[3rem] leading-none text-ink">
                Build an airline that outlives the crisis.
              </p>
            </div>
            <div>
              <Label>Body — Switzer</Label>
              <p className="text-[0.9375rem] leading-[1.6] text-ink max-w-[65ch]">
                Each quarter opens with five headlines, a board decision, and a
                ticking clock. You lead an airline. You lead a team. You have
                thirty minutes before the board meets again.
              </p>
            </div>
            <div>
              <Label>Data — JetBrains Mono, tabular</Label>
              <div className="font-mono tabular text-[1.125rem] text-ink space-x-6">
                <span>$80,000,000</span>
                <span>Q7 / 20</span>
                <span>67.4%</span>
                <span>+12.3</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              {[
                { size: "0.6875rem", label: "micro", text: "MICRO LABEL" },
                { size: "0.8125rem", label: "sm", text: "Small body" },
                { size: "0.9375rem", label: "base", text: "Base body" },
                { size: "1.125rem", label: "lg", text: "Lead" },
              ].map((s) => (
                <div key={s.label} className="space-y-1">
                  <div className="text-[0.625rem] text-ink-faint uppercase tracking-wider">
                    {s.label} · {s.size}
                  </div>
                  <div style={{ fontSize: s.size }} className="text-ink">
                    {s.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Color ────────────────────────────────────────── */}
        <Section title="Color" subtitle="Warm neutrals, navy primary, coral restraint">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {[
              { name: "bg", color: "var(--bg)" },
              { name: "surface", color: "var(--surface)" },
              { name: "surface-2", color: "var(--surface-2)" },
              { name: "line", color: "var(--line)" },
              { name: "line-strong", color: "var(--line-strong)" },
              { name: "ink-muted", color: "var(--ink-muted)" },
              { name: "ink-2", color: "var(--ink-2)" },
              { name: "ink", color: "var(--ink)" },
              { name: "primary", color: "var(--primary)" },
              { name: "primary-hover", color: "var(--primary-hover)" },
              { name: "accent", color: "var(--accent)" },
              { name: "accent-hover", color: "var(--accent-hover)" },
              { name: "positive", color: "var(--positive)" },
              { name: "negative", color: "var(--negative)" },
              { name: "warning", color: "var(--warning)" },
              { name: "info", color: "var(--info)" },
            ].map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div
                  className="h-16 rounded-md border border-line"
                  style={{ background: s.color }}
                />
                <div className="text-[0.6875rem] text-ink-muted">
                  --color-{s.name}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Buttons ──────────────────────────────────────── */}
        <Section title="Buttons" subtitle="Five variants · three sizes">
          <div className="space-y-6">
            <Row>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </Row>
            <Row>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
          </div>
        </Section>

        {/* ── Inputs ───────────────────────────────────────── */}
        <Section title="Inputs" subtitle="Form fields, focus ring, placeholder">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
            <Input placeholder="Airline name" />
            <Input placeholder="IATA code" defaultValue="SKY" />
            <Input placeholder="Disabled" disabled />
            <Input placeholder="Number" type="number" defaultValue="150" />
          </div>
        </Section>

        {/* ── Badges ───────────────────────────────────────── */}
        <Section title="Badges" subtitle="Tone variants">
          <Row>
            <Badge>Neutral</Badge>
            <Badge tone="primary">Primary</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="positive">Profit</Badge>
            <Badge tone="negative">Loss</Badge>
            <Badge tone="warning">Low stock</Badge>
            <Badge tone="info">Info</Badge>
          </Row>
        </Section>

        {/* ── Metrics ──────────────────────────────────────── */}
        <Section title="Metrics" subtitle="KPI display — label, value, delta">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Card>
              <CardBody>
                <Metric
                  label="Cash balance"
                  value="$142.8"
                  unit="M"
                  delta={{ value: 8.3 }}
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Metric
                  label="Brand value"
                  value="67.4"
                  delta={{ value: -2.1 }}
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Metric
                  label="Routes active"
                  value="12"
                  delta={{ value: 3 }}
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Metric
                  label="Loyalty"
                  value="62"
                  unit="%"
                  delta={{ value: 0 }}
                />
              </CardBody>
            </Card>
          </div>
        </Section>

        {/* ── Cards ────────────────────────────────────────── */}
        <Section title="Cards" subtitle="Surfaces with header / body / footer">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Q7 board decision · S11</CardTitle>
                <Badge tone="warning">30 min</Badge>
              </CardHeader>
              <CardBody>
                <p className="text-ink-2 text-[0.9375rem] leading-relaxed">
                  The Olympics approach. Your hub is 40 minutes from the
                  stadium complex. Official sponsorship, performance
                  partnership, local-carrier play — or stand aside entirely.
                </p>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" size="sm">
                  Save draft
                </Button>
                <Button variant="primary" size="sm">
                  Submit decision
                </Button>
              </CardFooter>
            </Card>

            <Card elevated>
              <CardHeader>
                <CardTitle>Route profitability · LHR → DXB</CardTitle>
                <Badge tone="positive">87% load</Badge>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-3 gap-6">
                  <Metric label="Quarter revenue" value="$14.2" unit="M" />
                  <Metric label="Quarter cost" value="$9.8" unit="M" />
                  <Metric
                    label="Profit"
                    value="$4.4"
                    unit="M"
                    delta={{ value: 1.2 }}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </Section>

        {/* ── Modal ────────────────────────────────────────── */}
        <Section title="Modal" subtitle="Native <dialog>, top layer, Escape closes">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open crisis modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            ariaLabel="Example modal"
          >
            <ModalHeader>
              <div className="flex items-center gap-3">
                <Badge tone="negative">Severity · high</Badge>
                <span className="text-[0.75rem] uppercase tracking-wider text-ink-muted">
                  Q8 · War in the corridor
                </span>
              </div>
              <h2 className="font-display text-2xl text-ink mt-3">
                Three aircraft are airborne over a corridor that just closed.
              </h2>
            </ModalHeader>
            <ModalBody>
              <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-4">
                Your dispatch flags a routing conflict within the next two
                hours. Reroute costs fuel and schedule; continuing is a
                calculated risk against a 25% incident probability next
                quarter.
              </p>
              <div className="space-y-2">
                {["Reroute all flights", "Continue with current routing", "Suspend corridor operations"].map((opt, i) => (
                  <label
                    key={opt}
                    className="flex items-start gap-3 rounded-md border border-line px-4 py-3 hover:bg-surface-hover cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="crisis"
                      value={opt}
                      defaultChecked={i === 0}
                      className="mt-1 accent-primary"
                    />
                    <span className="text-ink text-[0.9375rem]">{opt}</span>
                  </label>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Close
              </Button>
              <Button variant="primary">Submit decision</Button>
            </ModalFooter>
          </Modal>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-6 pb-3 border-b border-line">
        <h2 className="font-display text-[1.75rem] text-ink leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-ink-muted text-[0.875rem] mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted mb-2">
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
