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

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS 3
- Lucide React

## Starta lokalt

```bash
npm install
npm run dev
```

Öppna `http://localhost:3000`.

## Kvalitetskontroll

```bash
npm run build
```

## Produktionsgräns

Pilotflödet och tidrapporteringen sparar data lokalt i webbläsaren. Bynex Smart har ett lokalt reservläge. Multi-tenant-databas, autentisering, BankID, e-post/e-faktura och externa leverantörskopplingar måste anslutas och säkerhetstestas innan skarp kunddrift.

Bynex Bokföring ingår inte i den aktuella leveransprioriteringen. Fokus ligger på byggflödet, kundportalen och projektets operativa kärna.
