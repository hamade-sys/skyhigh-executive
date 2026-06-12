/**
 * Maps aircraft spec IDs to GLB model files in /public/plane-models/.
 *
 * How to add a real model:
 *  1. Download a free GLB from Sketchfab, NASA 3D Resources, or similar.
 *  2. Drop the file into /public/plane-models/ (e.g. A320.glb).
 *  3. Add the entry here: "A320": "A320.glb"
 *
 * When an ID has no entry (or the value is null) the viewer falls back
 * to the built-in procedural aircraft mesh — still interactive 3D,
 * just a generic silhouette instead of the real type.
 *
 * Good free sources:
 *  - https://sketchfab.com/search?features=downloadable&q=boeing+737 (free license filter)
 *  - https://nasa3d.arc.nasa.gov/models
 *  - https://free3d.com/3d-models/aircraft (filter: free, GLB/GLTF)
 */

const SPEC_TO_MODEL: Record<string, string | null> = {
  // Add entries here as you acquire GLB files, e.g.:
  // "A320": "A320.glb",
  // "B737-800": "B737-800.glb",
};

/**
 * Returns the public URL for a GLB model, or null if none is mapped.
 * null triggers the procedural fallback in Aircraft3DViewer.
 */
export function planeModelPath(specId: string): string | null {
  const file = SPEC_TO_MODEL[specId];
  if (!file) return null;
  return `/plane-models/${file}`;
}
