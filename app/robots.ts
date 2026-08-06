import type { MetadataRoute } from "next";

const siteUrl = "https://bynex.se";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/app/",
          "/api/",
          "/auth/",
          "/login",
          "/signup",
          "/onboarding",
          "/inbjudan/",
          "/ata/",
          "/offert/",
          "/portal/",
          "/kund/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
