import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: process.env.NEXT_PUBLIC_UAT_BASE_PATH || undefined,
};

export default nextConfig;
