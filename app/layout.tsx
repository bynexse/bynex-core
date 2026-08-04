import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bynex | Bygg mer. Administrera mindre.",
  description: "Bynex-plattformen för byggbranschen",
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
