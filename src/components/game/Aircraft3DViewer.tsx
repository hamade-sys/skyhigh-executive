"use client";

/**
 * Interactive 3-D aircraft viewer.
 *
 * Renders inside a React Three Fiber <Canvas>. Two modes:
 *  1. GLB model  — loaded via useGLTF when a path is supplied via
 *     planeModelPath(specId). Drag to rotate, scroll to zoom.
 *  2. Procedural — when no GLB exists the viewer shows a stylised
 *     aircraft silhouette built from Three.js primitives. Same
 *     controls, same lighting — the player still gets a 3-D object
 *     they can spin around for every aircraft in the catalogue.
 *
 * Usage:
 *   <Aircraft3DViewer specId="A320" className="h-52 w-full" />
 */

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  Html,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import { planeModelPath } from "@/lib/aircraft-models";

// ─── GLB model (when file exists) ───────────────────────────────────────────

function GlbModel({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  // Centre + normalise the bounding box so every model fits
  // the same viewport regardless of how the artist exported it.
  const normalised = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(centre);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 3 / maxDim;
    clone.position.sub(centre.multiplyScalar(scale));
    clone.scale.setScalar(scale);
    return clone;
  }, [scene]);

  return <primitive object={normalised} />;
}

// ─── Procedural fallback mesh ────────────────────────────────────────────────

/** A stylised aircraft silhouette built from primitives. Scales well
 *  at the ~3-unit viewport size used by OrbitControls default distance. */
function ProceduralAircraft() {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle auto-rotation so the model looks alive when the user
  // hasn't grabbed it yet.
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.1, Math.PI / 6, 0]}>
      {/* ── Fuselage ─────────────────────────────────────────── */}
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.18, 2.6, 8, 24]} />
        <meshStandardMaterial
          color="#e8edf2"
          metalness={0.55}
          roughness={0.25}
        />
      </mesh>

      {/* Nose cone — slightly narrower cap */}
      <mesh position={[0, 0, 1.55]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.35, 20]} />
        <meshStandardMaterial color="#d4dae0" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Cockpit windows band */}
      <mesh position={[0.16, 0.04, 1.3]}>
        <boxGeometry args={[0.04, 0.08, 0.22]} />
        <meshStandardMaterial color="#1a2a3a" metalness={0.2} roughness={0.1} />
      </mesh>
      <mesh position={[-0.16, 0.04, 1.3]}>
        <boxGeometry args={[0.04, 0.08, 0.22]} />
        <meshStandardMaterial color="#1a2a3a" metalness={0.2} roughness={0.1} />
      </mesh>

      {/* ── Main wings ───────────────────────────────────────── */}
      {/* Left wing */}
      <mesh position={[-1.05, -0.04, 0.1]} rotation={[0, 0.18, -0.06]}>
        <boxGeometry args={[1.8, 0.04, 0.62]} />
        <meshStandardMaterial color="#dde3e9" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Right wing */}
      <mesh position={[1.05, -0.04, 0.1]} rotation={[0, -0.18, 0.06]}>
        <boxGeometry args={[1.8, 0.04, 0.62]} />
        <meshStandardMaterial color="#dde3e9" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Winglets — left */}
      <mesh position={[-1.88, 0.13, 0.18]} rotation={[0, 0, -1.15]}>
        <boxGeometry args={[0.32, 0.04, 0.14]} />
        <meshStandardMaterial color="#ccd4dc" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Winglets — right */}
      <mesh position={[1.88, 0.13, 0.18]} rotation={[0, 0, 1.15]}>
        <boxGeometry args={[0.32, 0.04, 0.14]} />
        <meshStandardMaterial color="#ccd4dc" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* ── Engines (wing-mounted) ────────────────────────────── */}
      {/* Left engine */}
      <mesh position={[-0.82, -0.18, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.085, 0.55, 18]} />
        <meshStandardMaterial color="#aab4bc" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Left engine intake ring */}
      <mesh position={[-0.82, -0.18, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.015, 10, 20]} />
        <meshStandardMaterial color="#7a8890" metalness={0.8} roughness={0.15} />
      </mesh>
      {/* Right engine */}
      <mesh position={[0.82, -0.18, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.085, 0.55, 18]} />
        <meshStandardMaterial color="#aab4bc" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Right engine intake ring */}
      <mesh position={[0.82, -0.18, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.015, 10, 20]} />
        <meshStandardMaterial color="#7a8890" metalness={0.8} roughness={0.15} />
      </mesh>

      {/* ── Tail — vertical stabilizer ───────────────────────── */}
      <mesh position={[0, 0.36, -1.2]} rotation={[0.32, 0, 0]}>
        <boxGeometry args={[0.04, 0.62, 0.48]} />
        <meshStandardMaterial color="#dde3e9" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* ── Tail — horizontal stabilizers ───────────────────── */}
      {/* Left */}
      <mesh position={[-0.46, 0.06, -1.3]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[0.82, 0.04, 0.26]} />
        <meshStandardMaterial color="#dde3e9" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Right */}
      <mesh position={[0.46, 0.06, -1.3]} rotation={[0, -0.08, 0]}>
        <boxGeometry args={[0.82, 0.04, 0.26]} />
        <meshStandardMaterial color="#dde3e9" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* ── Landing gear (down) ───────────────────────────────── */}
      <mesh position={[0, -0.26, 0.18]}>
        <cylinderGeometry args={[0.025, 0.025, 0.24, 8]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.38, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.12, 12]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>

      {/* Nose gear */}
      <mesh position={[0, -0.22, 1.1]}>
        <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.32, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 12]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─── Scene (model or fallback) ───────────────────────────────────────────────

function Scene({ specId }: { specId: string }) {
  const modelPath = planeModelPath(specId);

  return (
    <>
      {modelPath ? (
        <Suspense fallback={<LoadingFallback />}>
          <GlbModel path={modelPath} />
        </Suspense>
      ) : (
        <ProceduralAircraft />
      )}
    </>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="text-ink-muted text-[0.75rem] animate-pulse">
        Loading model…
      </div>
    </Html>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

interface Props {
  specId: string;
  className?: string;
}

export function Aircraft3DViewer({ specId, className }: Props) {
  return (
    <div className={className} style={{ touchAction: "none" }}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ background: "transparent" }}
      >
        <PerspectiveCamera makeDefault position={[0, 1.2, 5]} fov={38} />

        {/* Ambient fill */}
        <ambientLight intensity={0.6} />
        {/* Key light from upper-left front */}
        <directionalLight position={[4, 6, 5]} intensity={1.4} castShadow />
        {/* Fill from right */}
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />
        {/* Subtle rim from below-back */}
        <directionalLight position={[0, -3, -4]} intensity={0.3} color="#b0c8e0" />

        {/* HDRI environment for reflections */}
        <Environment preset="city" />

        <Scene specId={specId} />

        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={3}
          maxDistance={9}
          autoRotate={false}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
