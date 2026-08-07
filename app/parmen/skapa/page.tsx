"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";

import Logo from "@/components/layout/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function CreateBinderAccountPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setStatus("error");
      setMessage("Lösenorden är inte likadana.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Bynex-inloggningen är inte konfigurerad.");
      return;
    }

    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=/parmen/start`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName.trim(), intended_product: "personal_binder" },
      },
    });

    if (error) {
      setStatus("error");
      setMessage(
        error.message.toLowerCase().includes("already")
          ? "Det finns redan ett konto med e-postadressen. Logga in i stället."
          : "Kontot kunde inte skapas. Kontrollera uppgifterna och försök igen.",
      );
      return;
    }

    if (data.session) {
      router.replace("/parmen/start");
      router.refresh();
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-zinc-950">
      <section className="w-full max-w-lg rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-xl sm:p-10">
        <Link href="/parmen" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Till Bynex Pärmen
        </Link>
        <div className="mt-8"><Logo priority /></div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">14 dagar kostnadsfritt</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Skapa ditt Pärm-konto</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Först skapar du en säker inloggning. Därefter lägger du till fastigheten och väljer månads- eller årsbetalning som börjar efter provperioden.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
            <CheckCircle2 className="mb-3 h-6 w-6" />
            <p className="font-semibold">Kontrollera din e-post</p>
            <p className="mt-2 leading-6">Verifieringslänken öppnar nästa steg där fastigheten registreras.</p>
          </div>
        ) : (
          <form onSubmit={signUp} className="mt-8 space-y-4">
            <Field label="Ditt namn" type="text" value={fullName} onChange={setFullName} autoComplete="name" />
            <Field label="E-post" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="namn@exempel.se" />
            <Field label="Välj lösenord" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} helper="Minst 10 tecken." />
            <Field label="Upprepa lösenordet" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" minLength={10} />
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
              {status === "sending" ? "Skapar konto…" : "Fortsätt till fastigheten"}
            </button>
            {status === "error" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          </form>
        )}

        <div className="mt-7 flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          Dokumenten lagras privat. Bilder analyseras inte av Bynex Smart om du inte uttryckligen väljer dem senare.
        </div>
        <p className="mt-7 text-center text-sm text-zinc-500">
          Har du redan konto? <Link href="/login?next=/parmen/start" className="font-semibold text-zinc-950 underline">Logga in</Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength = 2,
  helper,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        required
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        className="input"
      />
      {helper && <span className="mt-2 block text-xs text-zinc-500">{helper}</span>}
    </label>
  );
}
