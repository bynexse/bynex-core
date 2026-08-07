import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bynex Arbetsläge – Tid, Projekt och Maskin",
    short_name: "Bynex",
    description:
      "Den snabba arbetsappen för tidrapportering, dagens projekt och tilldelade maskiner.",
    id: "/start",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f5f0",
    theme_color: "#1d1f22",
    lang: "sv-SE",
    dir: "ltr",
    categories: ["business", "productivity"],
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
        description: "Stämpla in, stämpla ut och hantera rast.",
        url: "/field?tab=time",
        icons: [
          {
            src: "/brand/bynex-mark.png",
            sizes: "1254x1254",
            type: "image/png",
          },
        ],
      },
      {
        name: "Bynex Projekt",
        short_name: "Projekt",
        description: "Öppna dagens projekt och rapportera hinder.",
        url: "/field?tab=project",
        icons: [
          {
            src: "/brand/bynex-mark.png",
            sizes: "1254x1254",
            type: "image/png",
          },
        ],
      },
      {
        name: "Bynex Maskin",
        short_name: "Maskin",
        description: "Se tilldelad maskin, service och retur.",
        url: "/field?tab=machine",
        icons: [
          {
            src: "/brand/bynex-mark.png",
            sizes: "1254x1254",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
