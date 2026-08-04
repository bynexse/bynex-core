import styles from "./pilot-login.module.css";

type PilotLoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function PilotLoginPage({ searchParams }: PilotLoginPageProps) {
  const params = await searchParams;

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="pilot-title">
        <div className={styles.brand}>BYNEX</div>
        <div className={styles.badge}>Privat pilot</div>
        <h1 id="pilot-title">Välkommen in</h1>
        <p className={styles.intro}>
          Den här versionen är endast öppen för Bynex testgrupp.
        </p>

        {params.error === "1" ? (
          <p className={styles.error} role="alert">
            Användarnamnet eller koden stämmer inte. Försök igen.
          </p>
        ) : null}

        <form className={styles.form} action="/api/pilot/session" method="post">
          <input type="hidden" name="next" value={safeNextPath(params.next)} />
          <label>
            Användarnamn
            <input
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              autoFocus
            />
          </label>
          <label>
            Personlig testkod
            <input
              name="accessCode"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Öppna Bynex</button>
        </form>

        <p className={styles.note}>
          Testmiljö · Funktioner och innehåll kan uppdateras löpande.
        </p>
      </section>
    </main>
  );
}
