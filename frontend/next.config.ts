import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/admin/:path*',
        destination: `${backendUrl}/admin/:path*`,
      },
      {
        source: '/static/admin/:path*',
        destination: `${backendUrl}/static/admin/:path*`,
      },
      {
        source: '/static/rest_framework/:path*',
        destination: `${backendUrl}/static/rest_framework/:path*`,
      },
      {
        source: '/univerity.app',
        destination: '/live-map',
      },
      {
        source: '/university.app',
        destination: '/live-map',
      },
      {
        source: '/experimental/maplibre',
        destination: '/live-map',
      },
    ];
  },
};

export default nextConfig;
