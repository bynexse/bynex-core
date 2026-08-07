import type { Metadata, Viewport } from "next";
import SafeFileInputGuard from "@/components/files/SafeFileInputGuard";
import PwaInstallManager from "@/components/pwa/PwaInstallManager";
import "./globals.css";

const siteName = "Bynex";
const siteUrl = "https://bynex.se";
const defaultTitle = "Bynex – byggsystem för tid, projekt, ÄTA och ekonomi";
const defaultDescription =
  "Bynex samlar tidrapportering, personal, projekt, byggdagbok, offert, ÄTA, material, fakturering, lön och bokföring för svenska byggföretag.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: defaultTitle,
    template: "%s | Bynex",
  },
  description: defaultDescription,
  keywords: [
    "byggsystem",
    "byggprogram",
    "affärssystem byggföretag",
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
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  category: "business software",
  referrer: "origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Bynex",
    statusBarStyle: "black-translucent",
    startupImage: "/brand/bynex-mark.png",
  },
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
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Bynex – byggsystem för svenska byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/opengraph-image"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d1f22",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>
        {children}
        <SafeFileInputGuard />
        <PwaInstallManager />
      </body>
    </html>
  );
}
