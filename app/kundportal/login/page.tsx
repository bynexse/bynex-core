"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "../kundportal.module.css";

export default function CustomerPortalLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=/kundportal`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className={styles.statePage}>
      <section className={`${styles.stateCard} ${styles.loginCard}`}>
        <Image src="/brand/bynex-wordmark.png" width={148} height={40} alt="Bynex" priority />
        <div className={styles.loginShield}><ShieldCheck aria-hidden="true" /></div>
        <p className={styles.eyebrow}>Säker kundportal</p>
        <h1>Öppna ditt projekt</h1>
        <p>Logga in med samma e-postadress som din inbjudan. Vi skickar en personlig engångslänk.</p>

        {status === "sent" ? (
          <div className={styles.loginSuccess} role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>Kontrollera din e-post och öppna länken på samma enhet.</span>
          </div>
        ) : (
          <form className={styles.loginForm} onSubmit={signIn}>
            <label htmlFor="customer-email">E-postadress</label>
            <div className={styles.loginInput}>
              <Mail aria-hidden="true" />
              <input
                id="customer-email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="namn@foretag.se"
              />
            </div>
            <button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
            </button>
            {status === "error" && <p role="alert">Inloggningen kunde inte startas. Kontrollera adressen och försök igen.</p>}
          </form>
        )}
      </section>
    </main>
  );
}
