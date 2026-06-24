import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  transpilePackages: ['@zkc/db', '@zkc/shared'],
  // Standalone output produces a self-contained server.js + minimal
  // node_modules tree under .next/standalone/ — exactly what the
  // production Docker image copies into the slim runtime stage.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
