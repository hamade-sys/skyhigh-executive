"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import type { City, Team, Route } from "@/types/game";
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
  /** Current campaign round — used to render a "new route" halo on
   *  any route whose openQuarter === currentQuarter so the player can
   *  see at a glance which lanes were just launched. */
  currentQuarter: number;
  selectedOriginCode?: string | null;
  onCityClick?: (city: City) => void;
  /** Double-click on a city marker — opens an airport detail popup
   *  showing slot ownership across teams, available slots, and the
   *  airport's primary hub airline. Distinct from single-click which
   *  drives route picking. */
  onCityDoubleClick?: (city: City) => void;
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

/** Compute initial bearing (degrees from north, clockwise) at point a→b
 *  on the great circle. Used to rotate the plane glyph so its nose
 *  points along the path. */
function bearingDeg(
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(aLat), φ2 = toRad(bLat);
  const Δλ = toRad(bLon - aLon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Tiny SVG plane glyph used inside the divIcon. Outlined in white so
 *  it stays legible on any basemap background. The transform-origin
 *  keeps the rotation centred on the body. */
const PLANE_SVG = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path
    d="M12 1.5 L13.6 9.5 L22 13 L22 14.7 L13.6 12.5 L13.4 18 L16 19.5 L16 21
       L12 20 L8 21 L8 19.5 L10.6 18 L10.4 12.5 L2 14.7 L2 13 L10.4 9.5 Z"
    fill="#ffffff"
    stroke="#0c1624"
    stroke-width="1"
    stroke-linejoin="round"
  />
</svg>
`;

/** Static divIcon — size + html identical for every plane, only the
 *  inline rotation transform changes per-frame. Cached at module scope
 *  so we don't allocate on every render. Two variants: default (pax)
 *  and cargo (yellow tint via class) so freight reads visually distinct. */
const planeIcon = L.divIcon({
  className: "sf-plane-marker",
  html: `<div class="sf-plane-glyph" data-plane>${PLANE_SVG}</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const cargoPlaneIcon = L.divIcon({
  className: "sf-plane-marker sf-plane-marker--cargo",
  html: `<div class="sf-plane-glyph" data-plane>${PLANE_SVG}</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/**
 * One animated plane flying back-and-forth along a great-circle path.
 * The position is updated via requestAnimationFrame and pushed straight
 * to the Leaflet marker via setLatLng — no React re-render per frame.
 *
 * Each plane has a unique phase + direction so multiple flights on
 * different routes stagger naturally rather than marching in lockstep.
 */
function FlyingPlane({
  positions,
  durationMs,
  phase,
  cargo = false,
}: {
  positions: [number, number][];
  /** Time in ms for one one-way traversal (origin → destination). */
  durationMs: number;
  /** 0..1 starting offset along the path so different planes stagger. */
  phase: number;
  /** Cargo flights render with a yellow-tinted glyph so the player
   *  can tell freight traffic from passenger traffic at any zoom. */
  cargo?: boolean;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  // Pre-compute bearings between consecutive points so the glyph nose
  // turns smoothly along the great circle without a per-frame trig hit.
  const bearings = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const [aLat, aLon] = positions[i];
      const [bLat, bLon] = positions[i + 1];
      out.push(bearingDeg(aLat, aLon, bLat, bLon));
    }
    out.push(out[out.length - 1] ?? 0);
    return out;
  }, [positions]);

  useEffect(() => {
    if (positions.length < 2) return;
    let raf = 0;
    const start = performance.now() - phase * durationMs;
    const step = () => {
      const m = markerRef.current;
      if (!m) {
        raf = requestAnimationFrame(step);
        return;
      }
      const elapsed = (performance.now() - start) / durationMs;
      // Triangle wave 0→1→0 so the plane flies one way, returns the other,
      // mirroring a real bidirectional schedule without doubling markers.
      const t = elapsed % 2;
      const forward = t < 1;
      const f = forward ? t : 2 - t;
      const idxF = f * (positions.length - 1);
      const i = Math.min(positions.length - 2, Math.floor(idxF));
      const frac = idxF - i;
      const [aLat, aLon] = positions[i];
      const [bLat, bLon] = positions[i + 1];
      const lat = aLat + (bLat - aLat) * frac;
      const lon = aLon + (bLon - aLon) * frac;
      m.setLatLng([lat, lon]);
      // Bearing flips by 180° on the return leg so the nose stays
      // pointing in the direction of travel.
      const bearing = bearings[i] + (forward ? 0 : 180);
      const el = m.getElement();
      const glyph = el?.querySelector<HTMLElement>("[data-plane]");
      if (glyph) {
        glyph.style.transform = `rotate(${bearing}deg)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [positions, durationMs, phase, bearings]);

  // Initial position = sample at phase
  const initial = useMemo(() => {
    if (positions.length < 2) return positions[0] ?? [0, 0];
    const idxF = phase * (positions.length - 1);
    const i = Math.min(positions.length - 2, Math.floor(idxF));
    const frac = idxF - i;
    const [aLat, aLon] = positions[i];
    const [bLat, bLon] = positions[i + 1];
    return [aLat + (bLat - aLat) * frac, aLon + (bLon - aLon) * frac] as [number, number];
  }, [positions, phase]);

  return (
    <Marker
      position={initial}
      icon={cargo ? cargoPlaneIcon : planeIcon}
      ref={(m) => { markerRef.current = m; }}
      // No interaction — these are decorative.
      interactive={false}
      keyboard={false}
    />
  );
}

/** Compute a per-route flight time from distance + an arbitrary scale
 *  so the plane glides at a believable speed on screen. We don't want
 *  the animation to feel realistic-slow (10h flight = 10 minutes on
 *  screen), but the relative speeds of short vs long routes should
 *  read naturally. */
function flightDurationMs(distanceKm: number, dailyFreq: number): number {
  // Faster on shorter routes, slower on long-haul. Scale by frequency
  // so a busy route's plane circles back faster than a thin one.
  const baseMs = 6_000 + Math.sqrt(distanceKm) * 80; // 6-15s typical
  const freqScale = Math.max(0.6, 1 / Math.max(0.5, Math.log10(1 + dailyFreq)));
  return Math.round(baseMs * freqScale);
}

/** Hash a route id to a stable 0..1 phase so identical routes don't
 *  start at the same point and animate in lockstep. */
function phaseFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

function MapEventBridge({
  onClickEmpty,
}: {
  onClickEmpty: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    function onClick(e: L.LeafletMouseEvent) {
      // Click on empty map (not on a marker) — clear selection.
      // Leaflet adds `.leaflet-interactive` to every clickable SVG path/circle
      // (CircleMarkers, Polylines), so checking that catches all marker clicks.
      // Also keep the legacy class checks as belt-and-braces.
      const target = e.originalEvent.target as HTMLElement;
      const tagName = target.tagName?.toLowerCase();
      const isInteractiveSvg =
        target.classList?.contains("leaflet-interactive") ||
        !!target.closest(".leaflet-interactive") ||
        tagName === "path" ||
        tagName === "circle";
      if (
        isInteractiveSvg ||
        target.closest(".leaflet-marker-icon") ||
        target.closest(".sf-city") ||
        target.closest(".sf-city-dot")
      ) {
        return;
      }
      onClickEmpty();
    }
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, onClickEmpty]);
  return null;
}

export function WorldMap({
  team,
  rivals,
  currentQuarter,
  selectedOriginCode,
  onCityClick,
  onCityDoubleClick,
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
  const pendingRoutes = team.routes.filter((r) => r.status === "pending");

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

        {/* Player route arcs — single clean line + an animated plane
            glyph traversing the great circle. Cargo routes get a
            slightly desaturated colour so they're distinguishable from
            passenger routes at a glance. */}
        {activeRoutes.map((r) => {
          const a = CITIES_BY_CODE[r.originCode];
          const b = CITIES_BY_CODE[r.destCode];
          if (!a || !b) return null;
          const profitable = r.avgOccupancy > 0.7;
          const losing = r.avgOccupancy > 0 && r.avgOccupancy < 0.5;
          // Cargo lanes get a distinct amber/yellow palette so the
          // network visibly distinguishes pax (team color / health
          // shaded) from freight at any zoom level.
          const passengerColor = profitable
            ? "#1E6B5C"  // healthy emerald
            : losing
              ? "#C23B1F"  // warning rose
              : team.color;
          const cargoColor = profitable
            ? "#E0A93B"  // amber/gold (also matches the pending-bid line)
            : losing
              ? "#C23B1F"
              : "#F2C063"; // softer yellow for at-baseline cargo
          const color = r.isCargo ? cargoColor : passengerColor;
          const positions = greatCirclePath(a.lon, a.lat, b.lon, b.lat, 64);
          const dur = flightDurationMs(r.distanceKm, r.dailyFrequency);
          const phase = phaseFromId(r.id);
          // High-frequency routes earn a second plane offset 180° in
          // phase so heavy corridors visibly carry more traffic.
          const showSecondPlane = r.dailyFrequency >= 3;
          const isNew = r.openQuarter === currentQuarter;
          return (
            <Fragment key={r.id}>
              {/* Soft halo — wider, very translucent line under the
                  main stroke. Gives long-haul routes a subtle bloom
                  without committing to a bright colour. */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: 4,
                  opacity: 0.14,
                  lineCap: "round",
                  interactive: false,
                }}
              />
              {/* "Just launched" halo — only renders this round. A
                  bright accent stroke + chunky cap so the player can
                  spot brand-new lanes against an existing dense network
                  at a glance. The classroom moment after Next Quarter. */}
              {isNew && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: "#FFB94D",
                    weight: 6,
                    opacity: 0.35,
                    lineCap: "round",
                    interactive: false,
                  }}
                />
              )}
              {/* Main stroke — thinner per user feedback. Cargo dashes
                  more sparsely so the line reads "freight schedule"
                  rather than a solid passenger corridor. */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: r.isCargo ? 1.1 : 1.5,
                  opacity: r.isCargo ? 0.7 : 0.9,
                  lineCap: "round",
                  dashArray: r.isCargo ? "1 5" : undefined,
                }}
              />
              {/* Animated flying plane(s) along the path. Cargo planes
                  get a yellow tint via className so they read as a
                  different traffic category at a glance. */}
              <FlyingPlane
                positions={positions}
                durationMs={dur}
                phase={phase}
                cargo={!!r.isCargo}
              />
              {showSecondPlane && (
                <FlyingPlane
                  positions={positions}
                  durationMs={dur}
                  phase={(phase + 0.5) % 1}
                  cargo={!!r.isCargo}
                />
              )}
            </Fragment>
          );
        })}

        {/* Pending route arcs — dashed amber to signal "awaiting auction" */}
        {pendingRoutes.map((r) => {
          const a = CITIES_BY_CODE[r.originCode];
          const b = CITIES_BY_CODE[r.destCode];
          if (!a || !b) return null;
          const positions = greatCirclePath(a.lon, a.lat, b.lon, b.lat, 64);
          return (
            <Polyline
              key={r.id}
              positions={positions}
              pathOptions={{
                color: "#E0A93B",       // amber/gold for pending
                weight: 2.2,
                opacity: 0.85,
                lineCap: "round",
                dashArray: "6 8",
              }}
            />
          );
        })}

        {/* Hub beacon — pulsing concentric rings + bright core, painted
            BELOW the regular CircleMarker so the city dot sits visually
            on top. The beacon takes its colour from the team and uses
            CSS animations defined in globals.css. */}
        {(() => {
          const hub = CITIES_BY_CODE[team.hubCode];
          if (!hub) return null;
          const beaconIcon = L.divIcon({
            className: "",
            // 36×36 stage, two pulse rings + center beacon. Inline color
            // = team brand so the beacon reads as "yours" at a glance.
            html: `
              <div style="position:relative;width:36px;height:36px;color:${team.color}">
                <span class="sf-hub-pulse"></span>
                <span class="sf-hub-pulse sf-hub-pulse--delayed"></span>
                <span class="sf-hub-beacon" style="
                  width:8px;height:8px;left:50%;top:50%;
                  transform:translate(-50%,-50%);
                  position:absolute;inset:auto;
                "></span>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          return (
            <Marker
              position={[hub.lat, hub.lon]}
              icon={beaconIcon}
              interactive={false}
              keyboard={false}
            />
          );
        })()}
        {/* Secondary-hub beacons — same pulse, dimmer + smaller. */}
        {team.secondaryHubCodes.map((code) => {
          const hub = CITIES_BY_CODE[code];
          if (!hub) return null;
          const beaconIcon = L.divIcon({
            className: "",
            html: `
              <div style="position:relative;width:28px;height:28px;color:${team.color};opacity:0.75">
                <span class="sf-hub-pulse"></span>
                <span class="sf-hub-beacon" style="
                  width:6px;height:6px;left:50%;top:50%;
                  transform:translate(-50%,-50%);
                  position:absolute;inset:auto;
                "></span>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          return (
            <Marker
              key={`sh-beacon-${code}`}
              position={[hub.lat, hub.lon]}
              icon={beaconIcon}
              interactive={false}
              keyboard={false}
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
          // colour for hubs/network. Selected cities flash YELLOW so the
          // origin pick is obvious before the route detail modal opens.
          const fillColor = isSelected
            ? "#fde047"  // amber-300 — high-contrast selection state
            : isHub || isSecondaryHub || inNetwork
              ? team.color
              : "#fef9ec";
          const fillOpacity = 1.0;
          const strokeColor = isSelected
            ? "#ca8a04"  // amber-600 — ring around the yellow fill
            : isHub || isSecondaryHub
              ? "#ffffff"
              : inNetwork
                ? "#ffffff"
                : "#1a1a1a";
          const strokeWeight = isSelected
            ? 3
            : isHub ? 2.5 : isSecondaryHub ? 2 : inNetwork ? 1.8 : 1.4;
          // Bump the radius on selection so it really pops on the map
          const finalRadius = isSelected ? Math.max(radius + 3, 9) : radius;

          // Every city shows its name; size + emphasis scales by tier and network status.
          const isNetworkAirport = isHub || isSecondaryHub || inNetwork;

          return (
            <CircleMarker
              key={c.code}
              center={[c.lat, c.lon]}
              radius={finalRadius}
              pathOptions={{
                color: strokeColor,
                fillColor,
                fillOpacity,
                weight: strokeWeight,
                className: cn("sf-city-dot", isSelected && "sf-city-selected"),
              }}
              eventHandlers={{
                click: () => onCityClick?.(c),
                dblclick: (e) => {
                  // Stop the click bubbling — Leaflet otherwise triggers
                  // the single-click handler twice before this fires.
                  if (e.originalEvent) {
                    e.originalEvent.stopPropagation();
                    e.originalEvent.preventDefault();
                  }
                  onCityDoubleClick?.(c);
                },
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
                      {flights * 7}/wk
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
        {pendingRoutes.length > 0 && (
          <span className="flex items-center gap-1.5 border-l border-line pl-3">
            <svg width="20" height="6" aria-hidden>
              <line x1="0" y1="3" x2="20" y2="3" stroke="#E0A93B" strokeWidth="2.2" strokeDasharray="6 4" />
            </svg>
            <span className="text-ink-2">Pending bid</span>
          </span>
        )}
        {activeRoutes.some((r) => r.openQuarter === currentQuarter) && (
          <span className="flex items-center gap-1.5 border-l border-line pl-3">
            <svg width="20" height="6" aria-hidden>
              <line x1="0" y1="3" x2="20" y2="3" stroke="#FFB94D" strokeWidth="5" opacity="0.5" />
            </svg>
            <span className="text-ink-2">New this round</span>
          </span>
        )}
        <span className="hidden lg:inline text-ink-muted border-l border-line pl-3">
          Drag to pan · scroll to zoom · world wraps
        </span>
      </div>
    </div>
  );
}
