# Bynex Core

Bynex är en modulär Next.js/TypeScript-plattform med Bynex Workforce som bred produkt för tid, personal och lön, samt byggspecifika moduler för projekt, offert, ÄTA och material.

## Körbar pilot

Startsidan innehåller ett sammanhängande, lokalt sparat pilotflöde:

1. Kund och offert
2. Kundgodkännande
3. Automatisk projektstart
4. Tid, material och ÄTA med startbesked på plats
5. Låst fakturaunderlag och granskad kundportal

Övriga tillgängliga arbetsytor:

- Dashboard och Bynex Smart-sammanfattning
- Projekt och projektdetalj
- Tidrapportering
- Personal och underentreprenörer
- Tid & Lön
- Material & Inköp
- ÄTA
- Offert
- Bynex Connect
- Arbetsledar- och platschefsstöd

## Teknik

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 3
- Lucide React

## Starta lokalt

```bash
npm install
npm run dev
```

Öppna `http://localhost:3000`.

## Privat pilot

Pilotlåset aktiveras i hostingmiljön med följande servervariabler. Värdena ska
läggas som hemligheter i hostingen och aldrig sparas i GitHub:

```text
BYNEX_PILOT_GATE_ENABLED=true
BYNEX_PILOT_USERNAME=<ert användarnamn>
BYNEX_PILOT_ACCESS_CODE=<en lång personlig testkod>
BYNEX_PILOT_SESSION_SECRET=<minst 32 slumpmässiga tecken>
```

När låset är aktivt skyddas hela pilotytan av en signerad, HttpOnly-baserad
session. Testkoden skickas bara till servern och lagras inte i webbläsarens
JavaScript.

## Kvalitetskontroll

```bash
npm run build
```

## Produktionsgräns

Pilotflödet och tidrapporteringen sparar data lokalt i webbläsaren. Bynex Smart har ett lokalt reservläge. Multi-tenant-databas, autentisering, BankID, e-post/e-faktura och externa leverantörskopplingar måste anslutas och säkerhetstestas innan skarp kunddrift.

Bynex Bokföring ingår inte i den aktuella leveransprioriteringen. Fokus ligger på byggflödet, kundportalen och projektets operativa kärna.
