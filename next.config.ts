import type { NextConfig } from "next";

/**
 * Phase D — D-001: surface the build's version + commit SHA on the
 * client so the operator can verify which build is running in front
 * of the cohort. Two env vars exposed as NEXT_PUBLIC_*:
 *
 *   - NEXT_PUBLIC_APP_VERSION  → semver from package.json
 *   - NEXT_PUBLIC_GIT_SHA      → short git SHA (set automatically by
 *                                Vercel via VERCEL_GIT_COMMIT_SHA;
 *                                falls back to "dev" locally)
 *
 * Rendered in the bottom-left of the game canvas via the version
 * footer component. The footer is intentionally tiny / muted — it's
 * a tooltip-style observability anchor, not a marketing surface.
 */

// Resolve the version once at build time so the bundle has it inline.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg: { version: string } = require("./package.json");

// Prefer Vercel's commit SHA env when present (production / preview),
// fall back to "dev" so local builds don't leave the footer empty.
const gitSha =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.GIT_SHA?.slice(0, 7) ??
  "dev";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;
