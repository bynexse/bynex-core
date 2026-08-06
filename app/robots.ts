import type { MetadataRoute } from "next";

const siteUrl = "https://bynex.se";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account/",
          "/admin/",
          "/api/",
          "/app/",
          "/ata/",
          "/auth/",
          "/kundportal/",
          "/login",
          "/offert/",
          "/onboarding",
          "/pilot-login",
          "/projects/",
          "/q/",
          "/signup",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
