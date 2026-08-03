import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bynex Demo",
  description: "AI-operativsystemet för byggbranschen",
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
