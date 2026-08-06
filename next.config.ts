import type { NextConfig } from "next";

const privateRouteSources = [
  "/account/:path*",
  "/admin/:path*",
  "/app/:path*",
  "/ata/:path*",
  "/avtal/:path*",
  "/inbjudan/:path*",
  "/kundportal/:path*",
  "/login",
  "/offert/:path*",
  "/onboarding/:path*",
  "/pilot-login",
  "/projects/:path*",
  "/q/:path*",
  "/signup",
];

const nextConfig: NextConfig = {
  async headers() {
    return privateRouteSources.map((source) => ({
      source,
      headers: [
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow, noarchive, nosnippet",
        },
      ],
    }));
  },
};

export default nextConfig;
