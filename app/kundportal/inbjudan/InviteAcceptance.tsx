"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";

export default function InviteAcceptance({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token] = useState(initialToken);
  const [status, setStatus] = useState<"checking" | "login" | "sending" | "sent" | "accepted" | "invalid">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (token) window.history.replaceState({}, "", "/kundportal/inbjudan");
    let active = true;
    void fetch("/api/public/customer-portal/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(token ? { token } : {}) })
      .then(async (response) => ({ response, result: await response.json().catch(() => null) as { error?: string } | null }))
      .then(({ response, result }) => {
        if (!active) return;
        if (response.ok) { setStatus("accepted"); setTimeout(() => router.replace("/kundportal"), 700); }
        else if (response.status === 401 && token) setStatus("login");
        else { setMessage(result?.error ?? "Inbjudan kunde inte öppnas."); setStatus("invalid"); }
      });
    return () => { active = false; };
  }, [router, token]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("sending");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/public/customer-portal/invites/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, email: values.email, fullName: values.fullName }) });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (response.ok) setStatus("sent");
    else { setMessage(result?.error ?? "Inloggningslänken kunde inte skickas."); setStatus(response.status === 403 ? "invalid" : "login"); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-5 py-12 text-zinc-950">
    <section className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-xl">
      <Image src="/brand/bynex-wordmark.png" width={148} height={40} alt="Bynex" priority />
      <div className="mt-8 inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-800"><ShieldCheck className="h-7 w-7" /></div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Säker kundportal</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Acceptera din inbjudan</h1>
      {status === "checking" && <p className="mt-4 text-sm text-zinc-600">Kontrollerar engångslänken…</p>}
      {status === "accepted" && <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-950"><CheckCircle2 className="mb-3 h-6 w-6" />Åtkomsten är aktiverad. Kundportalen öppnas nu.</div>}
      {status === "sent" && <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-950"><Mail className="mb-3 h-6 w-6" />Kontrollera din e-post och öppna Bynex-länken på samma enhet. Inbjudan binds först efter verifierad inloggning.</div>}
      {status === "login" && <><p className="mt-4 text-sm leading-6 text-zinc-600">Ange exakt samma e-postadress som inbjudan skickades till. Ett konto skapas endast när den personliga engångslänken har verifierats.</p><form onSubmit={start} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Namn<input name="fullName" required minLength={2} maxLength={160} autoComplete="name" className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 font-normal" /></label><label className="block text-sm font-semibold">E-postadress<input name="email" required type="email" maxLength={254} autoComplete="email" className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 font-normal" /></label><button className="w-full rounded-xl bg-zinc-950 px-5 py-4 font-semibold text-white">Verifiera och skicka inloggningslänk</button></form></>}
      {status === "invalid" && <div className="mt-6 rounded-2xl bg-red-50 p-5 text-sm text-red-800" role="alert">{message || "Inbjudan är ogiltig, använd eller har gått ut. Be projektets kontaktperson om en ny länk."}</div>}
      {status === "sending" && <p className="mt-6 text-sm text-zinc-600">Verifierar inbjudan och skickar e-post…</p>}
    </section>
  </main>;
}
