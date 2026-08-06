import type { Metadata } from "next";
import { Suspense } from "react";
import ContractSigningClient from "./ContractSigningClient";

export const metadata: Metadata = {
  title: "Granska och signera avtal | Bynex",
  description: "Säker granskning och elektronisk signering av Bynex-avtal.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ContractSigningPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <p className="text-sm font-medium text-slate-600">Hämtar avtalet…</p>
        </main>
      }
    >
      <ContractSigningClient />
    </Suspense>
  );
}
