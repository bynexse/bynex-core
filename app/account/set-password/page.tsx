"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/layout/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("Lösenorden är inte likadana.");
      return setStatus("error");
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return setStatus("error");
    setStatus("saving");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("Länken kan ha gått ut. Begär i så fall en ny återställningslänk.");
      return setStatus("error");
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-9">
        <div><Logo priority /></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Välj nytt lösenord</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Använd minst 10 tecken och ett lösenord som du inte använder någon annanstans.</p>
        <form onSubmit={save} className="mt-8 space-y-4">
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Nytt lösenord</span><input required minLength={10} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input" /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Upprepa lösenordet</span><input required minLength={10} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input" /></label>
          <button disabled={status === "saving"} className="w-full rounded-2xl bg-[#b8bdc5] px-5 py-4 text-sm font-semibold text-[#090a0c] disabled:opacity-60">{status === "saving" ? "Sparar…" : "Spara lösenord"}</button>
          {status === "error" && <p className="text-sm text-red-700">{message || "Lösenordet kunde inte sparas."}</p>}
        </form>
      </section>
    </main>
  );
}
