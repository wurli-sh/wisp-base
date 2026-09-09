import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow LAN IP in Next 15+ when opening the app via Network URL during local demo.
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.1.14:3000"],
  // Monorepo: pin tracing to the workspace root (wisp-base/), not a parent lockfile.
  outputFileTracingRoot: path.join(configDir, "../.."),
  transpilePackages: ["@wisp/shared"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@base-org/account": false,
      "x402-fetch": false,
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
