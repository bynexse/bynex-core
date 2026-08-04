# Databasens reproducerbarhet

## Nuvarande läge

De migrationer som Supabase registrerat i produktion finns nu i Git med exakt
versionsnummer och innehåll. `npm run test:migrations` kontrollerar att ingen
historisk produktionsmigration saknas, ändras i efterhand eller ersätts av en
annan fil med samma tidsstämpel.

Detta löser den tidigare historikdriften, men en helt tom databas kan ännu inte
återskapas enbart från `supabase/migrations`. Den äldsta registrerade
produktionsmigrationen förutsätter ett grundschema som skapades innan projektet
började versionshantera migrationer. `supabase/schemas/01_core.sql` är ett
separat kärnschema för PGlite-tester och motsvarar inte hela det äldre
produktionsgrundschemat.

## Säker väg till en fullständig baslinje

1. Kör en officiell `supabase db dump` mot det länkade projektet från en
   autentiserad utvecklingsdator.
2. Granska dumpen så att ingen data, hemlighet eller ägarspecifik konfiguration
   följer med; endast schema ska versionshanteras.
3. Lägg dumpen som en baslinje före version `20260804093407` och prova den i en
   ny lokal Supabase-instans med `supabase db reset`.
4. Jämför tabeller, funktioner, vyer, RLS-policyer, triggers och behörigheter mot
   produktion innan baslinjen får användas för en ny miljö.
5. Därefter ska alla förändringar gå via nya framåtriktade migrationer. Redigera
   aldrig de historiska filerna i manifestet.

Tills detta är gjort är `npm run test:db` ett kärnschematest och
`npm run test:migrations` ett historik-/integritetstest, inte ett bevis på att
en full `supabase db reset` från tom databas är produktionsidentisk.
