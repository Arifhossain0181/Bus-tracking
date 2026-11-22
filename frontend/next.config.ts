import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: '/univerity.app',
        destination: '/live-map',
      },
      {
        source: '/university.app',
        destination: '/live-map',
      },
    ];
  },
};

export default nextConfig;
