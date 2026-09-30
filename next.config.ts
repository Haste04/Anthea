import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
  },
  turbopack: {
    root: process.cwd(),
  },
  // audio-decode lazy-imports optional codec packages that are not
  // installed, and wavefile's ESM entry only has named exports - let Node
  // load both at runtime instead of bundling them. (@huggingface/transformers
  // and onnxruntime-node are already external by default.)
  serverExternalPackages: ["wavefile", "audio-decode"],
  outputFileTracingIncludes: {
    // onnxruntime-node loads its native binding from a platform-dependent
    // path that file tracing cannot follow - include it explicitly for the
    // Whisper transcription route.
    "/api/transcribe": [
      "node_modules/onnxruntime-node/dist/**",
      "node_modules/onnxruntime-node/lib/**",
      "node_modules/onnxruntime-node/package.json",
      "node_modules/onnxruntime-common/**",
      `node_modules/onnxruntime-node/bin/napi-v6/${process.platform}/${process.arch}/**`,
    ],
  },
};

export default nextConfig;
