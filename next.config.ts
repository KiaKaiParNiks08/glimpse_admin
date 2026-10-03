import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Skip ESLint during `next build` to lower peak memory (Next workers + ESLint OOM on small VPS).
    // Run `npm run lint` in CI, locally, or in a separate job.
    ignoreDuringBuilds: true,
  },
  // typescript: {
  //   // Skip type checking during `next build` to avoid hanging on low-resource servers.
  //   // Run `npx tsc --noEmit` in CI or locally.
  //   ignoreBuildErrors: true,
  // },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
