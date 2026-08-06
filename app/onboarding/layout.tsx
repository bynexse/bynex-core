import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Starta företag i Bynex",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
