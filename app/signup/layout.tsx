import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prova Bynex",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
