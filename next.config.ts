import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    const origin = process.env.DASHBOARD_ORIGIN?.replace(/\/$/, "");
    return { beforeFiles: origin ? [{ source: "/dashboard/:path*", destination: `${origin}/dashboard/:path*` }] : [] };
  },
};

export default nextConfig;
