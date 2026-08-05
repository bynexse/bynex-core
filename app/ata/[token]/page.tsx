import type { Metadata } from "next";
import ChangeOrderDecision from "./ChangeOrderDecision";

export const metadata: Metadata = { title: "ÄTA-beslut · Bynex", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ChangeOrderDecision token={token} />;
}
