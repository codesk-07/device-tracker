declare module "next-pwa" {
  import type { NextConfig } from "next";

  type PWAConfig = {
    dest: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
  };

  export default function withPWAInit(
    config: PWAConfig,
  ): (nextConfig: NextConfig) => NextConfig;
}
