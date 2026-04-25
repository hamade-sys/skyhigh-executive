"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  geoOrthographic,
  geoPath,
  geoDistance,
  geoCircle,
} from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import type { City, Team } from "@/types/game";
import { cn } from "@/lib/cn";

/** Hand-picked plausible route pattern per mocked rival hub. */
const RIVAL_ROUTES: Record<string, string[]> = {
  SIN: ["HKG", "BKK", "KUL", "BOM", "SYD", "NRT"],
  LHR: ["JFK", "DXB", "CDG", "FRA", "HKG", "LAX"],
  DXB: ["LHR", "JFK", "NRT", "BOM", "CDG", "JNB"],
  NRT: ["HKG", "SIN", "LAX", "SFO", "ICN", "PVG"],
  CPH: ["ARN", "OSL", "LHR", "JFK", "FRA"],
  JNB: ["LHR", "DXB", "NBO", "CDG"],
  GRU: ["EZE", "MIA", "LIM", "JFK", "CDG"],
  HKG: ["NRT", "SIN", "BKK", "PVG", "SYD", "LAX"],
  ORD: ["JFK", "LAX", "SFO", "LHR", "CDG", "FRA"],
};
import { cityEventImpact } from "@/lib/city-events";
import { useGame } from "@/store/game";

export interface WorldMapProps {
  team: Team;
  /** Rival teams (shown as muted markers + simulated routes per PRD §3.B). */
  rivals?: Team[];
  selectedOriginCode?: string | null;
  onCityClick?: (city: City) => void;
  onCityHover?: (city: City | null) => void;
  onClearSelection?: () => void;
  className?: string;
}

const VIEW_W = 1600;
const VIEW_H = 900;

const MIN_SCALE = 240;
const MAX_SCALE = 1400;
const DEFAULT_SCALE = 380;

let worldAtlasPromise: Promise<FeatureCollection> | null = null;
function loadWorldAtlas(): Promise<FeatureCollection> {
  if (!worldAtlasPromise) {
    worldAtlasPromise = fetch(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
    )
      .then((r) => r.json())
      .then((topo: Topology) => {
        return feature(
          topo,
          topo.objects.countries,
        ) as unknown as FeatureCollection;
      });
  }
  return worldAtlasPromise;
}

function cityRadius(tier: number, hovered: boolean, scale: number): number {
  const zoomFactor = Math.sqrt(scale / DEFAULT_SCALE);
  const base = (tier === 1 ? 5 : tier === 2 ? 3.5 : tier === 3 ? 2.5 : 2) * zoomFactor;
  return hovered ? base * 1.5 : base;
}

/** Sample the great-circle between a and b into an SVG polyline path
 *  (filtered to the visible hemisphere). */
function arcPathGreatCircle(
  a: [number, number],
  b: [number, number],
  project: (lonlat: [number, number]) => [number, number] | null,
): string {
  const steps = 48;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lon = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const xy = project([lon, lat]);
    if (xy) points.push(xy);
  }
  if (points.length < 2) return "";
  return (
    "M " + points.map(([x, y]) => `${x} ${y}`).join(" L ")
  );
}

export function WorldMap({
  team,
  rivals,
  selectedOriginCode,
  onCityClick,
  onCityHover,
  onClearSelection,
  className,
}: WorldMapProps) {
  const [atlas, setAtlas] = useState<FeatureCollection | null>(null);
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [bbox, setBbox] = useState<DOMRect | null>(null);
  const currentQuarter = useGame((s) => s.currentQuarter);

  // Projection state: rotation (lambda, phi), gamma = 0; scale
  const [rotation, setRotation] = useState<[number, number]>([-10, -20]);
  const [scale, setScale] = useState<number>(DEFAULT_SCALE);

  // Dragging state
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRot: [number, number];
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    loadWorldAtlas().then(setAtlas).catch(() => setAtlas(null));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBbox(el.getBoundingClientRect());
    const obs = new ResizeObserver(() => setBbox(el.getBoundingClientRect()));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Moving dots use native <animateMotion> — no React tick required.
  // Respect reduced-motion preference by toggling once on mount.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const projection = useMemo(() => {
    return geoOrthographic()
      .translate([VIEW_W / 2, VIEW_H / 2])
      .scale(scale)
      .rotate([rotation[0], rotation[1], 0])
      .clipAngle(90);
  }, [scale, rotation]);

  const path = useMemo(() => geoPath(projection), [projection]);

  /** Project a lonlat to screen; returns null if on the far side. */
  const project = useCallback(
    (lonlat: [number, number]): [number, number] | null => {
      const xy = projection(lonlat);
      if (!xy) return null;
      return xy as [number, number];
    },
    [projection],
  );

  const activeRoutes = useMemo(
    () => team.routes.filter((r) => r.status === "active"),
    [team.routes],
  );
  const ownDestCodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeRoutes) {
      set.add(r.originCode);
      set.add(r.destCode);
    }
    return set;
  }, [activeRoutes]);

  // Sphere + graticule paths (d3-geo handles visibility via clipAngle)
  const spherePath = useMemo(() => path({ type: "Sphere" } as Parameters<typeof path>[0]) ?? "", [path]);
  const graticulePaths = useMemo(() => {
    const lines: string[] = [];
    // Parallels every 30°
    for (const lat of [-60, -30, 0, 30, 60]) {
      const coords: Array<[number, number]> = [];
      for (let lon = -180; lon <= 180; lon += 2) coords.push([lon, lat]);
      const d = path({ type: "LineString", coordinates: coords } as unknown as Parameters<typeof path>[0]);
      if (d) lines.push(d);
    }
    // Meridians every 30°
    for (let lon = -180; lon <= 180; lon += 30) {
      const coords: Array<[number, number]> = [];
      for (let lat = -90; lat <= 90; lat += 2) coords.push([lon, lat]);
      const d = path({ type: "LineString", coordinates: coords } as unknown as Parameters<typeof path>[0]);
      if (d) lines.push(d);
    }
    return lines;
  }, [path]);

  // Pointer handlers for drag-to-rotate
  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRot: rotation,
      moved: false,
    };
  }, [rotation]);

  const onPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) d.moved = true;
    if (d.moved) {
      // Sensitivity scales with scale (zoomed in = slower rotation)
      const sens = 140 / scale;
      const newLambda = d.startRot[0] + dx * sens;
      const newPhi = Math.max(-89, Math.min(89, d.startRot[1] - dy * sens));
      setRotation([newLambda, newPhi]);
    }
  }, [scale]);

  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    const d = dragRef.current;
    dragRef.current = null;
    // If the pointer didn't move, it's a click — let children handle it
    if (d && !d.moved) {
      // noop — the inner <g> click handler already fires
    }
  }, []);

  const onWheel = useCallback((e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor)));
  }, []);

  // Reset to a sensible view (double-click on sphere)
  const resetView = useCallback(() => {
    setRotation([-10, -20]);
    setScale(DEFAULT_SCALE);
  }, []);

  // Visibility check for a city: is it on the near hemisphere of current rotation?
  const isVisible = useCallback(
    (lon: number, lat: number): boolean => {
      const center: [number, number] = [-rotation[0], -rotation[1]];
      return geoDistance(center, [lon, lat]) < Math.PI / 2 - 0.05;
    },
    [rotation],
  );

  return (
    <div
      className={cn(
        "relative w-full h-full bg-[var(--map-ocean)] overflow-hidden select-none",
        className,
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={resetView}
      >
        {/* Globe sphere backdrop */}
        <defs>
          <radialGradient id="globe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="var(--map-ocean)" />
            <stop offset="100%" stopColor="var(--line-strong)" stopOpacity="0.2" />
          </radialGradient>
        </defs>
        <path d={spherePath} fill="url(#globe-glow)" stroke="var(--line-strong)" strokeWidth="0.5" strokeOpacity="0.4" />

        {/* Graticule */}
        <g stroke="var(--map-line)" strokeWidth="0.4" fill="none" opacity="0.35">
          {graticulePaths.map((d, i) => (
            <path key={i} d={d} strokeDasharray="2 5" />
          ))}
        </g>

        {/* Countries */}
        {atlas && (
          <g>
            {atlas.features.map((f, i) => {
              const d: string = path(f as Parameters<typeof path>[0]) ?? "";
              if (!d) return null;
              return (
                <path
                  key={i}
                  d={d}
                  fill="var(--map-land)"
                  stroke="var(--map-line)"
                  strokeWidth="0.5"
                  strokeOpacity="0.8"
                />
              );
            })}
          </g>
        )}

        {/* Rival routes (muted, behind own routes per PRD §3.B) */}
        {rivals && rivals.length > 0 && (
          <g fill="none" strokeLinecap="round" opacity="0.5">
            {rivals.flatMap((rv) => {
              const destinations = RIVAL_ROUTES[rv.hubCode] ?? [];
              const hub = CITIES_BY_CODE[rv.hubCode];
              if (!hub) return [];
              return destinations.flatMap((destCode) => {
                const d = CITIES_BY_CODE[destCode];
                if (!d) return [];
                const path = arcPathGreatCircle(
                  [hub.lon, hub.lat],
                  [d.lon, d.lat],
                  project,
                );
                if (!path) return [];
                return (
                  <path
                    key={`${rv.id}-${destCode}`}
                    d={path}
                    stroke={rv.color}
                    strokeWidth={0.9 * Math.sqrt(scale / DEFAULT_SCALE)}
                    strokeOpacity="0.35"
                    strokeDasharray="2 4"
                  />
                );
              });
            })}
          </g>
        )}

        {/* Rival hub markers */}
        {rivals && rivals.length > 0 && (
          <g>
            {rivals.map((rv) => {
              const hub = CITIES_BY_CODE[rv.hubCode];
              if (!hub || !isVisible(hub.lon, hub.lat)) return null;
              const xy = project([hub.lon, hub.lat]);
              if (!xy) return null;
              const r = 4 * Math.sqrt(scale / DEFAULT_SCALE);
              return (
                <g key={`rival-hub-${rv.id}`} transform={`translate(${xy[0]},${xy[1]})`}>
                  <circle r={r * 2.5} fill="none" stroke={rv.color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
                  <circle r={r} fill={rv.color} stroke="var(--surface)" strokeWidth="1.2" opacity="0.7" />
                </g>
              );
            })}
          </g>
        )}

        {/* Route arcs + native SVG animated dots (no React re-renders) */}
        <g fill="none" strokeLinecap="round">
          {activeRoutes.map((r, i) => {
            const a = CITIES_BY_CODE[r.originCode];
            const b = CITIES_BY_CODE[r.destCode];
            if (!a || !b) return null;
            const profitable = r.avgOccupancy > 0.7;
            const losing = r.avgOccupancy > 0 && r.avgOccupancy < 0.5;
            const color = profitable
              ? "var(--positive)"
              : losing
                ? "var(--negative)"
                : team.color;
            const d = arcPathGreatCircle(
              [a.lon, a.lat],
              [b.lon, b.lat],
              project,
            );
            if (!d) return null;
            const pathId = `arc-${r.id}`;
            const duration = `${8 + (i % 5) * 0.8}s`; // staggered, deterministic
            return (
              <g key={r.id}>
                <path
                  id={pathId}
                  d={d}
                  stroke={color}
                  strokeWidth={1.75 * Math.sqrt(scale / DEFAULT_SCALE)}
                  strokeOpacity="0.6"
                />
                <circle
                  r={2.4 * Math.sqrt(scale / DEFAULT_SCALE)}
                  fill={color}
                  stroke="var(--surface)"
                  strokeWidth="0.8"
                >
                  {!reducedMotion && (
                    <animateMotion
                      dur={duration}
                      repeatCount="indefinite"
                      path={d}
                    />
                  )}
                </circle>
              </g>
            );
          })}
          {/* Preview arc */}
          {selectedOriginCode && hoverCode && (() => {
            const a = CITIES_BY_CODE[selectedOriginCode];
            const b = CITIES_BY_CODE[hoverCode];
            if (!a || !b) return null;
            const d = arcPathGreatCircle(
              [a.lon, a.lat],
              [b.lon, b.lat],
              project,
            );
            return (
              <path
                d={d}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="4 6"
                strokeOpacity="0.9"
              />
            );
          })()}
        </g>

        {/* Cities */}
        <g>
          {CITIES.map((c) => {
            if (!isVisible(c.lon, c.lat)) return null;
            const xy = project([c.lon, c.lat]);
            if (!xy) return null;
            const [x, y] = xy;
            const isHub = c.code === team.hubCode;
            const isSecondaryHub = team.secondaryHubCodes?.includes(c.code) ?? false;
            const isSelected = c.code === selectedOriginCode;
            const connected = ownDestCodes.has(c.code);
            const isHovered = hoverCode === c.code;
            const r = cityRadius(c.tier, isHovered, scale);
            const showLabel =
              isHub || isSecondaryHub || c.tier === 1 || isHovered ||
              (c.tier === 2 && scale > DEFAULT_SCALE * 1.3);
            return (
              <g
                key={c.code}
                transform={`translate(${x},${y})`}
                className="cursor-pointer"
                onMouseEnter={() => {
                  setHoverCode(c.code);
                  onCityHover?.(c);
                }}
                onMouseLeave={() => {
                  setHoverCode(null);
                  onCityHover?.(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragRef.current?.moved) return; // suppress click after drag
                  onCityClick?.(c);
                }}
              >
                <circle r={14} fill="transparent" />
                {isHub && (
                  <circle className="hub-pulse" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
                )}
                {isSecondaryHub && (
                  <circle r={10} fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.5" strokeDasharray="2 3" />
                )}
                {isSelected && (
                  <>
                    <circle
                      className="city-select-pulse"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                    />
                    <circle r={8} fill="none" stroke="var(--accent)" strokeWidth="2" />
                  </>
                )}
                <circle
                  r={r}
                  fill={isHub ? "var(--primary)" : connected ? team.color : "var(--ink-2)"}
                  stroke="var(--surface)"
                  strokeWidth="1.2"
                />
                {showLabel && (
                  <text
                    y={-r - 5}
                    textAnchor="middle"
                    fontSize={c.tier === 1 ? 10 : 9}
                    fontWeight={600}
                    fontFamily="var(--font-mono)"
                    fill={isHub ? "var(--primary)" : "var(--ink)"}
                    style={{
                      paintOrder: "stroke",
                      stroke: "var(--bg)",
                      strokeWidth: 3,
                    }}
                  >
                    {c.code}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Loading placeholder */}
        {!atlas && (
          <text
            x={VIEW_W / 2}
            y={VIEW_H / 2}
            textAnchor="middle"
            fontSize={14}
            fontFamily="var(--font-sans)"
            fill="var(--ink-muted)"
          >
            Loading world atlas…
          </text>
        )}
      </svg>

      {/* Hover tooltip (ephemeral, suppressed when an origin is pinned) */}
      {!selectedOriginCode && hoverCode && bbox && (() => {
        const c = CITIES_BY_CODE[hoverCode];
        if (!c) return null;
        if (!isVisible(c.lon, c.lat)) return null;
        const xy = project([c.lon, c.lat]);
        if (!xy) return null;
        const screenX = (xy[0] / VIEW_W) * bbox.width;
        const screenY = (xy[1] / VIEW_H) * bbox.height;
        const evt = cityEventImpact(c.code, currentQuarter);
        return (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-line bg-surface/95 backdrop-blur px-3 py-2 shadow-[var(--shadow-2)] min-w-[200px]"
            style={{ left: screenX + 14, top: screenY - 40 }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="font-semibold text-ink text-[0.875rem]">{c.name}</div>
                <div className="text-[0.6875rem] text-ink-muted">
                  {c.regionName} · Lvl {c.tier}
                </div>
              </div>
              <div className="font-mono text-[0.8125rem] text-primary">{c.code}</div>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-line grid grid-cols-2 gap-1 text-[0.6875rem]">
              <span className="text-ink-muted">Tourism</span>
              <span className="tabular font-mono text-right text-ink">{c.tourism}/day</span>
              <span className="text-ink-muted">Business</span>
              <span className="tabular font-mono text-right text-ink">{c.business}/day</span>
              <span className="text-ink-muted">Event</span>
              <span className={`tabular font-mono text-right ${evt.pct > 0 ? "text-positive" : evt.pct < 0 ? "text-negative" : "text-ink-muted"}`}>
                {evt.pct === 0 ? "—" : `${evt.pct > 0 ? "+" : ""}${evt.pct}%`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Pinned origin card — persists until destination picked or cleared */}
      {selectedOriginCode && bbox && (() => {
        const c = CITIES_BY_CODE[selectedOriginCode];
        if (!c) return null;
        if (!isVisible(c.lon, c.lat)) return null;
        const xy = project([c.lon, c.lat]);
        if (!xy) return null;
        const screenX = (xy[0] / VIEW_W) * bbox.width;
        const screenY = (xy[1] / VIEW_H) * bbox.height;
        // Place card to the right of the dot; if near the right edge, flip to the left
        const flip = screenX > bbox.width - 280;
        return (
          <div
            className="absolute z-30 rounded-lg border border-line bg-surface/98 backdrop-blur-md px-4 py-3 shadow-[0_16px_40px_-12px_rgba(16,37,63,0.25)] w-[260px]"
            style={{
              left: flip ? screenX - 280 : screenX + 18,
              top: Math.max(6, Math.min(bbox.height - 220, screenY - 40)),
              animation: "city-card-in 160ms var(--ease-out-quart)",
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="font-display text-[1.125rem] text-ink leading-tight truncate">
                  {c.name}
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                  {c.regionName} · Lvl {c.tier}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[0.8125rem] font-semibold text-primary">
                  {c.code}
                </span>
                <button
                  onClick={() => onClearSelection?.()}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink"
                  aria-label="Clear origin"
                >
                  ×
                </button>
              </div>
            </div>

            {(() => {
              const evt = cityEventImpact(c.code, currentQuarter);
              return (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.6875rem] py-2 border-y border-line">
                  <span className="text-ink-muted">Tourism</span>
                  <span className="tabular font-mono text-right text-ink">{c.tourism}/day</span>
                  <span className="text-ink-muted">Business</span>
                  <span className="tabular font-mono text-right text-ink">{c.business}/day</span>
                  <span className="text-ink-muted">Event</span>
                  <span
                    className={`tabular font-mono text-right ${evt.pct > 0 ? "text-positive" : evt.pct < 0 ? "text-negative" : "text-ink-muted"}`}
                    title={evt.items.map((x) => x.headline).join(" · ") || undefined}
                  >
                    {evt.pct === 0 ? "—" : `${evt.pct > 0 ? "+" : ""}${evt.pct}%`}
                  </span>
                  <span className="text-ink-muted">Annual growth</span>
                  <span className="tabular font-mono text-right text-ink">
                    T{c.tourismGrowth >= 0 ? "+" : ""}{c.tourismGrowth.toFixed(1)}% · B{c.businessGrowth >= 0 ? "+" : ""}{c.businessGrowth.toFixed(1)}%
                  </span>
                </div>
              );
            })()}

            {c.character && (
              <p className="text-[0.75rem] text-ink-2 italic leading-snug mt-2">
                {c.character}
              </p>
            )}

            <div className="mt-3 pt-2 border-t border-line flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-accent">
                <span className="w-2 h-2 rounded-full bg-accent" />
                Origin selected
              </span>
              <span className="text-[0.6875rem] text-ink-muted">
                Click a destination city →
              </span>
            </div>
          </div>
        );
      })()}

      {/* Controls hint + legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 rounded-md border border-line bg-surface/90 backdrop-blur px-3 py-2 text-[0.75rem]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary" /> Your hub
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: team.color }} /> Your routes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-ink-2" /> 100 cities
        </span>
        <span className="hidden md:inline text-ink-muted">
          Drag to rotate · scroll to zoom · double-click to reset
        </span>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded-md border border-line bg-surface/90 backdrop-blur p-1">
        <button
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.25))}
          className="w-8 h-8 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s / 1.25))}
          className="w-8 h-8 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="w-8 h-8 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center text-[0.75rem]"
          aria-label="Reset view"
          title="Reset view"
        >
          ⌂
        </button>
      </div>
    </div>
  );
}
