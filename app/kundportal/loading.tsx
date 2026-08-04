import Image from "next/image";
import styles from "./kundportal.module.css";

export default function CustomerPortalLoading() {
  return (
    <main className={styles.statePage} aria-busy="true" aria-live="polite">
      <section className={styles.stateCard}>
        <Image src="/brand/bynex-wordmark.png" width={148} height={40} alt="Bynex" priority />
        <h1>Öppnar din kundportal</h1>
        <p>Vi verifierar din behörighet och hämtar endast material som har publicerats för dig.</p>
      </section>
    </main>
  );
}
