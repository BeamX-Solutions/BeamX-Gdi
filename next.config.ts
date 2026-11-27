import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The report PDF reads its fonts and logo from disk at run time (spec 0015, AC-4).
  outputFileTracingIncludes: {
    "/api/runs/[runId]/pdf": ["./src/pdf/fonts/**", "./public/brand/logo.png"],
    "/api/runs/[runId]/email": [
      "./src/pdf/fonts/**",
      "./public/brand/logo.png",
    ],
    // BeamX's booking email attaches the client's reports (spec 0016, AC-6).
    "/api/webhooks/calendly": ["./src/pdf/fonts/**", "./public/brand/logo.png"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// BotID proxies its challenge script through this app (spec 0007).
export default withBotId(nextConfig);
