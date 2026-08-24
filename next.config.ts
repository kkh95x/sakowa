import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["mongodb", "web-push"],
  agentRules: false,
};

export default nextConfig;
