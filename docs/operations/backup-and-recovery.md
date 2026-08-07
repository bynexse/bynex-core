# Bynex backup- och återställningsplan

## Syfte

Den här planen skiljer på tre saker som inte får blandas ihop:

1. **Leverantörsbackup av PostgreSQL** – verifieras i Supabase Dashboard.
2. **Separat kopia av Storage-objekt** – privata filer ligger inte i själva databasbackupen.
3. **Bynex beredskapsbevis** – aggregerad inventering, kontrollhash och dokumenterade återställningsövningar.

HQ-sidan `/admin/recovery` skapar inte en backup och kan inte återställa produktion. Den låser i stället ett säkert nuläge så att en senare återställning går att jämföra och verifiera.

## Grundregler

- Ingen återställningsknapp exponeras i Bynex.
- Produktion återställs aldrig utan uttryckligt plattformsgodkännande.
- Lösenord, anslutningssträngar, API-nycklar och service-role får aldrig skrivas i snapshots, övningsanteckningar, GitHub eller chatt.
- Återställningsprov görs i första hand lokalt, i staging eller i ett nytt isolerat Supabase-projekt.
- Externa sidoeffekter ska vara avstängda under provet: cron-jobb, webhooks, e-post, betalning, ekonomiintegrationer, GPS-ingest och andra utgående anslutningar.
- En databasåterställning är inte godkänd förrän även privata Storage-objekt och inloggning har verifierats.

## Leverantörsgränser

Supabase dokumenterar att betalda projekt har plattformsbackuper och att Point-in-Time Recovery kan aktiveras som tillägg. Den exakta aktiva retentionen och senaste återställningspunkten är inte tillgänglig för Bynex-applikationen och måste därför kontrolleras i Supabase Dashboard.

Supabase dokumenterar också att databasbackuper innehåller Storage-metadata men **inte själva filobjekten**. Bynex behandlar därför Storage som ett separat återställningsspår.

Referenser:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Normal rutin

### Varje vecka

1. Öppna HQ → Återställning.
2. Skapa en ny beredskapssnapshot.
3. Kontrollera att snapshoten visar:
   - aktuell Bynex-release,
   - senaste migrering,
   - rimliga radantal i kritiska tabeller,
   - förväntat antal privata buckets,
   - rimligt antal Storage-objekt och total storlek,
   - aktuella cron- och Realtime-antal.
4. Kontrollera i Supabase Dashboard att databasbackup eller PITR har en aktuell återställningspunkt.
5. Kontrollera att separat Storage-kopiering har lyckats enligt vald extern lagringsrutin.

### Varje månad

Genomför minst en isolerad återställningsövning:

- **Lokal verifiering** för schema, data och SQL-funktioner.
- **Staging-klon** för inloggning, RLS, API och utvalda privata filer.
- **Nytt återställningsprojekt** för full miljöberedskap utan att röra produktion.

Övningen registreras mot en oföränderlig `BY-REC-...`-snapshot och får ett `BY-DRILL-...`-ID.

### Varje kvartal

Genomför ett bredare prov i ett separat projekt med följande urval:

- en ägare och en anställd kan logga in,
- två företag kan inte se varandras data,
- minst ett projekt, en tidpost, en kundfaktura och en leverantörsfaktura stämmer mot snapshoten,
- minst fem privata filer från olika buckets kan öppnas,
- inga riktiga mejl, webhooks eller ekonomihändelser lämnar testmiljön,
- schemamigreringar, extensions och Realtime-tabeller är kontrollerade,
- resultatet registreras som verifierat eller misslyckat med saklig avvikelsebeskrivning.

## Databasdump för isolerat prov

Använd Supabase CLI från en betrodd administratörsdator. Spara aldrig anslutningssträngen i shell-historik, GitHub eller dokumentationen.

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"
```

Dumpar ska krypteras, åtkomstbegränsas, få dokumenterad retention och lagras utanför samma felzon som produktionen.

## Storage-spår

Storage-kopian måste hantera filbytes separat från databasen.

Minimikrav:

- alla privata buckets omfattas,
- objektets bucket, sökväg, storlek och versions-/kontrolluppgift kan verifieras,
- kopian är krypterad och åtkomstloggad,
- minst ett slumpmässigt urval återläses vid varje övning,
- raderade eller arkiverade filer följer beslutad retention,
- ingen publik bucket skapas för att förenkla backup.

Bynex-snapshoten lagrar endast aggregerade Storage-tal och aldrig filnamn eller innehåll.

## Återställning till nytt projekt

1. Välj en återställningspunkt före incidenten.
2. Skapa eller återställ till ett separat Supabase-projekt.
3. Stäng omedelbart av externa jobb och integrationer i kopian.
4. Kontrollera extensions, Auth-inställningar, API-nycklar, Realtime, Edge Functions och nätverksregler separat.
5. Återför Storage-objekten från den separata filkopian.
6. Kör verifieringslistan mot vald `BY-REC-...`-snapshot.
7. Registrera resultatet i HQ Återställning.
8. Flytta aldrig trafik till den återställda miljön innan plattformsägaren har godkänt resultatet.

## Produktionsincident

Vid misstänkt dataförlust:

1. Stoppa onödiga skrivningar och utgående integrationer.
2. Spara incidenttid, aktuell release och senaste kända korrekta händelse.
3. Skapa ingen ny "rensande" migrering innan återställningspunkten är säkrad.
4. Identifiera när felet började och välj närmaste säkra återställningspunkt före felet.
5. Prova återställningen isolerat först.
6. Verifiera databas, Auth och Storage separat.
7. Dokumentera uppskattad dataförlust, driftstopp och kvarstående risk.
8. Kräv uttryckligt plattformsgodkännande innan produktionsåterställning.
9. Efter återställning: rotera berörda hemligheter, återaktivera integrationer kontrollerat och skapa en ny beredskapssnapshot.

## Behöver Christoffer

Följande är kostnads- eller ägarbeslut och automatiseras inte:

- om Point-in-Time Recovery ska aktiveras och vilken retention som ska köpas,
- vilken extern lagringsleverantör och retention som ska användas för privata Storage-objekt,
- vilka personer som får godkänna en verklig produktionsåterställning,
- accepterad RPO (möjlig dataförlust) och RTO (accepterat driftstopp).

Dessa beslut blockerar inte inventering, dokumentation eller isolerade återställningsövningar.
