import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["mongodb", "web-push", "@huggingface/transformers", "onnxruntime-node", "ogg-opus-decoder"],
  agentRules: false,
};

export default nextConfig;
