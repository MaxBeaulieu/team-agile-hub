import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Docker runtime image (frontend/Dockerfile): traces and
  // copies only the files needed to run `node server.js`, so the final
  // image doesn't need node_modules or the Next.js CLI at all. See
  // SELFHOST_MIGRATION_PLAN.md Phase 6 / docs/architecture/selfhost-migration.md.
  output: "standalone",
};

export default nextConfig;
