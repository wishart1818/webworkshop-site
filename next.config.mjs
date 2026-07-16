import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const sharedSecurityHeaders = [
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    outputFileTracingRoot: process.cwd(),
    eslint: {
      ignoreDuringBuilds: true,
    },
    headers: async () => [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'" },
          ...sharedSecurityHeaders,
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/p/:token",
        headers: [
          { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'self'; object-src 'none'" },
          ...sharedSecurityHeaders,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/engine/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/engine/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ],
  };
}
