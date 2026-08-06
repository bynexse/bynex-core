import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteTitle = "Bynex – byggprogram för tid, projekt, ÄTA och fakturering";
const siteDescription =
  "Bynex är ett svenskt byggprogram för tidrapportering, projektstyrning, byggdagbok, ÄTA, offert, fakturering, löneunderlag, material och bokföring i ett system.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.bynex.se"),
  applicationName: "Bynex",
  title: {
    default: siteTitle,
    template: "%s | Bynex",
  },
  description: siteDescription,
  keywords: [
    "byggprogram",
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
  authors: [{ name: "Bynex", url: "https://www.bynex.se" }],
  creator: "Bynex",
  publisher: "Bynex",
  category: "Affärssystem för byggföretag",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/bynex-mark.png",
    shortcut: "/brand/bynex-mark.png",
    apple: "/brand/bynex-mark.png",
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
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: "/",
    siteName: "Bynex",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Bynex – byggprogram för svenska byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
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
