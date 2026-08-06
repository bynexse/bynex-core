import type { Metadata } from "next";
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
  alternates: {
    canonical: "/",
  },
  authors: [{ name: "Bynex" }],
  creator: "Bynex",
  publisher: "Bynex",
  category: "Affärssystem för byggföretag",
  icons: {
    icon: "/brand/bynex-mark.png",
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
        url: "/brand/bynex-wordmark.png",
        width: 2172,
        height: 724,
        alt: "Bynex – byggprogram för svenska byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/brand/bynex-wordmark.png"],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
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
