import type { Metadata } from "next";
import "./globals.css";

const siteName = "Bynex";
const siteUrl = "https://bynex.se";
const defaultTitle = "Bynex – byggsystem för tid, projekt, ÄTA och ekonomi";
const defaultDescription = "Bynex samlar tidrapportering, personal, projekt, byggdagbok, offert, ÄTA, material, fakturering, lön och bokföring för svenska byggföretag.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: defaultTitle,
    template: "%s | Bynex",
  },
  description: defaultDescription,
  category: "business software",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/brand/bynex-mark.png",
    shortcut: "/brand/bynex-mark.png",
    apple: "/brand/bynex-mark.png",
  },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: siteUrl,
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/brand/bynex-wordmark.png",
        width: 2172,
        height: 724,
        alt: "Bynex – byggsystem för svenska byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
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
