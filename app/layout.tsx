import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.bynex.se"),
  title: "Bynex | Hela företaget i ett system",
  description: "Bynex samlar tid, personal, projekt, offert, ÄTA, material, fakturering, bokföring och fastighet i ett sammanhängande arbetsflöde.",
  icons: {
    icon: "/brand/bynex-mark.png",
    apple: "/brand/bynex-mark.png",
  },
  openGraph: {
    title: "Bynex | Hela företaget i ett system",
    description: "Mindre administration, bättre kontroll och snabbare väg från utfört arbete till betald faktura.",
    images: ["/brand/bynex-wordmark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
