"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import styles from "./kundportal.module.css";

export default function CustomerPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.statePage}>
      <section className={styles.stateCard}>
        <AlertCircle aria-hidden="true" />
        <h1>Något gick fel</h1>
        <p>Kundportalen kunde inte läsas just nu. Ingen obehörig information har visats.</p>
        <button className={styles.secondaryButton} type="button" onClick={reset}>
          <RotateCcw aria-hidden="true" /> Försök igen
        </button>
      </section>
    </main>
  );
}
