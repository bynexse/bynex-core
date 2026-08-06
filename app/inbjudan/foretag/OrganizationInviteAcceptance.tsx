"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, LogIn, ShieldCheck, TriangleAlert } from "lucide-react";

export default function OrganizationInviteAcceptance({
  token,
}: {
  token: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function acceptInvite() {
    if (!token) {
      setStatus("error");
      setMessage("Inbjudningslänken saknar en giltig kod.");
      return;
    }

    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/public/organization-invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      const next = `/inbjudan/foretag?token=${encodeURIComponent(token)}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!response.ok) {
      setStatus("error");
      setMessage(payload?.error ?? "Inbjudan kunde inte accepteras.");
      return;
    }

    setStatus("success");
    setMessage("Inbjudan är accepterad. Din Bynex-arbetsyta öppnas nu.");
    window.setTimeout(() => router.replace("/app"), 900);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-5 py-10 text-zinc-950">
      <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-xl">
        <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-8 text-white sm:p-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Säker företagsinbjudan
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Du är inbjuden till Bynex
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-300">
            Logga in med samma e-postadress som inbjudan skickades till och godkänn
            medlemskapet. Företagets data och behörigheter hålls separerade från andra
            organisationer.
          </p>
        </div>

        <div className="p-7 sm:p-9">
          <div className="flex gap-4 rounded-2xl bg-zinc-50 p-5">
            <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold">Företagsmedlemskap</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                När du accepterar kopplas din användare till företaget och din personpost
                i Personal & UE.
              </p>
            </div>
          </div>

          {status === "error" && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {message}
            </div>
          )}
          {status === "success" && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {message}
            </div>
          )}

          <button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={status === "saving" || status === "success" || !token}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-5 w-5" />
            {status === "saving"
              ? "Kontrollerar inbjudan…"
              : status === "success"
                ? "Inbjudan accepterad"
                : "Logga in och acceptera"}
          </button>
        </div>
      </section>
    </main>
  );
}
