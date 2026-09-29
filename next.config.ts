import type { NextConfig } from "next";

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
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "exceljs"],
  experimental: {
    // forbidden() renders src/app/forbidden.tsx when a permission check fails.
    authInterrupts: true,
    // Staff Excel imports are posted through a server action.
    serverActions: { bodySizeLimit: "5mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
