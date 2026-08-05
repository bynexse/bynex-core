# Changelog

## Pågående – live-data och sammanhängande beta

- Ersatte exempelmoduler i den inloggade arbetsytan med Supabase-baserade flöden.
- Lade till företagsinställningar, modulrättigheter, Bynex Tid/frånvaro, projekt, personal, offert, ÄTA, fakturering, material, driftroller, ekonomi och kundportal.
- Lade till Bynex HQ med plattformsekonomi, företag, användare, support och åtgärdsköer.
- Säkrade Bynex Smart med inloggning, företags- och projektgräns samt mänsklig granskning.
- Lade till kundportalens ettårsregel och frivillig Digitalpärm.
- Förberedde automatisk, idempotent fakturakö för Digitalpärmen utan separat betalmetod i kundgränssnittet.
- Införde Bynex visuella identitet och tog bort gamla Finder-dubbletter.
- Lade till en verklig maskinpark med QR-etiketter, plats- och utlåningshistorik, serviceplaner och Bynex Smart-sökning.
- Lade till privata kvitton och maskinfiler, händelsestyrda stöldärenden och låsta fler-maskinsunderlag för polis/försäkring.
- Förberedde ett neutralt GPS-adapterregister som endast visar verifierade leverantörskopplingar.
- Lade till säker projektbunden kundportal-inbjudan med engångslänk, e-postbindning och återkallning.
- Kopplade Maskiner & tillgångar till Bynex Bygg, Fastighet och Komplett med databasstyrt modullås.

## v1.1.1 – Repository Cleanup

- Tog bort Finder-dubbletter av konfigurations-, package- och dokumentationsfiler.
- Tog bort `node_modules`, `.next`, `.DS_Store` och Git-metadata från leveranspaketet.
- Behöll en kanonisk konfiguration för Next.js, TypeScript, Tailwind och PostCSS.
- Samlade projektets aktuella status i en enda README, CHANGELOG och QA-rapport.

## v1.1.0 – Offert 3.0

- AI-genererad kalkyl och offert.
- Digitalt kundflöde och signering.
- Automatisk projektgenerering.

## v1.0.0 – ÄTA 3.0

- AI-ÄTA, signeringskedja och fakturakö.
