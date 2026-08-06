import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bynex – affärssystem för byggföretag",
    short_name: "Bynex",
    description:
      "Tidrapportering, byggdagbok, projekt, ÄTA, offerter, fakturering, lön och bokföring i ett system.",
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f3ee",
    theme_color: "#1d1f22",
    lang: "sv-SE",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/brand/bynex-mark.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
