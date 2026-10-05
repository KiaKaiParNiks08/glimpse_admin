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
      // One post can be six 10MB images, or one 50MB video, plus the form fields.
      bodySizeLimit: '70mb',
    },
    // Middleware matches every /api request and otherwise keeps only the first 10MB.
    // A larger video was cut off, and the feed response went out before the upload finished.
    middlewareClientMaxBodySize: '70mb',
  },
};

export default nextConfig;
