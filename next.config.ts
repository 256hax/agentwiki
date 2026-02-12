import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    // For better-sqlite3
    config.externals.push({
      "better-sqlite3": "commonjs better-sqlite3",
    });
    return config;
  },
};

export default nextConfig;
