import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://bynex.se";
const siteDescription =
  "Bynex är ett affärssystem och byggsystem för tidrapportering, byggdagbok, projekt, ÄTA, offerter, fakturering, lön och bokföring.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Bynex – affärssystem för byggföretag",
    template: "%s | Bynex",
  },
  description: siteDescription,
  applicationName: "Bynex",
  keywords: [
    "affärssystem byggföretag",
    "byggsystem",
    "byggapp",
    "tidrapportering bygg",
    "byggdagbok",
    "ÄTA hantering",
    "offertprogram bygg",
    "fakturaprogram bygg",
    "projektledning bygg",
    "löneunderlag bygg",
    "bokföring byggföretag",
  ],
  authors: [{ name: "Bynex", url: siteUrl }],
  creator: "Bynex",
  publisher: "Bynex",
  category: "business software",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/bynex-mark.png",
    shortcut: "/brand/bynex-mark.png",
    apple: "/brand/bynex-mark.png",
  },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Bynex",
    title: "Bynex – affärssystem för byggföretag",
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Bynex – affärssystem för byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bynex – affärssystem för byggföretag",
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#1d1f22",
  colorScheme: "light",
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
