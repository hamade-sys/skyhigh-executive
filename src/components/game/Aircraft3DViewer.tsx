"use client";

/**
 * Interactive 3-D aircraft viewer — v3 "realistic procedural"
 *
 * Every aircraft is generated from REAL dimensions (length, wingspan,
 * fuselage diameter, engine count/placement) so an A380 is visibly a
 * double-deck giant, a 747 has its hump, a CRJ has tail engines and a
 * T-tail, an ATR is a high-wing turboprop with spinning props, and the
 * Boom Overture is a needle-nosed delta.
 *
 * Geometry quality:
 *  - Fuselage: LatheGeometry with a smooth curved profile (round nose,
 *    constant section, tapered upswept tail) — no visible cylinder caps.
 *  - Wings/fin/stabs: lofted airfoil sections (rounded leading edge,
 *    sharp trailing edge) with real sweep, taper and dihedral.
 *  - Engines: profiled nacelles with inlet lip, dark fan disc, spinner
 *    cone and pylon.
 *  - Passenger windows strip + cockpit windscreen; freighters get none.
 *  - In-flight pose (gear up) over a soft contact shadow.
 *
 * A real GLB in /public/plane-models/<id>.glb (mapped in
 * aircraft-models.ts) always takes precedence over the procedural mesh.
 */

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Html,
  PerspectiveCamera,
  ContactShadows,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import { planeModelPath } from "@/lib/aircraft-models";

/* ───────────────────────── Per-aircraft real dimensions ─────────────────── */

interface Dim {
  len: number;   // overall length (m)
  span: number;  // wingspan (m)
  dia: number;   // fuselage diameter (m)
  eng: 2 | 4;
  sweep: number; // wing quarter-chord sweep (deg)
  wing?: "low" | "high";
  tailEng?: boolean;   // engines on aft fuselage (CRJ)
  tTail?: boolean;
  props?: boolean;     // turboprop
  hump?: boolean;      // 747 upper deck
  doubleDeck?: boolean;// A380 ovoid full-length double deck
  delta?: boolean;     // Boom Overture
  bigEng?: boolean;    // neo / MAX / widebody-style large fans
}

const D = (
  len: number, span: number, dia: number, eng: 2 | 4, sweep: number,
  extra: Partial<Dim> = {},
): Dim => ({ len, span, dia, eng, sweep, ...extra });

const DIMS: Record<string, Dim> = {
  // Airbus narrow
  "A319":        D(33.8, 35.8, 3.95, 2, 25),
  "A320":        D(37.6, 35.8, 3.95, 2, 25),
  "A321":        D(44.5, 35.8, 3.95, 2, 25),
  "A319neo":     D(33.8, 35.8, 3.95, 2, 25, { bigEng: true }),
  "A320neo":     D(37.6, 35.8, 3.95, 2, 25, { bigEng: true }),
  "A321neo":     D(44.5, 35.8, 3.95, 2, 25, { bigEng: true }),
  "A321XLR":     D(44.5, 35.8, 3.95, 2, 25, { bigEng: true }),
  "A321P2F":     D(44.5, 35.8, 3.95, 2, 25),
  "A220-300":    D(38.7, 35.1, 3.70, 2, 25, { bigEng: true }),
  "A220-500":    D(42.0, 35.1, 3.70, 2, 25, { bigEng: true }),
  "A220-500F":   D(42.0, 35.1, 3.70, 2, 25, { bigEng: true }),
  // Airbus wide
  "A300-600F":   D(54.1, 44.8, 5.64, 2, 28),
  "A330-200":    D(58.8, 60.3, 5.64, 2, 30),
  "A330-300":    D(63.7, 60.3, 5.64, 2, 30),
  "A330-200F":   D(58.8, 60.3, 5.64, 2, 30),
  "A330-300P2F": D(63.7, 60.3, 5.64, 2, 30),
  "A330-900neo": D(63.7, 64.0, 5.64, 2, 30, { bigEng: true }),
  "A350-900":    D(66.8, 64.8, 5.96, 2, 32, { bigEng: true }),
  "A350-1000":   D(73.8, 64.8, 5.96, 2, 32, { bigEng: true }),
  "A380-800":    D(72.7, 79.8, 7.14, 4, 33, { doubleDeck: true }),
  "A380F":       D(72.7, 79.8, 7.14, 4, 33, { doubleDeck: true }),
  // Boeing narrow
  "B737-300":    D(33.4, 28.9, 3.76, 2, 25),
  "B737-400":    D(36.4, 28.9, 3.76, 2, 25),
  "B737-500":    D(31.0, 28.9, 3.76, 2, 25),
  "B737-600":    D(31.2, 34.3, 3.76, 2, 25),
  "B737-700":    D(33.6, 34.3, 3.76, 2, 25),
  "B737-800":    D(39.5, 34.3, 3.76, 2, 25),
  "B737-900":    D(42.1, 34.3, 3.76, 2, 25),
  "B737-300F":   D(33.4, 28.9, 3.76, 2, 25),
  "B737-800BCF": D(39.5, 34.3, 3.76, 2, 25),
  "B737-MAX-8":  D(39.5, 35.9, 3.76, 2, 25, { bigEng: true }),
  "B737-MAX-9":  D(42.2, 35.9, 3.76, 2, 25, { bigEng: true }),
  "B737-MAX-10": D(43.8, 35.9, 3.76, 2, 25, { bigEng: true }),
  "B757-200":    D(47.3, 38.0, 3.76, 2, 25),
  "B757-200F":   D(47.3, 38.0, 3.76, 2, 25),
  "B797":        D(43.0, 45.0, 4.60, 2, 30, { bigEng: true }),
  "B797F":       D(43.0, 45.0, 4.60, 2, 30, { bigEng: true }),
  // Boeing wide
  "B767-300ER":  D(54.9, 47.6, 5.03, 2, 31),
  "B767-300F":   D(54.9, 47.6, 5.03, 2, 31),
  "B777-200":    D(63.7, 60.9, 6.20, 2, 31, { bigEng: true }),
  "B777-200ER":  D(63.7, 60.9, 6.20, 2, 31, { bigEng: true }),
  "B777-200LR":  D(63.7, 64.8, 6.20, 2, 31, { bigEng: true }),
  "B777-300ER":  D(73.9, 64.8, 6.20, 2, 31, { bigEng: true }),
  "B777F":       D(63.7, 64.8, 6.20, 2, 31, { bigEng: true }),
  "B777X-8":     D(69.8, 71.8, 6.20, 2, 33, { bigEng: true }),
  "B777X-9":     D(76.7, 71.8, 6.20, 2, 33, { bigEng: true }),
  "B777-8F":     D(70.9, 71.8, 6.20, 2, 33, { bigEng: true }),
  "B787-8":      D(56.7, 60.1, 5.77, 2, 32, { bigEng: true }),
  "B787-9":      D(62.8, 60.1, 5.77, 2, 32, { bigEng: true }),
  "B787-10":     D(68.3, 60.1, 5.77, 2, 32, { bigEng: true }),
  "B747-400":    D(70.7, 64.4, 6.50, 4, 37, { hump: true }),
  "B747-400F":   D(70.7, 64.4, 6.50, 4, 37, { hump: true }),
  "B747-8":      D(76.3, 68.4, 6.50, 4, 37, { hump: true }),
  "B747-8F":     D(76.3, 68.4, 6.50, 4, 37, { hump: true }),
  // Embraer
  "E170":        D(29.9, 26.0, 3.00, 2, 23),
  "E175":        D(31.7, 28.7, 3.00, 2, 23),
  "E190":        D(36.2, 28.7, 3.00, 2, 23),
  "E195":        D(38.7, 28.7, 3.00, 2, 23),
  "E175-E2":     D(32.4, 31.0, 3.00, 2, 24, { bigEng: true }),
  "E190-E2":     D(36.2, 33.7, 3.00, 2, 24, { bigEng: true }),
  "E195-E2":     D(41.5, 35.1, 3.00, 2, 24, { bigEng: true }),
  // Bombardier
  "CRJ-700":     D(32.3, 23.2, 2.70, 2, 26, { tailEng: true, tTail: true }),
  "CRJ-900":     D(36.2, 24.9, 2.70, 2, 26, { tailEng: true, tTail: true }),
  "Dash-8-400":  D(32.8, 28.4, 2.70, 2, 4,  { props: true, wing: "high", tTail: true }),
  // ATR
  "ATR-72-500":  D(27.2, 27.1, 2.80, 2, 3,  { props: true, wing: "high", tTail: true }),
  "ATR-72-600":  D(27.2, 27.1, 2.80, 2, 3,  { props: true, wing: "high", tTail: true }),
  "ATR-72-600F": D(27.2, 27.1, 2.80, 2, 3,  { props: true, wing: "high", tTail: true }),
  "ATR-EVO":     D(27.2, 27.1, 2.80, 2, 3,  { props: true, wing: "high", tTail: true }),
  // COMAC
  "C919":        D(38.9, 35.8, 3.96, 2, 25, { bigEng: true }),
  // Boom
  "BoomO":       D(61.0, 32.0, 3.20, 4, 55, { delta: true }),
};

const FALLBACK_DIM: Dim = D(38, 34, 3.8, 2, 25);

const isFreighter = (id: string) => /(\dF|F)$|P2F|BCF/.test(id);

/* ───────────────────────── Materials ────────────────────────────────────── */

function useMats() {
  return useMemo(() => {
    const fuselage = new THREE.MeshStandardMaterial({
      color: "#f2f5f8", metalness: 0.25, roughness: 0.32,
      envMapIntensity: 0.9,
    });
    const belly = new THREE.MeshStandardMaterial({
      color: "#cfd6dd", metalness: 0.35, roughness: 0.30,
    });
    const wing = new THREE.MeshStandardMaterial({
      color: "#dfe5ea", metalness: 0.30, roughness: 0.34,
      side: THREE.DoubleSide, envMapIntensity: 0.8,
    });
    const nacelle = new THREE.MeshStandardMaterial({
      color: "#aeb8c2", metalness: 0.75, roughness: 0.22,
      envMapIntensity: 1.1,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: "#10161d", metalness: 0.1, roughness: 0.35,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: "#16273a", metalness: 0.2, roughness: 0.08,
      envMapIntensity: 1.4,
    });
    const blade = new THREE.MeshStandardMaterial({
      color: "#3c444c", metalness: 0.5, roughness: 0.4,
      side: THREE.DoubleSide,
    });
    return { fuselage, belly, wing, nacelle, dark, glass, blade };
  }, []);
}
type Mats = ReturnType<typeof useMats>;

/* ───────────────────────── Fuselage (smooth lathe) ──────────────────────── */

function buildFuselageGeo(d: Dim, S: number): THREE.BufferGeometry {
  const len = d.len * S;
  const r   = (d.dia * S) / 2;
  // Profile from tail tip (t=0) to nose tip (t=1).
  const pts: THREE.Vector2[] = [];
  const N = 48;
  // For supersonic: long needle nose + slim body.
  const noseFrac = d.delta ? 0.30 : 0.14;  // fraction of length that is nose
  const tailFrac = d.delta ? 0.10 : 0.16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let radius: number;
    if (t < tailFrac) {
      // tail cone: smooth power curve from a small tip
      const u = t / tailFrac;
      radius = r * (0.06 + 0.94 * Math.pow(u, 0.72));
    } else if (t > 1 - noseFrac) {
      // nose: superellipse rounding
      const u = (1 - t) / noseFrac; // 1 at body, 0 at tip
      radius = r * Math.pow(Math.max(u, 0), d.delta ? 0.9 : 0.52);
    } else {
      radius = r;
    }
    pts.push(new THREE.Vector2(Math.max(radius, 0.001), t * len));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.translate(0, -len / 2, 0);
  geo.rotateX(Math.PI / 2);          // axis → Z, nose at +Z
  // Upswept tail: lift the underside of the rear fuselage.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const tailStart = -len * 0.24;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < tailStart) {
      const u = Math.min((tailStart - z) / (len * 0.26), 1);
      pos.setY(i, pos.getY(i) + Math.pow(u, 1.6) * r * 0.55);
    }
  }
  if (d.doubleDeck) geo.scale(1, 1.16, 1); // taller ovoid section
  geo.computeVertexNormals();
  return geo;
}

/* ───────────────────────── Airfoil loft (wings, fin, stabs) ─────────────── */

// Closed airfoil outline, unit chord. x: 0=LE → 1=TE. y: thickness.
const AIRFOIL: [number, number][] = [
  [1.00,  0.000], [0.80,  0.022], [0.60,  0.042], [0.40,  0.056],
  [0.25,  0.058], [0.12,  0.048], [0.05,  0.032], [0.00,  0.000],
  [0.05, -0.020], [0.12, -0.028], [0.25, -0.032], [0.40, -0.030],
  [0.60, -0.022], [0.80, -0.010],
];

interface LoftStation {
  // Origin of the section's leading edge in 3-D, plus chord & thickness.
  le: THREE.Vector3;
  chord: number;
  thick: number;     // thickness multiplier
  spanDir: THREE.Vector3; // not used for placement; kept for clarity
}

/**
 * Lofts the airfoil through 2+ stations. The airfoil plane:
 * chordwise → -spanAxisCross (z for wings), thickness → perpendicular.
 * For a horizontal wing: chord runs along -Z from the LE, thickness +Y.
 * For a vertical fin: chord runs along -Z, thickness +X.
 */
function loftAirfoil(
  stations: { le: THREE.Vector3; chord: number; thick: number }[],
  vertical = false,
): THREE.BufferGeometry {
  const n = AIRFOIL.length;
  const verts: number[] = [];
  for (const st of stations) {
    for (const [cx, cy] of AIRFOIL) {
      const chordOff = -cx * st.chord;             // along -Z
      const thickOff = cy * st.chord * st.thick * 3.4;
      if (vertical) {
        verts.push(st.le.x + thickOff, st.le.y, st.le.z + chordOff);
      } else {
        verts.push(st.le.x, st.le.y + thickOff, st.le.z + chordOff);
      }
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < stations.length - 1; s++) {
    const a = s * n, b = (s + 1) * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(a + i, b + i, a + j, a + j, b + i, b + j);
    }
  }
  // Tip cap — fan from vertex 0 of the tip section
  const last = (stations.length - 1) * n;
  for (let i = 1; i < n - 1; i++) {
    idx.push(last, last + i, last + i + 1);
  }
  // Root cap
  for (let i = 1; i < n - 1; i++) {
    idx.push(0, i + 1, i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ───────────────────────── Wing assembly ────────────────────────────────── */

function buildWingGeos(d: Dim, S: number) {
  const len = d.len * S;
  const half = (d.span * S) / 2;
  const r = (d.dia * S) / 2;
  const sweepRad = (d.sweep * Math.PI) / 180;

  const wingY = d.wing === "high" ? r * 0.62 : -r * 0.42;
  const dihedral = d.wing === "high" ? -0.035 : (d.props ? 0.02 : 0.085);

  const rootChord = d.delta ? len * 0.46 : len * (d.props ? 0.13 : 0.155);
  const tipChord  = d.delta ? rootChord * 0.06 : rootChord * 0.28;
  const rootLEz   = d.delta ? len * 0.17 : len * 0.085 + rootChord * 0.5;
  const sweepBack = d.delta
    ? len * 0.40
    : Math.tan(sweepRad) * half * 0.92;

  const mkSide = (side: 1 | -1) => {
    const stations = [
      { le: new THREE.Vector3(side * r * 0.55, wingY, rootLEz), chord: rootChord, thick: 1.0 },
      {
        le: new THREE.Vector3(
          side * (r * 0.55 + (half - r * 0.55) * 0.45),
          wingY + dihedral * half * 0.45,
          rootLEz - sweepBack * 0.45 - (rootChord - tipChord) * 0.18,
        ),
        chord: rootChord - (rootChord - tipChord) * 0.5,
        thick: 0.8,
      },
      {
        le: new THREE.Vector3(
          side * half,
          wingY + dihedral * half,
          rootLEz - sweepBack,
        ),
        chord: tipChord,
        thick: 0.55,
      },
    ];
    return loftAirfoil(stations);
  };

  // Winglet (skip props & delta)
  const mkWinglet = (side: 1 | -1) => {
    const tipLE = new THREE.Vector3(side * half, wingY + dihedral * half, rootLEz - sweepBack);
    const h = half * 0.07;
    const stations = [
      { le: tipLE.clone(), chord: tipChord * 0.9, thick: 0.4 },
      {
        le: new THREE.Vector3(
          tipLE.x + side * h * 0.35,
          tipLE.y + h,
          tipLE.z - tipChord * 0.35,
        ),
        chord: tipChord * 0.42,
        thick: 0.3,
      },
    ];
    return loftAirfoil(stations);
  };

  return {
    left: mkSide(-1), right: mkSide(1),
    wingletL: d.props || d.delta ? null : mkWinglet(-1),
    wingletR: d.props || d.delta ? null : mkWinglet(1),
    wingY, rootLEz, sweepBack, rootChord, tipChord, half,
  };
}

function buildTailGeos(d: Dim, S: number) {
  const len = d.len * S;
  const r = (d.dia * S) / 2;
  const tailZ = -len * 0.40;

  // Vertical fin
  const finH = len * (d.delta ? 0.10 : 0.155);
  const finRoot = len * 0.155;
  const finTip = finRoot * 0.42;
  const finSweep = finRoot * 0.78;
  const finBaseY = d.doubleDeck ? r * 1.05 : r * 0.75;
  const fin = loftAirfoil(
    [
      { le: new THREE.Vector3(0, finBaseY, tailZ + finRoot * 0.85), chord: finRoot, thick: 0.55 },
      { le: new THREE.Vector3(0, finBaseY + finH, tailZ + finRoot * 0.85 - finSweep), chord: finTip, thick: 0.4 },
    ],
    true,
  );

  // Horizontal stabilizers
  let stabs: THREE.BufferGeometry | null = null;
  if (!d.delta) {
    const stHalf = (d.span * S) * 0.19;
    const stRoot = len * 0.085;
    const stTip = stRoot * 0.45;
    const stSweep = stRoot * 0.9;
    const stY = d.tTail ? finBaseY + finH * 0.94 : r * 0.30;
    const stZ = d.tTail ? tailZ + finRoot * 0.85 - finSweep + stRoot * 0.4 : tailZ + stRoot * 0.7;
    const mk = (side: 1 | -1) =>
      loftAirfoil([
        { le: new THREE.Vector3(side * 0.02, stY, stZ), chord: stRoot, thick: 0.5 },
        { le: new THREE.Vector3(side * stHalf, stY + 0.02 * stHalf, stZ - stSweep), chord: stTip, thick: 0.35 },
      ]);
    const l = mk(-1), rg = mk(1);
    // merge manually
    stabs = mergeGeos([l, rg]);
  }
  return { fin, stabs };
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Minimal merge (positions + index)
  let vCount = 0;
  const verts: number[] = [];
  const idx: number[] = [];
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const gi = g.index!;
    for (let i = 0; i < p.count; i++) verts.push(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vCount);
    vCount += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/* ───────────────────────── Engine nacelle ───────────────────────────────── */

function buildNacelleGeo(R: number, L: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.78, 0.00], [1.00, 0.06], [1.04, 0.16], [1.02, 0.40],
    [0.95, 0.66], [0.80, 0.86], [0.55, 1.00],
  ];
  for (const [pr, pz] of prof) pts.push(new THREE.Vector2(pr * R, pz * L));
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.translate(0, -L / 2, 0);
  geo.rotateX(-Math.PI / 2); // open end (inlet) faces +Z
  geo.computeVertexNormals();
  return geo;
}

function Engine({ pos, R, L, mats }: { pos: [number, number, number]; R: number; L: number; mats: Mats }) {
  const nacelle = useMemo(() => buildNacelleGeo(R, L), [R, L]);
  return (
    <group position={pos}>
      <mesh geometry={nacelle} material={mats.nacelle} />
      {/* fan disc */}
      <mesh position={[0, 0, L * 0.42]}>
        <circleGeometry args={[R * 0.94, 24]} />
        <meshStandardMaterial color="#14181d" roughness={0.5} />
      </mesh>
      {/* spinner */}
      <mesh position={[0, 0, L * 0.46]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[R * 0.22, R * 0.5, 16]} />
        <meshStandardMaterial color="#5a626a" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* exhaust cone */}
      <mesh position={[0, 0, -L * 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[R * 0.34, R * 0.8, 16]} />
        <meshStandardMaterial color="#6e767e" metalness={0.85} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── Propeller ────────────────────────────────────── */

function Propeller({ pos, R, mats }: { pos: [number, number, number]; R: number; mats: Mats }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 14; });
  const blades = 6;
  return (
    <group position={pos}>
      {/* engine cowl */}
      <mesh position={[0, 0, -R * 1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[R * 0.42, R * 0.34, R * 2.2, 18]} />
        <primitive object={mats.nacelle} attach="material" />
      </mesh>
      <group ref={ref}>
        {Array.from({ length: blades }, (_, i) => (
          <mesh key={i} rotation={[0, 0, (i / blades) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.035 * R * 10, R * 2.0, 0.012 * R * 10]} />
            <primitive object={mats.blade} attach="material" />
          </mesh>
        ))}
        {/* blur disc */}
        <mesh>
          <circleGeometry args={[R, 28]} />
          <meshBasicMaterial color="#8a929a" transparent opacity={0.10} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* spinner */}
      <mesh position={[0, 0, R * 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[R * 0.16, R * 0.42, 14]} />
        <meshStandardMaterial color="#444b52" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── Aircraft assembly ────────────────────────────── */

function ProceduralAircraft({ specId }: { specId: string }) {
  const d = DIMS[specId] ?? FALLBACK_DIM;
  const mats = useMats();
  const groupRef = useRef<THREE.Group>(null);
  const grabbed = useRef(false);

  // Normalize: longest dimension → ~4.4 world units
  const S = 4.4 / Math.max(d.len, d.span);
  const len = d.len * S;
  const r = (d.dia * S) / 2;

  const fuselage = useMemo(() => buildFuselageGeo(d, S), [d, S]);
  const wings = useMemo(() => buildWingGeos(d, S), [d, S]);
  const tail = useMemo(() => buildTailGeos(d, S), [d, S]);

  useFrame((_, dt) => {
    if (groupRef.current && !grabbed.current) {
      groupRef.current.rotation.y += dt * 0.25;
    }
  });

  // Engine layout
  const engR = r * (d.bigEng ? 0.62 : d.eng === 4 ? 0.46 : 0.52) * (d.delta ? 0.55 : 1);
  const engL = engR * 2.5;
  const enginePositions: [number, number, number][] = [];
  if (!d.props && !d.tailEng) {
    const fractions = d.eng === 4 ? [0.36, 0.62] : [0.34];
    for (const f of fractions) {
      const x = wings.half * f;
      const yWing = wings.wingY + (d.wing === "high" ? -0.03 : 0.085) * wings.half * f;
      const zLE = wings.rootLEz - wings.sweepBack * f;
      const y = d.delta ? yWing - engR * 0.9 : yWing - engR * 1.05;
      const z = d.delta ? zLE - len * 0.30 : zLE + engL * 0.18;
      enginePositions.push([x, y, z], [-x, y, z]);
    }
  }
  if (d.tailEng) {
    const x = r + engR * 1.05;
    enginePositions.push([x, r * 0.42, -len * 0.30], [-x, r * 0.42, -len * 0.30]);
  }

  // Prop engines on wing LE
  const propPositions: [number, number, number][] = [];
  if (d.props) {
    const f = 0.40;
    const x = wings.half * f;
    const y = wings.wingY - r * 0.10;
    const z = wings.rootLEz - wings.sweepBack * f + r * 0.9;
    propPositions.push([x, y, z], [-x, y, z]);
  }

  const freight = isFreighter(specId);

  return (
    <group
      ref={groupRef}
      rotation={[0.05, Math.PI * 0.22, 0]}
      onPointerDown={() => { grabbed.current = true; }}
      onPointerUp={() => { grabbed.current = false; }}
    >
      {/* Fuselage */}
      <mesh geometry={fuselage} material={mats.fuselage} />

      {/* 747 hump */}
      {d.hump && (
        <mesh position={[0, r * 0.78, len * 0.255]} scale={[r * 0.78, r * 0.62, len * 0.21]}>
          <sphereGeometry args={[1, 24, 16]} />
          <primitive object={mats.fuselage} attach="material" />
        </mesh>
      )}

      {/* Cockpit windscreen */}
      <mesh
        position={[0, r * 0.38, len / 2 - len * (d.delta ? 0.30 : 0.115)]}
        rotation={[-0.45, 0, 0]}
      >
        <boxGeometry args={[r * 1.05, r * 0.30, r * 0.55]} />
        <primitive object={mats.glass} attach="material" />
      </mesh>

      {/* Passenger window strips */}
      {!freight && !d.delta && (
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * r * 0.965, r * 0.18, len * 0.02]}>
            <boxGeometry args={[r * 0.06, r * 0.085, len * 0.58]} />
            <primitive object={mats.dark} attach="material" />
          </mesh>
        ))
      )}
      {/* Upper-deck windows for A380 */}
      {d.doubleDeck && !freight && (
        [-1, 1].map((s) => (
          <mesh key={`u${s}`} position={[s * r * 0.88, r * 0.62, len * 0.02]}>
            <boxGeometry args={[r * 0.06, r * 0.075, len * 0.52]} />
            <primitive object={mats.dark} attach="material" />
          </mesh>
        ))
      )}

      {/* Wings */}
      <mesh geometry={wings.left} material={mats.wing} />
      <mesh geometry={wings.right} material={mats.wing} />
      {wings.wingletL && <mesh geometry={wings.wingletL} material={mats.wing} />}
      {wings.wingletR && <mesh geometry={wings.wingletR} material={mats.wing} />}

      {/* Wing-body fairing */}
      {!d.delta && (
        <mesh
          position={[0, wings.wingY * 0.85, wings.rootLEz - wings.rootChord * 0.45]}
          scale={[r * 1.12, r * 0.55, wings.rootChord * 0.75]}
        >
          <sphereGeometry args={[1, 20, 14]} />
          <primitive object={mats.belly} attach="material" />
        </mesh>
      )}

      {/* Tail */}
      <mesh geometry={tail.fin} material={mats.wing} />
      {tail.stabs && <mesh geometry={tail.stabs} material={mats.wing} />}

      {/* Engines */}
      {enginePositions.map((p, i) => (
        <group key={i}>
          {/* pylon */}
          {!d.tailEng && !d.delta && (
            <mesh position={[p[0], p[1] + engR * 0.9, p[2] - engL * 0.1]}>
              <boxGeometry args={[engR * 0.22, engR * 1.1, engL * 0.55]} />
              <primitive object={mats.belly} attach="material" />
            </mesh>
          )}
          {d.tailEng && (
            <mesh position={[p[0] * 0.82, p[1], p[2]]}>
              <boxGeometry args={[engR * 1.3, engR * 0.25, engL * 0.5]} />
              <primitive object={mats.belly} attach="material" />
            </mesh>
          )}
          <Engine pos={p} R={engR} L={engL} mats={mats} />
        </group>
      ))}

      {/* Propellers */}
      {propPositions.map((p, i) => (
        <Propeller key={i} pos={p} R={r * 1.5} mats={mats} />
      ))}
    </group>
  );
}

/* ───────────────────────── GLB path (real models) ───────────────────────── */

function GlbModel({ path }: { path: string }) {
  // Models are Draco-compressed (mesh) + WebP textures. Passing `true`
  // tells drei to attach a DRACOLoader (decoder served from the gstatic
  // CDN); WebP textures decode natively in the browser.
  const { scene } = useGLTF(path, true);
  const groupRef = useRef<THREE.Group>(null);
  const grabbed = useRef(false);

  // Normalise: center at origin and scale longest axis to ~4.4 units so
  // every model — from a CRJ to an A380 — frames identically.
  const normalised = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const ctr = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(ctr);
    box.getSize(size);
    const scale = 4.4 / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.sub(ctr.multiplyScalar(scale));
    return clone;
  }, [scene]);

  // Gentle auto-rotate (pauses while the user is dragging) so the model
  // shows all sides on its own, matching the procedural viewer.
  useFrame((_, dt) => {
    if (groupRef.current && !grabbed.current) {
      groupRef.current.rotation.y += dt * 0.3;
    }
  });

  return (
    <group
      ref={groupRef}
      rotation={[0.08, Math.PI * 0.18, 0]}
      onPointerDown={() => { grabbed.current = true; }}
      onPointerUp={() => { grabbed.current = false; }}
    >
      <primitive object={normalised} />
    </group>
  );
}

/* ───────────────────────── Scene + canvas ───────────────────────────────── */

function SceneContent({ specId }: { specId: string }) {
  const modelPath = planeModelPath(specId);
  if (modelPath) {
    return (
      <Suspense
        fallback={
          <Html center>
            <span className="text-[0.7rem] text-ink-muted animate-pulse">Loading…</span>
          </Html>
        }
      >
        <GlbModel path={modelPath} />
      </Suspense>
    );
  }
  return <ProceduralAircraft specId={specId} />;
}

interface Props { specId: string; className?: string }

export function Aircraft3DViewer({ specId, className }: Props) {
  return (
    <div className={className} style={{ touchAction: "none" }}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ background: "transparent" }}
        shadows
      >
        <PerspectiveCamera makeDefault position={[3.4, 1.5, 5.6]} fov={32} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[6, 9, 7]} intensity={1.6} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.5} />
        <directionalLight position={[0, -4, 2]} intensity={0.22} color="#bcd4ea" />
        <Environment preset="city" />
        <SceneContent specId={specId} />
        <ContactShadows
          position={[0, -1.45, 0]}
          opacity={0.34}
          scale={9}
          blur={2.6}
          far={3}
        />
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={3.4}
          maxDistance={11}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
