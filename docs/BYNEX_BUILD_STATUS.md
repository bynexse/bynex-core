# Bynex – byggstatus

Senast uppdaterad: 2026-08-04

Det här dokumentet är den gemensamma kontrollpunkten för produktbygget. En modul markeras inte som klar förrän den använder riktig företagsdata, respekterar roll- och modulbehörighet, har ett fungerande tomläge, saknar synlig testdata och klarar relevanta tester samt produktionsbygget.

## Definition av klar

- Riktig data från Supabase; ingen hårdkodad kund-, projekt-, personal- eller ekonomidata.
- Företagsisolering med RLS och serververifierad användare.
- Behörighet per roll och abonnemangsmodul.
- Tydliga tom-, laddnings- och feltillstånd.
- Kritiska beslut och statusbyten valideras på servern.
- Mobil och desktop fungerar utan onödigt knappande.
- Riktad lint, TypeScript och Next.js-produktionsbygge är godkända.
- Säkerhets- och isoleringstest finns för känsliga flöden.

## Modulordning

| Ordning | Modul | Status | Nästa leverans |
|---:|---|---|---|
| 1 | Översikt | Klar lokalt | Riktiga nyckeltal, senaste händelser och byggstatus från företagets data. |
| 2 | Projekt | Klar lokalt | Riktig projektlista, sökning, skapande, detaljvy, status och framdrift. |
| 3 | Personal & UE | Klar lokalt | Riktig personal, UE/konsulter, kompetenser, intyg och skyddade ersättningsuppgifter. |
| 4 | Bynex Tid | Klar lokalt | In-/utcheckning, rast, GPS, historik och chefsattest är kopplade; mobil samtidighet återstår i sluttest. |
| 5 | Tid & Lön | Grund klar lokalt | Attest, beräkning, låsning, utbetalningsunderlag och tomlägen. |
| 6 | Arbetsledaren | Ej kopplad | Dagens plan, resurser, hinder, material och Bynex Smart-råd. |
| 7 | Platschef | Ej kopplad | Projektportfölj, risk, ekonomi, avvikelse och beslutslista. |
| 8 | Material & inköp | Databasgrund klar | Egna priser, hyllpris, lager, leverans och stilleståndskalkyl. |
| 9 | Bynex Connect | Ej kopplad | Projekttråd, uppgifter, filer och behörighetsstyrda svar. |
| 10 | ÄTA | Databasgrund klar | Startbesked på plats, uppskattat pris, granskning och slutgodkännande. |
| 11 | Offerter | Databasgrund klar | Kunduppgifter, ROT/RUT, prisform, signering och projektstart. |
| 12 | Företagsinställningar | Grund klar lokalt | Roller, standardval, integrationer och moduladministration. |
| 13 | Bynex HQ | Klar lokalt | Företag, användare, abonnemang, ekonomi, 12-månadersprognos, historik samt riktig supportinkorg med prioritet och status. |

## Gemensamma produktdelar

| Del | Status |
|---|---|
| Publik startsida | Klar lokalt; utökad navigation, arbetsflöde, säkerhet och FAQ väntar på nästa GitHub-överföring. |
| Registrering och inloggning | Fungerar med Supabase e-postlänk; BankID/Freja kräver produktionsavtal. |
| Företags- och modulisolering | Installerad och tidigare testad; återtestas i full regression. |
| Bynex Smart | API-grund finns; ska kopplas behörighetsstyrt i varje modul. |
| Bynex HQ-behörighet | Christoffers konto är aktiverat som `platform_owner`; åtkomsten är separat från kundföretagens roller. |
| Support till HQ | Företag kan skapa och följa riktiga ärenden; HQ kan läsa, prioritera och ändra arbetsstatus. |
| GitHub/Vercel | `main` publiceras automatiskt av Vercel; aktuell lokala gren ligger före `origin/main`. |
| Domän | `bynex.se` och `www.bynex.se` är anslutna och verifierade i Vercel. |

## Aktuell kontrollpunkt

- Lokal gren: `codex/company-settings-core`
- Senaste lokala commit före denna statusfil: `0410b66 feat: make dashboard the live workspace hub`
- Produktbeslut: den separata vyn **Starta & genomför** är borttagen. Översikt är navet för hela arbetsflödet.
- Verifiering: riktad ESLint, TypeScript och ren Next.js-produktionsbyggnad är godkända för den aktuella kontrollpunkten.
- Nästa kodsteg: slutför **Tid & Lön**, därefter Arbetsledaren och Platschef.
- Strategisk framtidsmodul: **Enskild firma** med leverantörsfakturor, kvitton, bokföring, preliminärskatt, egenavgifter och tydligt märkt uppskattat disponibelt saldo. Den får inte försena kärnmodulerna ovan.
