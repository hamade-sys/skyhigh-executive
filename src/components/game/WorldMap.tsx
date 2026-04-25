"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import type { City, Team } from "@/types/game";
import { cn } from "@/lib/cn";

/**
 * Leaflet-based world map.
 *
 * Why Leaflet:
 *   - real satellite-style basemap (Esri WorldImagery, toned via CSS) without
 *     needing an API token
 *   - native `worldCopyJump` so panning across the antimeridian wraps
 *     infinitely — no edges, can scroll forever
 *   - widely-used coordinate system; markers + polylines fall into place
 *
 * The component preserves the same public API as the previous SVG version so
 * GameCanvas doesn't need to change.
 */

export interface WorldMapProps {
  team: Team;
  rivals?: Team[];
  selectedOriginCode?: string | null;
  onCityClick?: (city: City) => void;
  onCityHover?: (city: City | null) => void;
  onClearSelection?: () => void;
  className?: string;
}

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

/** Sample N points along a great-circle path from a→b for smooth route arcs. */
function greatCirclePath(
  aLon: number, aLat: number,
  bLon: number, bLat: number,
  steps = 64,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(aLat), λ1 = toRad(aLon);
  const φ2 = toRad(bLat), λ2 = toRad(bLon);
  const Δφ = φ2 - φ1, Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  if (c === 0) return [[aLat, aLon], [bLat, bLon]];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * c) / Math.sin(c);
    const B = Math.sin(f * c) / Math.sin(c);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    out.push([toDeg(φ), toDeg(λ)]);
  }
  return out;
}

/** Sum of daily flights touching a city across all active routes. */
function dailyFlightsByCity(team: Team) {
  const map: Record<string, number> = {};
  for (const r of team.routes) {
    if (r.status !== "active") continue;
    map[r.originCode] = (map[r.originCode] ?? 0) + r.dailyFrequency;
    map[r.destCode] = (map[r.destCode] ?? 0) + r.dailyFrequency;
  }
  return map;
}

function MapEventBridge({
  onClickEmpty,
}: {
  onClickEmpty: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    function onClick(e: L.LeafletMouseEvent) {
      // Click on empty map (not on a marker) — clear selection
      const target = e.originalEvent.target as HTMLElement;
      if (!target.closest(".leaflet-marker-icon") && !target.closest(".sf-city")) {
        onClickEmpty();
      }
    }
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, onClickEmpty]);
  return null;
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
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const flightsByCity = useMemo(() => dailyFlightsByCity(team), [team]);

  const ownNetworkCodes = useMemo(() => {
    const set = new Set<string>([team.hubCode, ...team.secondaryHubCodes]);
    for (const r of team.routes) {
      if (r.status === "active" || r.status === "suspended") {
        set.add(r.originCode);
        set.add(r.destCode);
      }
    }
    return set;
  }, [team]);

  const activeRoutes = team.routes.filter((r) => r.status === "active");

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden sf-map-container",
        className,
      )}
    >
      <MapContainer
        center={[CITIES_BY_CODE[team.hubCode]?.lat ?? 25, CITIES_BY_CODE[team.hubCode]?.lon ?? 55]}
        zoom={3}
        minZoom={2}
        maxZoom={6}
        worldCopyJump
        scrollWheelZoom
        zoomControl={false}
        style={{ width: "100%", height: "100%", background: "var(--map-ocean-deep)" }}
        attributionControl={false}
      >
        {/* Toned-down satellite tile basemap.
            No labels overlay — only our 100 cities are named on the map. */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          className="sf-tone-tile"
        />

        <MapEventBridge onClickEmpty={() => onClearSelection?.()} />

        {/* Rival routes (muted dashed) */}
        {(rivals ?? []).flatMap((rv) => {
          const dests = RIVAL_ROUTES[rv.hubCode] ?? [];
          const hub = CITIES_BY_CODE[rv.hubCode];
          if (!hub) return [];
          return dests
            .map((destCode) => {
              const d = CITIES_BY_CODE[destCode];
              if (!d) return null;
              const positions = greatCirclePath(hub.lon, hub.lat, d.lon, d.lat, 32);
              return (
                <Polyline
                  key={`r-${rv.id}-${destCode}`}
                  positions={positions}
                  pathOptions={{
                    color: rv.color,
                    weight: 0.8,
                    opacity: 0.4,
                    dashArray: "2 4",
                  }}
                />
              );
            })
            .filter(Boolean) as React.ReactElement[];
        })}

        {/* Player route arcs */}
        {activeRoutes.map((r) => {
          const a = CITIES_BY_CODE[r.originCode];
          const b = CITIES_BY_CODE[r.destCode];
          if (!a || !b) return null;
          const profitable = r.avgOccupancy > 0.7;
          const losing = r.avgOccupancy > 0 && r.avgOccupancy < 0.5;
          const color = profitable
            ? "#1E6B5C"
            : losing
              ? "#C23B1F"
              : team.color;
          const positions = greatCirclePath(a.lon, a.lat, b.lon, b.lat, 64);
          return (
            <Polyline
              key={r.id}
              positions={positions}
              pathOptions={{
                color,
                weight: 2.5,
                opacity: 0.85,
                lineCap: "round",
              }}
            />
          );
        })}

        {/* Preview arc while routing */}
        {selectedOriginCode && hoverCode && hoverCode !== selectedOriginCode && (() => {
          const a = CITIES_BY_CODE[selectedOriginCode];
          const b = CITIES_BY_CODE[hoverCode];
          if (!a || !b) return null;
          return (
            <Polyline
              positions={greatCirclePath(a.lon, a.lat, b.lon, b.lat, 48)}
              pathOptions={{
                color: "#D14A2E",
                weight: 2,
                opacity: 0.9,
                dashArray: "5 6",
              }}
            />
          );
        })()}

        {/* Cities */}
        {CITIES.map((c) => {
          const isHub = c.code === team.hubCode;
          const isSecondaryHub = team.secondaryHubCodes.includes(c.code);
          const inNetwork = ownNetworkCodes.has(c.code);
          const isSelected = c.code === selectedOriginCode;
          const flights = flightsByCity[c.code] ?? 0;

          // Visual sizing — bumped so dots pop against the satellite imagery
          const radius = isHub
            ? 11
            : isSecondaryHub
              ? 9
              : inNetwork
                ? 7.5
                : c.tier === 1
                  ? 6
                  : c.tier === 2
                    ? 4.5
                    : c.tier === 3
                      ? 3.5
                      : 3;

          // Cool warm-white for unconnected cities so they're clearly visible
          // on top of the satellite imagery without competing with the team
          // colour for hubs/network.
          const fillColor = isHub || isSecondaryHub || inNetwork ? team.color : "#fef9ec";
          const fillOpacity = 1.0;
          const strokeColor = isHub || isSecondaryHub
            ? "#ffffff"
            : inNetwork
              ? "#ffffff"
              : "#1a1a1a";
          const strokeWeight = isHub ? 2.5 : isSecondaryHub ? 2 : inNetwork ? 1.8 : 1.4;

          // Every city shows its name; size + emphasis scales by tier and network status.
          const isNetworkAirport = isHub || isSecondaryHub || inNetwork;

          return (
            <CircleMarker
              key={c.code}
              center={[c.lat, c.lon]}
              radius={radius}
              pathOptions={{
                color: strokeColor,
                fillColor,
                fillOpacity,
                weight: strokeWeight,
                className: "sf-city-dot",
              }}
              eventHandlers={{
                click: () => onCityClick?.(c),
                mouseover: () => {
                  setHoverCode(c.code);
                  onCityHover?.(c);
                },
                mouseout: () => {
                  setHoverCode(null);
                  onCityHover?.(null);
                },
              }}
              className="sf-city"
            >
              {/* Selection ring (orange) — Leaflet doesn't expose ring directly,
                  use Tooltip permanent class as visual hint */}
              <Tooltip
                permanent
                direction="bottom"
                offset={[0, isHub ? 4 : 2]}
                className={cn(
                  "sf-city-tt",
                  // Tier-aware class drives font-size + weight from CSS
                  isNetworkAirport
                    ? "sf-city-tt-network"
                    : `sf-city-tt-tier-${c.tier}`,
                )}
                opacity={1}
              >
                <div className="sf-city-label">
                  {isHub && (
                    <span
                      className="sf-hub-pill"
                      style={{ background: team.color }}
                    >
                      HUB
                    </span>
                  )}
                  {isSecondaryHub && !isHub && (
                    <span
                      className="sf-hub-pill"
                      style={{
                        background: "var(--bg)",
                        color: team.color,
                        border: `1px dashed ${team.color}`,
                      }}
                    >
                      HUB·2
                    </span>
                  )}
                  <span className="sf-city-name">{c.name}</span>
                  {flights > 0 && (
                    <span className="sf-flights">
                      {flights}/day
                    </span>
                  )}
                  {isSelected && <span className="sf-selected-dot" />}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Rival hub markers */}
        {(rivals ?? []).map((rv) => {
          const hub = CITIES_BY_CODE[rv.hubCode];
          if (!hub) return null;
          return (
            <CircleMarker
              key={`rv-hub-${rv.id}`}
              center={[hub.lat, hub.lon]}
              radius={5}
              pathOptions={{
                color: "white",
                weight: 1,
                fillColor: rv.color,
                fillOpacity: 0.7,
                dashArray: "2 2",
              }}
            />
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[400] flex items-center gap-3 rounded-md border border-line bg-surface/90 backdrop-blur px-3 py-2 text-[0.75rem] pointer-events-none">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-white" style={{ background: team.color }} />
          <span className="text-ink font-medium">Hub</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: team.color }} />
          <span className="text-ink-2">Network</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-muted" />
          <span className="text-ink-2">Cities</span>
        </span>
        <span className="hidden lg:inline text-ink-muted border-l border-line pl-3">
          Drag to pan · scroll to zoom · world wraps
        </span>
      </div>
    </div>
  );
}
