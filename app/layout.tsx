import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bynex.se"),
  title: "Bynex | Från idé till en byggnad som står i 100 år",
  description: "Bynex samlar projekt, tid, lön, offert, ÄTA, material, fakturering och fastighetens digitala minne.",
  icons: {
    icon: "/brand/bynex-mark.png",
    apple: "/brand/bynex-mark.png",
  },
  openGraph: {
    title: "Bynex",
    description: "Bygg mer. Administrera mindre.",
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
