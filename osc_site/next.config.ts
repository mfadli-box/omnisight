import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['172.27.22.66'],
};

export default nextConfig;
module.exports = nextConfig;
