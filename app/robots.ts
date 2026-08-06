import type { MetadataRoute } from "next";

const baseUrl = "https://www.bynex.se";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/admin",
          "/api",
          "/app",
          "/ata",
          "/auth",
          "/avtal",
          "/kundportal",
          "/login",
          "/offert",
          "/onboarding",
          "/pilot-login",
          "/q",
          "/signup",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
