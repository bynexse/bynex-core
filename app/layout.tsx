import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bynex | Från idé till en byggnad som står i 100 år",
  description: "Bynex samlar projekt, tid, lön, offert, ÄTA, material, fakturering och fastighetens digitala minne.",
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
