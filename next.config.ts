import type { NextConfig } from "next";

const lanDevOrigin = process.env.CLARITY_LAN_DEV_ORIGIN?.trim();

const nextConfig: NextConfig = {
  cacheComponents: true,
  ...(process.env.NODE_ENV === "development" && lanDevOrigin
    ? { allowedDevOrigins: [lanDevOrigin] }
    : {}),
};

export default nextConfig;
