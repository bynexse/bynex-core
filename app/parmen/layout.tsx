import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bynex Pärmen – digital huspärm och underhållsplan",
  description:
    "Samla köpekontrakt, kvitton, garantier, hantverkarunderlag, bilder och en AI-stödd underhållsplan för villa, bostadsrätt, fritidshus eller tomt.",
  alternates: { canonical: "/parmen" },
  keywords: [
    "digital huspärm",
    "huspärm app",
    "underhållsplan villa",
    "dokument fastighet",
    "kvitton renovering",
    "garantier hus",
    "fastighetsdokument",
    "digital pärm bostadsrätt",
  ],
  openGraph: {
    title: "Bynex Pärmen – fastighetens samlade minne",
    description:
      "Dokument, kvitton, garantier, hantverkarunderlag och underhållsplan på ett ställe.",
    url: "https://bynex.se/parmen",
    type: "website",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function BinderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
