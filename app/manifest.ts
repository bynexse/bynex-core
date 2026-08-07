import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bynex – byggsystem för svenska byggföretag",
    short_name: "Bynex",
    description:
      "Tidrapportering, byggdagbok, projekt, ÄTA, offerter, fakturering, lön, bokföring och Bynex Pärmen i ett system.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f5f0",
    theme_color: "#1d1f22",
    lang: "sv-SE",
    dir: "ltr",
    categories: ["business", "productivity", "finance"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/brand/bynex-mark.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/bynex-mark.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Bynex Tid",
        short_name: "Tid",
        description: "Registrera tid och öppna dagens arbetsflöde.",
        url: "/app?module=time",
        icons: [{ src: "/brand/bynex-mark.png", sizes: "1254x1254", type: "image/png" }],
      },
      {
        name: "Bynex Projekt",
        short_name: "Projekt",
        description: "Öppna aktiva projekt och dagens produktion.",
        url: "/app?module=projects",
        icons: [{ src: "/brand/bynex-mark.png", sizes: "1254x1254", type: "image/png" }],
      },
      {
        name: "Bynex ÄTA",
        short_name: "ÄTA",
        description: "Dokumentera, prisuppskatta och hantera ÄTA.",
        url: "/app?module=change-orders",
        icons: [{ src: "/brand/bynex-mark.png", sizes: "1254x1254", type: "image/png" }],
      },
      {
        name: "Bynex Pärmen",
        short_name: "Pärmen",
        description: "Öppna fastighetens dokument, garantier och underhåll.",
        url: "/app?module=property-portal",
        icons: [{ src: "/brand/bynex-mark.png", sizes: "1254x1254", type: "image/png" }],
      },
    ],
  };
}
