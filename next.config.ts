import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

// Sent with every response. A full Content-Security-Policy needs nonces for
// Next.js's inline scripts and is planned for the production hardening pass;
// frame-ancestors below already blocks clickjacking.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Served under /phn-ldms; see src/lib/base-path.ts.
  basePath: BASE_PATH,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "exceljs"],
  experimental: {
    // forbidden() renders src/app/forbidden.tsx when a permission check fails.
    authInterrupts: true,
    // Excel imports and certificates (up to 5 MB, checked in the page first) are posted through server actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // Someone who opens the bare host (e.g. http://localhost:3006) lands on LDMS.
    return [{ source: "/", destination: BASE_PATH, basePath: false, permanent: false }];
  },
};

export default nextConfig;
