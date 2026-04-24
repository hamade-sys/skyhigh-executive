"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import type { City, Team } from "@/types/game";
import { cn } from "@/lib/cn";

export interface WorldMapProps {
  team: Team;
  selectedOriginCode?: string | null;
  onCityClick?: (city: City) => void;
  onCityHover?: (city: City | null) => void;
  className?: string;
}

const VIEW_W = 1600;
const VIEW_H = 820;

// Cache the world atlas fetch across mounts
let worldAtlasPromise: Promise<FeatureCollection> | null = null;
function loadWorldAtlas(): Promise<FeatureCollection> {
  if (!worldAtlasPromise) {
    worldAtlasPromise = fetch(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
    )
      .then((r) => r.json())
      .then((topo: Topology) => {
        const collection = feature(topo, topo.objects.countries) as unknown as FeatureCollection;
        return collection;
      });
  }
  return worldAtlasPromise;
}

function cityRadius(tier: number, hovered: boolean): number {
  const base = tier === 1 ? 5.5 : tier === 2 ? 4 : tier === 3 ? 3 : 2.2;
  return hovered ? base * 1.5 : base;
}

/** Great-circle-ish arc as quadratic bezier lifted toward the pole. */
function arcPath(a: [number, number], b: [number, number]): string {
  const [ax, ay] = a;
  const [bx, by] = b;
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const chord = Math.hypot(bx - ax, by - ay);
  const lift = Math.min(120, chord * 0.18);
  return `M ${ax} ${ay} Q ${midX} ${midY - lift} ${bx} ${by}`;
}

export function WorldMap({
  team,
  selectedOriginCode,
  onCityClick,
  onCityHover,
  className,
}: WorldMapProps) {
  const [atlas, setAtlas] = useState<FeatureCollection | null>(null);
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [bbox, setBbox] = useState<DOMRect | null>(null);

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

  const projection = useMemo<GeoProjection>(() => {
    return geoNaturalEarth1()
      .scale(275)
      .translate([VIEW_W / 2, VIEW_H / 2 + 10]);
  }, []);

  const path = useMemo(() => geoPath(projection), [projection]);

  /** Project a city to view coords. */
  const proj = (lon: number, lat: number): [number, number] => {
    const xy = projection([lon, lat]);
    return xy ? (xy as [number, number]) : [0, 0];
  };

  const activeRoutes = team.routes.filter((r) => r.status === "active");
  const ownDestCodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeRoutes) {
      set.add(r.originCode);
      set.add(r.destCode);
    }
    return set;
  }, [activeRoutes]);

  return (
    <div
      className={cn(
        "relative w-full h-full bg-[var(--map-ocean)] overflow-hidden",
        className,
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Graticule (meridians + parallels at 30°) */}
        <g stroke="var(--map-line)" strokeWidth="0.4" fill="none" opacity="0.35">
          {[-60, -30, 0, 30, 60].map((lat) => {
            const d: string = path({
              type: "LineString",
              coordinates: Array.from({ length: 361 }, (_, i) => [
                i - 180,
                lat,
              ] as [number, number]),
            } as unknown as Parameters<typeof path>[0]) ?? "";
            return (
              <path
                key={`lat-${lat}`}
                d={d}
                strokeDasharray={lat === 0 ? "0" : "2 5"}
              />
            );
          })}
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
            const d: string = path({
              type: "LineString",
              coordinates: Array.from({ length: 181 }, (_, i) => [
                lon,
                i - 90,
              ] as [number, number]),
            } as unknown as Parameters<typeof path>[0]) ?? "";
            return <path key={`lon-${lon}`} d={d} strokeDasharray="2 5" />;
          })}
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
                  strokeWidth="0.4"
                  strokeOpacity="0.8"
                />
              );
            })}
          </g>
        )}

        {/* Route arcs */}
        <g fill="none" strokeLinecap="round">
          {activeRoutes.map((r) => {
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
            return (
              <path
                key={r.id}
                d={arcPath(proj(a.lon, a.lat), proj(b.lon, b.lat))}
                stroke={color}
                strokeWidth="2"
                strokeOpacity="0.75"
              />
            );
          })}
          {selectedOriginCode && hoverCode && (() => {
            const a = CITIES_BY_CODE[selectedOriginCode];
            const b = CITIES_BY_CODE[hoverCode];
            if (!a || !b) return null;
            return (
              <path
                d={arcPath(proj(a.lon, a.lat), proj(b.lon, b.lat))}
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
            const [x, y] = proj(c.lon, c.lat);
            const isHub = c.code === team.hubCode;
            const isSelected = c.code === selectedOriginCode;
            const connected = ownDestCodes.has(c.code);
            const isHovered = hoverCode === c.code;
            const r = cityRadius(c.tier, isHovered);
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
                onClick={() => onCityClick?.(c)}
              >
                {/* Invisible enlarged hit target */}
                <circle r={12} fill="transparent" />
                {isHub && (
                  <circle r={12} fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.55" />
                )}
                {isSelected && (
                  <circle r={11} fill="none" stroke="var(--accent)" strokeWidth="2" />
                )}
                <circle
                  r={r}
                  fill={isHub ? "var(--primary)" : connected ? team.color : "var(--ink-2)"}
                  stroke="var(--surface)"
                  strokeWidth="1.2"
                />
                {(isHub || c.tier === 1 || isHovered) && (
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

      {/* Tooltip */}
      {hoverCode && bbox && (() => {
        const c = CITIES_BY_CODE[hoverCode];
        if (!c) return null;
        const [px, py] = proj(c.lon, c.lat);
        const screenX = (px / VIEW_W) * bbox.width;
        const screenY = (py / VIEW_H) * bbox.height;
        return (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-line bg-surface/95 backdrop-blur px-3 py-2 shadow-[var(--shadow-2)] min-w-[200px]"
            style={{ left: screenX + 14, top: screenY - 40 }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="font-semibold text-ink text-[0.875rem]">{c.name}</div>
                <div className="text-[0.6875rem] text-ink-muted">
                  {c.regionName} · Tier {c.tier}
                </div>
              </div>
              <div className="font-mono text-[0.8125rem] text-primary">{c.code}</div>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-line grid grid-cols-2 gap-1 text-[0.6875rem]">
              <span className="text-ink-muted">Tourism</span>
              <span className="tabular font-mono text-right text-ink">{c.tourism}/day</span>
              <span className="text-ink-muted">Business</span>
              <span className="tabular font-mono text-right text-ink">{c.business}/day</span>
              <span className="text-ink-muted">Amplifier</span>
              <span className="tabular font-mono text-right text-ink">×{c.amplifier.toFixed(1)}</span>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 rounded-md border border-line bg-surface/90 backdrop-blur px-3 py-2 text-[0.75rem]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary" /> Your hub
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: team.color }} />{" "}
          Your routes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-ink-2" /> 100 cities
        </span>
      </div>
    </div>
  );
}
