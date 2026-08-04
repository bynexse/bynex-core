# Supabase för Bynex

Applikationen fungerar fortsatt i lokalt pilotläge utan nycklar. De skyddade produktionsvägarna `/app`, `/portal` och `/api/private` öppnas först när Supabase är konfigurerat.

## Miljövariabler

Använd Supabases nya publicerbara nyckel från projektets **Connect**-dialog:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

En secret/service-role-nyckel får aldrig läggas i en `NEXT_PUBLIC_`-variabel eller skickas till webbläsaren.

## Offentlig beta

Registrering sker på `/signup` med verifierad e-post. Efter verifieringen kör
`/onboarding` databasfunktionen `provision_beta_organization`. Funktionen är
idempotent och skapar företag, ägarmedlemskap, 30 dagars provabonnemang och
modulrättigheter i samma transaktion.

I Supabase Auth ska följande adresser tillåtas innan betan öppnas:

```text
Site URL: https://bynex.se
Redirect URL: https://bynex.se/auth/callback
```

Konfigurera egen SMTP för skarp publik testning. Supabases inbyggda e-posttjänst
är endast avsedd för begränsad utveckling och har låg sändningsgräns.

Modulåtkomst lagras i `organization_module_entitlements` och läses genom den
RLS-säkrade vyn `active_organization_module_entitlements`. Appen visar endast
de moduler som hör till företagets aktiva provperiod eller abonnemang.

## Databasflöde

Källan till schemat ligger i `supabase/schemas/01_core.sql`. När Supabase CLI kan köras tillsammans med Docker genereras och verifieras migrationen från det deklarativa schemat:

```bash
npx supabase init
npx supabase start
npx supabase db diff -f core-multi-tenant-flow
npx supabase db reset
```

Granska alltid den genererade migrationen. För en länkad stagingmiljö används först `supabase db push --dry-run`; produktionsdata får aldrig seedas eller återställas med `db reset`.

## Säkerhetsmodell

- Serverkod verifierar sessionen med `getClaims()`, inte `getSession()`.
- Klienten använder endast publicerbar nyckel; RLS avgör vilka rader användaren får läsa och ändra.
- Företagsmedlemskap kontrolleras i en låst `private`-funktion vars exekvering endast ges till autentiserade användare.
- Kundportalen läser publicerade kundversioner och får inte direktåtkomst till internpris, löner, marginaler eller interna artefakter.
