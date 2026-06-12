"use client";

/**
 * Interactive 3-D aircraft viewer — v2
 *
 * All aircraft lie correctly along the Z-axis (nose → +Z, tail → -Z).
 * Seven visually distinct aircraft families:
 *   narrow_body   A319–A321, B737 variants, B757, C919, B797
 *   wide_body     A330, A350, B767, B777 series, B787
 *   jumbo_a380    A380 — massive 4-engine double-deck
 *   jumbo_b747    B747 — 4 engines + iconic upper-deck hump
 *   regional      E-jets, A220 — smaller, lower-sweep
 *   regional_crj  CRJ-700/900 — tail-mounted engines
 *   turboprop     ATR, Dash8 — high wing + propeller discs
 *   supersonic    Boom Overture — needle nose + delta wing
 *
 * When a real GLB file exists in /public/plane-models/<specId>.glb it
 * takes precedence. Otherwise the procedural mesh renders.
 */

import { Suspense, useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Html, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { planeModelPath } from "@/lib/aircraft-models";

// ─── Family detection ─────────────────────────────────────────────────────────

type Family =
  | "narrow_body"
  | "wide_body"
  | "jumbo_a380"
  | "jumbo_b747"
  | "regional"
  | "regional_crj"
  | "turboprop"
  | "supersonic";

function detectFamily(id: string): Family {
  if (/^A380/.test(id)) return "jumbo_a380";
  if (/^B747/.test(id)) return "jumbo_b747";
  if (/^(ATR|Dash|ATR-EVO)/.test(id)) return "turboprop";
  if (/^Boom/.test(id)) return "supersonic";
  if (/^CRJ/.test(id)) return "regional_crj";
  if (/^(E1[679]\d|E195|A220|B797)/.test(id)) return "regional";
  if (/^(A330|A350|B767|B777|B787|A300)/.test(id)) return "wide_body";
  return "narrow_body";
}

// ─── Per-family geometry parameters ──────────────────────────────────────────

interface Cfg {
  // Fuselage (lies along Z: nose=+Z, tail=–Z)
  fHalf: number;    // half-length of cylindrical body
  fR: number;       // radius
  noseL: number;    // nose cone length
  tailL: number;    // tail cone length
  // Wings (low-wing unless highWing=true)
  wHalfSpan: number;   // root to tip
  wChordRoot: number;  // chord at fuselage
  wChordTip: number;   // chord at wingtip
  wSweepZ: number;     // how far the tip LE is swept aft vs root LE (positive = swept back)
  wY: number;          // wing attachment Y (negative = under fuselage)
  wDihedral: number;   // how much higher the tip is vs root
  wRootZ: number;      // fuselage Z at wing root mid-chord
  // Engines
  eCount: 2 | 4;
  eR: number;       // nacelle radius
  eL: number;       // nacelle length
  eXratio: number[];// spanwise position as fraction of wHalfSpan for each pair
  eYdrop: number;   // how far below the wing the nacelle hangs
  tailEng: boolean; // CRJ: engines on the tail, not wings
  highWing: boolean;
  propeller: boolean;
  deltaWing: boolean;
  b747Hump: boolean;
  // Tail
  vFinH: number;
  vFinC: number;  // chord
  vFinZ: number;  // Z position
  hStabHalf: number;
  hStabChord: number;
  hStabZ: number;
}

const CFG: Record<Family, Cfg> = {
  narrow_body: {
    fHalf: 1.65, fR: 0.185, noseL: 0.48, tailL: 0.28,
    wHalfSpan: 1.90, wChordRoot: 0.56, wChordTip: 0.20, wSweepZ: 0.72,
    wY: -0.155, wDihedral: 0.14, wRootZ: 0.20,
    eCount: 2, eR: 0.085, eL: 0.52, eXratio: [0.42], eYdrop: 0.11,
    tailEng: false, highWing: false, propeller: false, deltaWing: false, b747Hump: false,
    vFinH: 0.56, vFinC: 0.44, vFinZ: -1.55,
    hStabHalf: 0.74, hStabChord: 0.24, hStabZ: -1.72,
  },
  wide_body: {
    fHalf: 2.05, fR: 0.245, noseL: 0.62, tailL: 0.34,
    wHalfSpan: 2.55, wChordRoot: 0.74, wChordTip: 0.24, wSweepZ: 1.15,
    wY: -0.19, wDihedral: 0.20, wRootZ: 0.25,
    eCount: 2, eR: 0.110, eL: 0.66, eXratio: [0.37], eYdrop: 0.13,
    tailEng: false, highWing: false, propeller: false, deltaWing: false, b747Hump: false,
    vFinH: 0.70, vFinC: 0.55, vFinZ: -1.92,
    hStabHalf: 0.92, hStabChord: 0.30, hStabZ: -2.10,
  },
  jumbo_a380: {
    fHalf: 2.55, fR: 0.34, noseL: 0.72, tailL: 0.38,
    wHalfSpan: 3.20, wChordRoot: 0.92, wChordTip: 0.28, wSweepZ: 1.45,
    wY: -0.24, wDihedral: 0.22, wRootZ: 0.25,
    eCount: 4, eR: 0.110, eL: 0.65, eXratio: [0.31, 0.60], eYdrop: 0.12,
    tailEng: false, highWing: false, propeller: false, deltaWing: false, b747Hump: false,
    vFinH: 0.84, vFinC: 0.65, vFinZ: -2.45,
    hStabHalf: 1.08, hStabChord: 0.34, hStabZ: -2.58,
  },
  jumbo_b747: {
    fHalf: 2.25, fR: 0.258, noseL: 0.55, tailL: 0.32,
    wHalfSpan: 2.85, wChordRoot: 0.82, wChordTip: 0.26, wSweepZ: 1.30,
    wY: -0.20, wDihedral: 0.25, wRootZ: 0.15,
    eCount: 4, eR: 0.100, eL: 0.60, eXratio: [0.30, 0.60], eYdrop: 0.12,
    tailEng: false, highWing: false, propeller: false, deltaWing: false, b747Hump: true,
    vFinH: 0.76, vFinC: 0.56, vFinZ: -2.18,
    hStabHalf: 0.90, hStabChord: 0.28, hStabZ: -2.30,
  },
  regional: {
    fHalf: 1.45, fR: 0.155, noseL: 0.36, tailL: 0.22,
    wHalfSpan: 1.50, wChordRoot: 0.46, wChordTip: 0.18, wSweepZ: 0.46,
    wY: -0.12, wDihedral: 0.09, wRootZ: 0.15,
    eCount: 2, eR: 0.072, eL: 0.42, eXratio: [0.40], eYdrop: 0.10,
    tailEng: false, highWing: false, propeller: false, deltaWing: false, b747Hump: false,
    vFinH: 0.46, vFinC: 0.36, vFinZ: -1.38,
    hStabHalf: 0.60, hStabChord: 0.20, hStabZ: -1.50,
  },
  regional_crj: {
    fHalf: 1.45, fR: 0.145, noseL: 0.34, tailL: 0.22,
    wHalfSpan: 1.40, wChordRoot: 0.42, wChordTip: 0.16, wSweepZ: 0.55,
    wY: -0.08, wDihedral: 0.10, wRootZ: 0.10,
    eCount: 2, eR: 0.068, eL: 0.40, eXratio: [], eYdrop: 0,
    tailEng: true, highWing: false, propeller: false, deltaWing: false, b747Hump: false,
    vFinH: 0.48, vFinC: 0.36, vFinZ: -1.38,
    hStabHalf: 0.58, hStabChord: 0.19, hStabZ: -1.42,
  },
  turboprop: {
    fHalf: 1.30, fR: 0.162, noseL: 0.28, tailL: 0.22,
    wHalfSpan: 1.55, wChordRoot: 0.44, wChordTip: 0.20, wSweepZ: 0.08,
    wY: 0.14, wDihedral: 0.04, wRootZ: 0.05,   // HIGH WING → positive Y
    eCount: 2, eR: 0.09, eL: 0.36, eXratio: [0.42], eYdrop: 0,
    tailEng: false, highWing: true, propeller: true, deltaWing: false, b747Hump: false,
    vFinH: 0.48, vFinC: 0.34, vFinZ: -1.28,
    hStabHalf: 0.58, hStabChord: 0.20, hStabZ: -1.35,
  },
  supersonic: {
    fHalf: 2.30, fR: 0.130, noseL: 1.10, tailL: 0.12,
    wHalfSpan: 2.00, wChordRoot: 2.50, wChordTip: 0.06, wSweepZ: 2.60,
    wY: -0.06, wDihedral: 0.02, wRootZ: 0.85,
    eCount: 4, eR: 0.068, eL: 0.52, eXratio: [0.34, 0.60], eYdrop: 0.04,
    tailEng: false, highWing: false, propeller: false, deltaWing: true, b747Hump: false,
    vFinH: 0.32, vFinC: 0.50, vFinZ: -2.32,
    hStabHalf: 0, hStabChord: 0, hStabZ: 0,  // no separate h-stab (delta)
  },
};

// ─── Shared materials ─────────────────────────────────────────────────────────

const MAT_FUSELAGE = { color: "#e8ecf0", metalness: 0.55, roughness: 0.22 };
const MAT_WING     = { color: "#dde3ea", metalness: 0.50, roughness: 0.25 };
const MAT_NACELLE  = { color: "#b8c0c8", metalness: 0.70, roughness: 0.18 };
const MAT_GLASS    = { color: "#1a2e42", metalness: 0.20, roughness: 0.08 };
const MAT_RUBBER   = { color: "#2a2a2a", roughness: 0.92, metalness: 0.0  };
const MAT_PROP     = { color: "#555e66", metalness: 0.65, roughness: 0.30 };

// ─── Wing geometry builder ────────────────────────────────────────────────────

function buildWingGeo(cfg: Cfg, side: 1 | -1): THREE.BufferGeometry {
  const s = side;
  const rootX  = s * cfg.fR;
  const tipX   = s * cfg.wHalfSpan;
  const rootY  = cfg.wY;
  const tipY   = cfg.wY + cfg.wDihedral;

  // Leading edge Z positions (positive Z = forward/nose)
  const rootLEZ = cfg.wRootZ + cfg.wChordRoot / 2;
  const rootTEZ = cfg.wRootZ - cfg.wChordRoot / 2;
  const tipLEZ  = cfg.wRootZ + cfg.wChordTip / 2  - cfg.wSweepZ;
  const tipTEZ  = cfg.wRootZ - cfg.wChordTip / 2  - cfg.wSweepZ;

  const th  = 0.026;   // half-thickness at root
  const thT = 0.012;   // half-thickness at tip

  // 8 vertices: 4 top (index 0-3) + 4 bottom (4-7)
  // order: rootLE, rootTE, tipLE, tipTE
  /* eslint-disable prettier/prettier */
  const verts = new Float32Array([
    // Top
    rootX, rootY + th,  rootLEZ,   // 0 root-LE-top
    rootX, rootY + th,  rootTEZ,   // 1 root-TE-top
    tipX,  tipY  + thT, tipLEZ,    // 2 tip-LE-top
    tipX,  tipY  + thT, tipTEZ,    // 3 tip-TE-top
    // Bottom
    rootX, rootY - th,  rootLEZ,   // 4 root-LE-bot
    rootX, rootY - th,  rootTEZ,   // 5 root-TE-bot
    tipX,  tipY  - thT, tipLEZ,    // 6 tip-LE-bot
    tipX,  tipY  - thT, tipTEZ,    // 7 tip-TE-bot
  ]);
  /* eslint-enable prettier/prettier */

  // Consistent CCW winding for each face
  const idx = new Uint16Array([
    // top face
    0, 2, 1,   1, 2, 3,
    // bottom face (flipped)
    4, 5, 6,   5, 7, 6,
    // leading edge
    0, 4, 2,   4, 6, 2,
    // trailing edge
    1, 3, 5,   3, 7, 5,
    // root cap
    0, 1, 4,   1, 5, 4,
    // tip cap
    2, 6, 3,   6, 7, 3,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

// Delta wing (for Boom Overture): one huge swept triangle each side
function buildDeltaWingGeo(cfg: Cfg, side: 1 | -1): THREE.BufferGeometry {
  const s   = side;
  const rootX = s * cfg.fR;
  const tipX  = s * cfg.wHalfSpan;
  const rootY = cfg.wY;
  const tipY  = cfg.wY + cfg.wDihedral;

  const rootLEZ = cfg.wRootZ + cfg.wChordRoot / 2;
  const rootTEZ = cfg.wRootZ - cfg.wChordRoot / 2;
  const tipZ    = cfg.wRootZ + cfg.wChordTip / 2 - cfg.wSweepZ; // tip is just a point

  const th  = 0.020;
  const thT = 0.006;

  /* eslint-disable prettier/prettier */
  const verts = new Float32Array([
    // top: root-LE (0), root-TE (1), tip (2)
    rootX, rootY + th,  rootLEZ,
    rootX, rootY + th,  rootTEZ,
    tipX,  tipY  + thT, tipZ,
    // bottom: root-LE (3), root-TE (4), tip (5)
    rootX, rootY - th,  rootLEZ,
    rootX, rootY - th,  rootTEZ,
    tipX,  tipY  - thT, tipZ,
  ]);
  /* eslint-enable prettier/prettier */

  const idx = new Uint16Array([
    0, 2, 1,  // top
    3, 4, 5,  // bottom
    0, 3, 2,  3, 5, 2,  // LE
    1, 2, 4,  2, 5, 4,  // TE
    0, 1, 3,  1, 4, 3,  // root
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FuselageGroup({ cfg }: { cfg: Cfg }) {
  // Main cylindrical body — CylinderGeometry is along Y; rotate –90° on X → Z-axis
  const bodyH = cfg.fHalf * 2;
  return (
    <group>
      {/* Main body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[cfg.fR, cfg.fR, bodyH, 32, 1, false]} />
        <meshStandardMaterial {...MAT_FUSELAGE} />
      </mesh>

      {/* Nose cone — ConeGeometry points +Y; rotate +90° on X → nose points +Z */}
      <mesh position={[0, 0, cfg.fHalf]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[cfg.fR, cfg.noseL, 32]} />
        <meshStandardMaterial {...MAT_FUSELAGE} color="#dde2e8" />
      </mesh>

      {/* Tail cone — points –Z */}
      <mesh position={[0, 0, -cfg.fHalf]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[cfg.fR, cfg.tailL, 24]} />
        <meshStandardMaterial {...MAT_FUSELAGE} color="#dde2e8" />
      </mesh>

      {/* Cockpit windows band — just forward of nose junction */}
      {[-1, 1].map((sx) => (
        <mesh
          key={sx}
          position={[
            sx * cfg.fR * 0.85,
            cfg.fR * 0.22,
            cfg.fHalf - 0.04,
          ]}
          rotation={[0, 0, 0]}
        >
          <boxGeometry args={[0.04, cfg.fR * 0.32, 0.22]} />
          <meshStandardMaterial {...MAT_GLASS} />
        </mesh>
      ))}
    </group>
  );
}

function B747HumpGroup({ cfg }: { cfg: Cfg }) {
  // The iconic 747 upper-deck hump runs from about +fHalf back to about –0.4
  const humpL = cfg.fHalf * 0.88;
  return (
    <mesh position={[0, cfg.fR * 0.72, cfg.fHalf * 0.44 - humpL / 2]}>
      {/* Rough half-cylinder that tapers */}
      <cylinderGeometry args={[cfg.fR * 0.52, cfg.fR * 0.52, humpL, 16, 1, false, 0, Math.PI]} />
      <meshStandardMaterial {...MAT_FUSELAGE} color="#dfe4ea" />
    </mesh>
  );
}

function WingPair({ cfg }: { cfg: Cfg }) {
  const geoL = useMemo(() => buildWingGeo(cfg, -1), [cfg]);
  const geoR = useMemo(() => buildWingGeo(cfg, 1), [cfg]);
  return (
    <>
      <mesh geometry={geoL}>
        <meshStandardMaterial {...MAT_WING} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geoR}>
        <meshStandardMaterial {...MAT_WING} side={THREE.DoubleSide} />
      </mesh>
      {/* Winglets — small angled fin at each tip */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[
            s * cfg.wHalfSpan,
            cfg.wY + cfg.wDihedral + 0.12,
            cfg.wRootZ - cfg.wSweepZ,
          ]}
          rotation={[0, 0, s * -1.2]}
        >
          <boxGeometry args={[0.04, 0.22, cfg.wChordTip * 0.6]} />
          <meshStandardMaterial {...MAT_WING} />
        </mesh>
      ))}
    </>
  );
}

function DeltaWingPair({ cfg }: { cfg: Cfg }) {
  const geoL = useMemo(() => buildDeltaWingGeo(cfg, -1), [cfg]);
  const geoR = useMemo(() => buildDeltaWingGeo(cfg, 1), [cfg]);
  return (
    <>
      <mesh geometry={geoL}><meshStandardMaterial {...MAT_WING} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geoR}><meshStandardMaterial {...MAT_WING} side={THREE.DoubleSide} /></mesh>
    </>
  );
}

function TailGroup({ cfg }: { cfg: Cfg }) {
  const sweepOffset = cfg.vFinC * 0.38; // leading edge swept forward at base
  return (
    <group>
      {/* Vertical stabilizer */}
      <mesh
        position={[0, cfg.fR + cfg.vFinH / 2, cfg.vFinZ + sweepOffset / 2]}
        rotation={[0.18, 0, 0]}
      >
        <boxGeometry args={[0.04, cfg.vFinH, cfg.vFinC]} />
        <meshStandardMaterial {...MAT_WING} />
      </mesh>

      {/* Horizontal stabilizers */}
      {cfg.hStabHalf > 0 &&
        [-1, 1].map((s) => (
          <mesh
            key={s}
            position={[
              s * (cfg.hStabHalf / 2 + cfg.fR * 0.1),
              cfg.fR * 0.12,
              cfg.hStabZ,
            ]}
          >
            <boxGeometry args={[cfg.hStabHalf, 0.03, cfg.hStabChord]} />
            <meshStandardMaterial {...MAT_WING} />
          </mesh>
        ))}
    </group>
  );
}

function EngineGroup({ cfg }: { cfg: Cfg }) {
  if (cfg.tailEng) {
    // CRJ: two engines mounted on aft fuselage, one per side
    return (
      <>
        {[-1, 1].map((s) => {
          const ex = s * (cfg.fR + cfg.eR * 1.3);
          const ey = cfg.fR * 0.55;
          const ez = -cfg.fHalf * 0.65;
          return (
            <group key={s} position={[ex, ey, ez]}>
              {/* Nacelle */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[cfg.eR, cfg.eR * 0.85, cfg.eL, 20]} />
                <meshStandardMaterial {...MAT_NACELLE} />
              </mesh>
              {/* Intake lip */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, cfg.eL / 2]}>
                <torusGeometry args={[cfg.eR, 0.014, 10, 24]} />
                <meshStandardMaterial color="#888" metalness={0.8} roughness={0.15} />
              </mesh>
              {/* Fan face dark disc */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, cfg.eL / 2 - 0.04]}>
                <circleGeometry args={[cfg.eR * 0.85, 20]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
              </mesh>
            </group>
          );
        })}
      </>
    );
  }

  // Under-wing (or over-wing) engines
  return (
    <>
      {cfg.eXratio.map((ratio, i) =>
        [-1, 1].map((s) => {
          const ex  = s * cfg.wHalfSpan * ratio;
          // wing Y at this spanwise position (linear interpolation)
          const t   = ratio;
          const wingYAtX = cfg.wY + cfg.wDihedral * t;
          const ey  = wingYAtX - cfg.eYdrop - cfg.eR;
          // wing Z at this position (swept)
          const ez  = cfg.wRootZ - cfg.wSweepZ * t;
          return (
            <group key={`${i}-${s}`} position={[ex, ey, ez]}>
              {/* Pylon connecting wing to nacelle */}
              <mesh>
                <boxGeometry args={[0.03, cfg.eYdrop * 0.85, 0.10]} />
                <meshStandardMaterial color="#ccc" metalness={0.4} roughness={0.4} />
              </mesh>
              {/* Nacelle body */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[cfg.eR, cfg.eR * 0.82, cfg.eL, 22]} />
                <meshStandardMaterial {...MAT_NACELLE} />
              </mesh>
              {/* Intake rim */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, cfg.eL / 2]}>
                <torusGeometry args={[cfg.eR, 0.013, 10, 24]} />
                <meshStandardMaterial color="#7a8490" metalness={0.85} roughness={0.12} />
              </mesh>
              {/* Fan face */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, cfg.eL / 2 - 0.04]}>
                <circleGeometry args={[cfg.eR * 0.82, 22]} />
                <meshStandardMaterial color="#1c1c1c" roughness={0.55} />
              </mesh>
              {/* Exhaust nozzle */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -(cfg.eL / 2 + 0.04)]}>
                <coneGeometry args={[cfg.eR * 0.7, 0.15, 16]} />
                <meshStandardMaterial color="#999" metalness={0.7} roughness={0.3} />
              </mesh>
            </group>
          );
        })
      )}
    </>
  );
}

function PropellerGroup({ cfg }: { cfg: Cfg }) {
  const propRef1 = useRef<THREE.Group>(null);
  const propRef2 = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (propRef1.current) propRef1.current.rotation.z += dt * 6;
    if (propRef2.current) propRef2.current.rotation.z += dt * 6;
  });

  return (
    <>
      {([-1, 1] as const).map((s, i) => {
        const ex = s * cfg.wHalfSpan * cfg.eXratio[0];
        const t  = cfg.eXratio[0];
        const ey = cfg.wY + cfg.wDihedral * t;
        const ez = cfg.wRootZ - cfg.wSweepZ * t + cfg.eL / 2 + 0.12;
        const ref = i === 0 ? propRef1 : propRef2;
        return (
          <group key={s}>
            {/* Engine housing */}
            <mesh position={[ex, ey, ez - cfg.eL / 2 - 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[cfg.eR, cfg.eR * 0.8, cfg.eL, 18]} />
              <meshStandardMaterial {...MAT_NACELLE} />
            </mesh>
            {/* Spinning props */}
            <group ref={ref} position={[ex, ey, ez]}>
              {[0, 1].map((b) => (
                <mesh key={b} rotation={[0, 0, (b * Math.PI) / 1]}>
                  <boxGeometry args={[0.84, 0.055, 0.07]} />
                  <meshStandardMaterial {...MAT_PROP} />
                </mesh>
              ))}
              {/* Spinner nose */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.065, 0.14, 16]} />
                <meshStandardMaterial color="#444" metalness={0.6} roughness={0.3} />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}

function LandingGearGroup({ cfg }: { cfg: Cfg }) {
  const noseGearY = -cfg.fR;
  const mainGearY = cfg.wY - cfg.eYdrop - 0.04;
  return (
    <group>
      {/* Nose gear */}
      <mesh position={[0, noseGearY - 0.09, cfg.fHalf * 0.62]}>
        <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, noseGearY - 0.19, cfg.fHalf * 0.62]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.038, 0.038, 0.10, 12]} />
        <meshStandardMaterial {...MAT_RUBBER} />
      </mesh>

      {/* Main gear (2 bogies) */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * cfg.fR * 0.85, mainGearY - 0.09, cfg.wRootZ - 0.15]}>
          <mesh>
            <cylinderGeometry args={[0.024, 0.024, 0.20, 8]} />
            <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.044, 0.044, 0.22, 12]} />
            <meshStandardMaterial {...MAT_RUBBER} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Auto-rotate with pause on user interaction ───────────────────────────────

function AutoRotate({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const rotating = useRef(true);
  const { gl } = useThree();

  const pause = useCallback(() => { rotating.current = false; }, []);
  const resume = useCallback(() => { rotating.current = true; }, []);

  // pause when user grabs the canvas
  useRef(() => {
    gl.domElement.addEventListener("pointerdown", pause);
    gl.domElement.addEventListener("pointerup", resume);
    return () => {
      gl.domElement.removeEventListener("pointerdown", pause);
      gl.domElement.removeEventListener("pointerup", resume);
    };
  });

  useFrame((_, dt) => {
    if (rotating.current && groupRef.current) {
      groupRef.current.rotation.y += dt * 0.30;
    }
  });
  return null;
}

// ─── Procedural aircraft assembly ─────────────────────────────────────────────

function ProceduralAircraft({ specId }: { specId: string }) {
  const family = detectFamily(specId);
  const cfg    = CFG[family];
  const groupRef = useRef<THREE.Group>(null);

  return (
    <>
      <AutoRotate groupRef={groupRef} />
      <group ref={groupRef} rotation={[0.04, Math.PI / 5, 0]}>
        <FuselageGroup cfg={cfg} />
        {cfg.b747Hump && <B747HumpGroup cfg={cfg} />}

        {cfg.deltaWing
          ? <DeltaWingPair cfg={cfg} />
          : <WingPair cfg={cfg} />}

        {!cfg.deltaWing && <TailGroup cfg={cfg} />}

        {cfg.propeller
          ? <PropellerGroup cfg={cfg} />
          : <EngineGroup cfg={cfg} />}

        <LandingGearGroup cfg={cfg} />
      </group>
    </>
  );
}

// ─── GLB model (when a real file is available) ────────────────────────────────

function GlbModel({ path }: { path: string }) {
  // Lazy import so this module isn't included unless GLB models are used
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGLTF } = require("@react-three/drei");
  const { scene } = useGLTF(path) as { scene: THREE.Object3D };

  const normalised = useMemo(() => {
    const clone = scene.clone(true);
    const box   = new THREE.Box3().setFromObject(clone);
    const ctr   = new THREE.Vector3();
    const size  = new THREE.Vector3();
    box.getCenter(ctr);
    box.getSize(size);
    const scale = 3.5 / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.sub(ctr.multiplyScalar(scale));
    return clone;
  }, [scene]);

  return <primitive object={normalised} />;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ specId }: { specId: string }) {
  const modelPath = planeModelPath(specId);
  if (modelPath) {
    return (
      <Suspense fallback={<Html center><span className="text-[0.7rem] text-ink-muted animate-pulse">Loading…</span></Html>}>
        <GlbModel path={modelPath} />
      </Suspense>
    );
  }
  return <ProceduralAircraft specId={specId} />;
}

// ─── Public component ─────────────────────────────────────────────────────────

interface Props { specId: string; className?: string }

export function Aircraft3DViewer({ specId, className }: Props) {
  return (
    <div className={className} style={{ touchAction: "none" }}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ background: "transparent" }}
      >
        <PerspectiveCamera makeDefault position={[0, 1.4, 6.2]} fov={36} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 6]} intensity={1.5} castShadow />
        <directionalLight position={[-4, 2, -3]} intensity={0.45} />
        <directionalLight position={[0, -4, -5]} intensity={0.25} color="#a8c8e0" />
        <Environment preset="city" />
        <Scene specId={specId} />
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={3.5}
          maxDistance={11}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
