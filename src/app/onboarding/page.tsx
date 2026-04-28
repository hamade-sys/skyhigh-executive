"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CITIES } from "@/data/cities";
import { DOCTRINES } from "@/data/doctrines";
import { fmtMoney } from "@/lib/format";
import { Badge, Button, Card, CardBody, Input } from "@/components/ui";
import { useGame } from "@/store/game";
import { cn } from "@/lib/cn";
import {
  hubPickableCities,
  hubPriceUsd,
  hubTierLabel,
  ONBOARDING_TOTAL_BUDGET_USD,
  PREMIUM_HUB_CODES,
} from "@/lib/hub-pricing";
import type { DoctrineId, Team } from "@/types/game";

// L0 presentation rank + team count are facilitator-only now —
// removed from the player onboarding so the eight player-driven
// strategic choices stand on their own without simulation framing.
// teamCount defaults via store (5); facilitator dashboard tunes it.

const STEP_COUNT = 9;

type MarketFocus = Team["marketFocus"];
type GeographicPriority = Team["geographicPriority"];
type PricingPhilosophy = Team["pricingPhilosophy"];
type SalaryPhilosophy = Team["salaryPhilosophy"];
type MarketingLevel = Team["marketingLevel"];
type CsrTheme = Team["csrTheme"];

export default function Onboarding() {
  const router = useRouter();
  const startNewGame = useGame((s) => s.startNewGame);

  const [step, setStep] = useState(0);
  // Step 1 — airline identity
  const [airlineName, setAirlineName] = useState("");
  const [code, setCode] = useState("");
  const [tagline, setTagline] = useState("");
  // Step 2 — doctrine
  const [doctrine, setDoctrine] = useState<DoctrineId>("premium-service");
  // Step 3 — hub (now with cost-tier deduction)
  const [hubCode, setHubCode] = useState("LHR");
  // Step 4 — strategy declaration (market + geo)
  const [marketFocus, setMarketFocus] = useState<MarketFocus>("balanced");
  const [geoPriority, setGeoPriority] = useState<GeographicPriority>("global");
  // Step 5 — pricing
  const [pricing, setPricing] = useState<PricingPhilosophy>("standard");
  // Step 6 — salary
  const [salary, setSalary] = useState<SalaryPhilosophy>("at");
  // Step 7 — marketing
  const [marketing, setMarketing] = useState<MarketingLevel>("medium");
  // Step 8 — CSR + final review (combined; L0/teamCount removed)
  const [csr, setCsr] = useState<CsrTheme>("none");

  const canAdvance =
    (step === 0 && airlineName.trim().length > 2 && code.trim().length >= 2) ||
    (step >= 1 && step <= STEP_COUNT - 1);

  function finish() {
    startNewGame({
      airlineName: airlineName.trim(),
      code: code.trim().toUpperCase(),
      doctrine,
      hubCode,
      tagline: tagline.trim(),
      marketFocus,
      geographicPriority: geoPriority,
      pricingPhilosophy: pricing,
      salaryPhilosophy: salary,
      marketingLevel: marketing,
      csrTheme: csr,
    });
    router.push("/");
  }

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <header className="px-8 py-5 border-b border-line flex items-center justify-between shrink-0">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl text-ink">SkyForce</span>
          <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            Q1 Brand Building · L0
          </span>
        </div>
        <div className="text-[0.75rem] text-ink-muted tabular">
          Step {step + 1} of {STEP_COUNT}
        </div>
      </header>

      {/* Scrollable content — nav buttons live outside this so they're
          always visible regardless of how tall the step content is */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex justify-center px-4 py-8 md:px-8 md:py-12">
        <div className="w-full max-w-3xl">
          {/* Real progressbar role so screen readers announce progress
              instead of just rendering 9 anonymous decorative bars. */}
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEP_COUNT}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${STEP_COUNT}`}
            className="flex gap-1.5 mb-10"
          >
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-line",
                )}
              />
            ))}
          </div>

          {step === 0 && (
            <Step title="Name your airline" sub="Who you are. Tagline goes on every boarding pass.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Airline name">
                  <Input
                    value={airlineName}
                    onChange={(e) => setAirlineName(e.target.value)}
                    placeholder="e.g. Meridian Air"
                    autoFocus
                  />
                </Field>
                <Field label="IATA code (2–3 letters)">
                  <Input
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))
                    }
                    placeholder="e.g. MRD"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Tagline (optional)">
                    <Input
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="e.g. Cross continents, keep promises."
                    />
                  </Field>
                </div>
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step title="Choose your doctrine" sub="Your starting operating model. You can revisit it once at Quarter 20.">
              {/* role=radiogroup + role=radio on each card so assistive
                  tech announces the cards as a single-select group with
                  the active option correctly checked. */}
              <div
                role="radiogroup"
                aria-label="Airline doctrine"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {DOCTRINES.map((d) => {
                  const active = doctrine === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${d.name}: ${d.tagline}`}
                      onClick={() => setDoctrine(d.id)}
                      className={cn(
                        "text-left rounded-lg border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        active
                          ? "border-primary bg-[rgba(20,53,94,0.04)] shadow-[var(--shadow-1)]"
                          : "border-line hover:border-line-strong hover:bg-surface-hover",
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span aria-hidden="true" className="font-display text-[1.5rem] text-primary">
                          {d.icon}
                        </span>
                        <span className="font-semibold text-ink">{d.name}</span>
                      </div>
                      <p className="italic text-ink-2 text-[0.8125rem] mb-3">
                        &ldquo;{d.tagline}&rdquo;
                      </p>
                      <p className="text-ink-2 text-[0.875rem] leading-relaxed mb-3">
                        {d.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.effects.map((e) => (
                          <Badge key={e} tone={active ? "primary" : "neutral"}>
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {step === 2 && (
            <HubPickerStep
              hubCode={hubCode}
              setHubCode={setHubCode}
            />
          )}

          {step === 3 && (
            <Step title="Strategy declaration" sub="Your market focus and geographic priority.">
              <div className="space-y-6">
                <div>
                  <SubLabel id="market-focus-label">Market focus</SubLabel>
                  <div
                    role="radiogroup"
                    aria-labelledby="market-focus-label"
                    className="grid grid-cols-3 gap-2"
                  >
                    {(["passenger", "balanced", "cargo"] as MarketFocus[]).map((m) => (
                      <PillButton
                        key={m}
                        active={marketFocus === m}
                        onClick={() => setMarketFocus(m)}
                        ariaLabel={`Market focus: ${m}`}
                      >
                        <div className="font-medium capitalize">{m}</div>
                        <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                          {m === "passenger" ? "People first" : m === "cargo" ? "Logistics engine" : "Diversified book"}
                        </div>
                      </PillButton>
                    ))}
                  </div>
                </div>
                <div>
                  <SubLabel id="geo-priority-label">Geographic priority</SubLabel>
                  <div
                    role="radiogroup"
                    aria-labelledby="geo-priority-label"
                    className="grid grid-cols-2 md:grid-cols-5 gap-2"
                  >
                    {(["north-america", "europe", "asia-pacific", "middle-east", "global"] as GeographicPriority[]).map((g) => (
                      <PillButton
                        key={g}
                        active={geoPriority === g}
                        onClick={() => setGeoPriority(g)}
                        ariaLabel={`Geographic priority: ${g.replace("-", " ")}`}
                      >
                        <div className="font-medium text-[0.8125rem] capitalize">
                          {g.replace("-", " ")}
                        </div>
                      </PillButton>
                    ))}
                  </div>
                </div>
              </div>
            </Step>
          )}

          {step === 4 && (
            <Step title="Pricing philosophy" sub="Sets your default pricing tier. Per-route overrides still work.">
              <div
                role="radiogroup"
                aria-label="Pricing philosophy"
                className="grid grid-cols-2 md:grid-cols-4 gap-2"
              >
                {([
                  { v: "budget",   lbl: "Budget",          sub: "Lower fares · volume play" },
                  { v: "standard", lbl: "Standard",        sub: "Market rate" },
                  { v: "premium",  lbl: "Premium",         sub: "Above-market fares · brand-led" },
                  { v: "ultra",    lbl: "Ultra-premium",   sub: "Top-of-market positioning" },
                ] as const).map((p) => (
                  <PillButton
                    key={p.v}
                    active={pricing === p.v}
                    onClick={() => setPricing(p.v)}
                    ariaLabel={`${p.lbl}: ${p.sub}`}
                  >
                    <div className="font-medium">{p.lbl}</div>
                    <div className="text-[0.6875rem] text-ink-muted mt-0.5">{p.sub}</div>
                  </PillButton>
                ))}
              </div>
            </Step>
          )}

          {step === 5 && (
            <Step title="Salary philosophy" sub="Sets your initial Staff slider. Affects loyalty + strike risk.">
              <div
                role="radiogroup"
                aria-label="Salary philosophy"
                className="grid grid-cols-3 gap-2"
              >
                {([
                  { v: "below", lbl: "Below market",  sub: "Cheaper · higher attrition risk" },
                  { v: "at",    lbl: "At market",     sub: "Industry standard" },
                  { v: "above", lbl: "Above market",  sub: "Premium pay · loyal workforce" },
                ] as const).map((p) => (
                  <PillButton
                    key={p.v}
                    active={salary === p.v}
                    onClick={() => setSalary(p.v)}
                    ariaLabel={`${p.lbl}: ${p.sub}`}
                  >
                    <div className="font-medium">{p.lbl}</div>
                    <div className="text-[0.6875rem] text-ink-muted mt-0.5">{p.sub}</div>
                  </PillButton>
                ))}
              </div>
            </Step>
          )}

          {step === 6 && (
            <Step title="Marketing budget" sub="Initial Marketing slider. Brand Pts grow faster with higher spend.">
              <div
                role="radiogroup"
                aria-label="Marketing budget level"
                className="grid grid-cols-2 md:grid-cols-4 gap-2"
              >
                {([
                  { v: "low",        lbl: "Low",         sub: "Tactical, brand grows slowly" },
                  { v: "medium",     lbl: "Medium",      sub: "Steady brand build" },
                  { v: "high",       lbl: "High",        sub: "Brand-led growth" },
                  { v: "aggressive", lbl: "Aggressive",  sub: "Maximum brand velocity" },
                ] as const).map((p) => (
                  <PillButton
                    key={p.v}
                    active={marketing === p.v}
                    onClick={() => setMarketing(p.v)}
                    ariaLabel={`${p.lbl}: ${p.sub}`}
                  >
                    <div className="font-medium">{p.lbl}</div>
                    <div className="text-[0.6875rem] text-ink-muted mt-0.5">{p.sub}</div>
                  </PillButton>
                ))}
              </div>
            </Step>
          )}

          {step === 7 && (
            <Step title="CSR theme" sub="Your corporate social responsibility story. Flavor + end-game tints.">
              <div
                role="radiogroup"
                aria-label="Corporate social responsibility theme"
                className="grid grid-cols-2 md:grid-cols-4 gap-2"
              >
                {([
                  { v: "environment", lbl: "Environment", sub: "SAF, offsets, green story" },
                  { v: "community",   lbl: "Community",   sub: "Regional access, equity" },
                  { v: "employees",   lbl: "Employees",   sub: "People-first investment" },
                  { v: "none",        lbl: "None",        sub: "Pure business focus" },
                ] as const).map((p) => (
                  <PillButton
                    key={p.v}
                    active={csr === p.v}
                    onClick={() => setCsr(p.v)}
                    ariaLabel={`${p.lbl}: ${p.sub}`}
                  >
                    <div className="font-medium">{p.lbl}</div>
                    <div className="text-[0.6875rem] text-ink-muted mt-0.5">{p.sub}</div>
                  </PillButton>
                ))}
              </div>
            </Step>
          )}

          {step === 8 && (
            <Step
              title="Final review"
              sub="Confirm the strategic profile your airline launches with. Cash on day one is what's left of your $350M budget after the hub purchase."
            >
              <Card className="mb-5">
                <CardBody>
                  <Row k="Airline" v={`${airlineName} (${code})${tagline ? ` · "${tagline}"` : ""}`} />
                  <Row k="Doctrine" v={DOCTRINES.find((d) => d.id === doctrine)?.name ?? ""} />
                  <Row
                    k="Hub"
                    v={(() => {
                      const hubCity = CITIES.find((c) => c.code === hubCode);
                      if (!hubCity) return "—";
                      return `${hubCity.name} · ${hubCity.code} (${hubTierLabel(hubCity)} · ${fmtMoney(hubPriceUsd(hubCity))})`;
                    })()}
                  />
                  <Row k="Market focus" v={marketFocus} />
                  <Row k="Geography" v={geoPriority.replace("-", " ")} />
                  <Row k="Pricing" v={pricing} />
                  <Row k="Salary policy" v={salary} />
                  <Row k="Marketing" v={marketing} />
                  <Row k="CSR theme" v={csr} />
                </CardBody>
              </Card>

              <div className="rounded-md border border-line bg-surface-2/40 px-4 py-3 text-[0.8125rem] text-ink-2 leading-relaxed">
                <div className="font-semibold text-ink mb-1">Starting position</div>
                <div>
                  Operating cash:{" "}
                  <span className="tabular font-mono text-ink font-semibold">
                    {(() => {
                      const hubCity = CITIES.find((c) => c.code === hubCode);
                      const cost = hubCity ? hubPriceUsd(hubCity) : 0;
                      return fmtMoney(ONBOARDING_TOTAL_BUDGET_USD - cost);
                    })()}
                  </span>
                  {" "}· 2× A320 starter aircraft · Brand 50.
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-1">
                  Total budget {fmtMoney(ONBOARDING_TOTAL_BUDGET_USD)} less hub purchase cost. Rivals and tournament hosts are seeded by the facilitator.
                </div>
              </div>
            </Step>
          )}

        </div>
        </div>{/* end centering wrapper */}
      </div>{/* end overflow-y-auto scroll area */}

      {/* Nav bar — outside the scroll area so it's always visible */}
      <div className="shrink-0 flex items-center justify-between border-t border-line bg-bg/95 px-4 py-4 backdrop-blur md:px-8">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}
        >
          ← {step === 0 ? "Back to landing" : "Back"}
        </Button>
        {step < STEP_COUNT - 1 ? (
          <Button
            variant="primary"
            disabled={!canAdvance}
            onClick={() => setStep(step + 1)}
          >
            Continue →
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            Launch airline →
          </Button>
        )}
      </div>
    </main>
  );
}

function Step({
  title, sub, children,
}: {
  title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-4xl text-ink leading-tight mb-2">{title}</h1>
      <p className="text-ink-2 text-[0.9375rem] mb-8">{sub}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function SubLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
      {children}
    </div>
  );
}

/** Radio-style pill. The visible content is decorative for AT — pass
 *  `ariaLabel` so screen readers announce the option meaningfully
 *  (otherwise they'd just read the visible label + sub line in two
 *  separate utterances). `role="radio"` + `aria-checked` lets each
 *  parent radiogroup track selection state correctly. */
function PillButton({
  active, onClick, children, ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "text-left rounded-md border px-3 py-2.5 transition-colors text-[0.8125rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        active
          ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
          : "border-line text-ink-2 hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-line last:border-0">
      <span className="text-[0.8125rem] uppercase tracking-wider text-ink-muted">{k}</span>
      <span className="text-ink font-medium capitalize text-right truncate max-w-[60%]">{v}</span>
    </div>
  );
}

/**
 * Hub picker step — replaces the old tier-1-only list with a global
 * hub marketplace organised by region, with explicit pricing tiers
 * and a live cash-budget readout.
 *
 * Pricing model:
 *   $300M — Premium gateways (LHR / CDG / JFK / SFO / DXB)
 *   $200M — Tier-1 hubs
 *   $100M — Tier-2 hubs
 *    $50M — Tier-3 hubs
 *
 * Player budget = $350M total ($150M base + $200M onboarding capital).
 * Selected hub price is deducted; remaining cash funds Q1-Q2 ops. The
 * trade-off: bigger hub = bigger market but less cash to operate;
 * smaller hub = thinner market but more runway.
 *
 * Multipliers (×1.4 etc.) intentionally NOT shown — qualitative
 * "Premium gateway / Tier 1 / Tier 2 / Tier 3" labels only, matching
 * the doctrine-card style.
 */
function HubPickerStep({
  hubCode, setHubCode,
}: {
  hubCode: string;
  setHubCode: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const pickable = useMemo(() => hubPickableCities(CITIES), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.regionName.toLowerCase().includes(q),
    );
  }, [query, pickable]);
  // Group by region for the collapsed view, with premium gateways
  // pulled out into their own section first.
  const grouped = useMemo(() => {
    const premium = filtered.filter((c) => PREMIUM_HUB_CODES.has(c.code));
    const others = filtered.filter((c) => !PREMIUM_HUB_CODES.has(c.code));
    const byRegion = new Map<string, typeof others>();
    for (const c of others) {
      const list = byRegion.get(c.regionName) ?? [];
      list.push(c);
      byRegion.set(c.regionName, list);
    }
    // Sort each region by tier asc then name
    for (const list of byRegion.values()) {
      list.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return a.name.localeCompare(b.name);
      });
    }
    const regions = Array.from(byRegion.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { premium, regions };
  }, [filtered]);

  const selected = pickable.find((c) => c.code === hubCode);
  const selectedCost = selected ? hubPriceUsd(selected) : 0;
  const remainingCash = ONBOARDING_TOTAL_BUDGET_USD - selectedCost;

  return (
    <Step
      title="Pick your hub"
      sub="Your home airport. Bigger hubs win on market size; smaller hubs leave more cash to operate Q1-Q2."
    >
      {/* Live cash budget at the top — updates as the player picks. */}
      <div className="rounded-md border border-primary bg-[rgba(20,53,94,0.04)] px-4 py-3 mb-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Total budget
            </div>
            <div className="font-display text-[1.5rem] tabular text-ink leading-none mt-0.5">
              {fmtMoney(ONBOARDING_TOTAL_BUDGET_USD)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Hub cost
            </div>
            <div
              className={cn(
                "font-display text-[1.5rem] tabular leading-none mt-0.5",
                selectedCost > 0 ? "text-negative" : "text-ink-muted",
              )}
            >
              −{fmtMoney(selectedCost)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Remaining cash
            </div>
            <div className="font-display text-[1.5rem] tabular text-positive leading-none mt-0.5">
              {fmtMoney(remainingCash)}
            </div>
          </div>
        </div>
        {selected && (
          <div className="text-[0.6875rem] text-ink-2 mt-2">
            <strong className="text-ink">{selected.name}</strong> ({selected.code})
            {" · "}{hubTierLabel(selected)}
            {" · "}{selected.regionName}
          </div>
        )}
      </div>

      <Input
        placeholder="Search by airport code, city, or region…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />

      <div className="max-h-[28rem] overflow-auto space-y-4 pb-2">
        {/* Premium gateways always lead */}
        {grouped.premium.length > 0 && (
          <RegionGroup
            label="Premium gateways"
            sub="$300M · global business benchmarks"
            cities={grouped.premium}
            hubCode={hubCode}
            onPick={setHubCode}
          />
        )}
        {grouped.regions.map(([regionName, cities]) => (
          <RegionGroup
            key={regionName}
            label={regionName}
            cities={cities}
            hubCode={hubCode}
            onPick={setHubCode}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-[0.8125rem] text-ink-muted py-8 italic">
            No airports match that search.
          </div>
        )}
      </div>
    </Step>
  );
}

function RegionGroup({
  label, sub, cities, hubCode, onPick,
}: {
  label: string;
  sub?: string;
  cities: typeof CITIES;
  hubCode: string;
  onPick: (code: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
          {label}
        </div>
        {sub && (
          <div className="text-[0.625rem] text-ink-muted">{sub}</div>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label={`Hub airports — ${label}`}
        className="grid grid-cols-1 md:grid-cols-2 gap-1.5"
      >
        {cities.map((city) => {
          const active = hubCode === city.code;
          const price = hubPriceUsd(city);
          return (
            <button
              key={city.code}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${city.name} (${city.code}), ${city.regionName}, ${hubTierLabel(city)}, ${fmtMoney(price)}`}
              onClick={() => onPick(city.code)}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                active
                  ? "border-primary bg-[rgba(20,53,94,0.04)]"
                  : "border-line hover:bg-surface-hover",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[0.8125rem] text-primary">{city.code}</span>
                  <span className="font-medium text-ink text-[0.875rem] truncate">{city.name}</span>
                </div>
                <div className="text-[0.6875rem] text-ink-muted truncate">
                  {hubTierLabel(city)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="tabular font-mono text-[0.875rem] text-ink font-semibold">
                  {fmtMoney(price)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
