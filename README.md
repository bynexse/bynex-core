# Bynex Core

Bynex är en modulär Next.js-plattform för företag, byggprojekt och fastighetens långsiktiga dokumentation. Den inloggade produkten använder Supabase Auth, företagsisolerad data och rollstyrd åtkomst. Kunddata eller ekonomidata ersätts aldrig med exempelposter när en tabell är tom eller inte kan läsas.

## Aktuella arbetsytor

- Bynex Tid: tid, GPS-policy, raster, frånvaro, attest och löneunderlag
- Projekt, personal och underentreprenörer
- Offert, ÄTA och fristående/projektbaserad fakturering
- Material, inköp, arbetsledare, platschef och Bynex Connect
- Maskiner och tillgångar med QR, plats/lån, service, privata bevisfiler och stöldunderlag
- Ekonomikopplingar, enskild firma och bokslutsunderlag
- Kundportal, fastighetsdata och frivillig Digitalpärm
- Bynex HQ för plattformsekonomi, företag, användare och support
- Bynex Smart med företagets egna behörigheter och projekt som datagräns

## Teknik

- Next.js 16 och React 19
- TypeScript och Tailwind CSS 3
- Supabase Auth/Postgres/Storage med RLS
- Vercel-kompatibel drift

## Starta lokalt

```bash
npm install
npm run dev
```

Öppna `http://localhost:3000`.

## Kvalitetskontroll

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db
node --test tests/auth/*.test.mjs tests/smart/*.test.mjs
```

## Privat pilot och offentlig beta

Pilotlåset kan aktiveras med `BYNEX_PILOT_GATE_ENABLED` samt serverhemligheterna för pilotanvändare, åtkomstkod och sessionssignering. Hemligheter ska ligga i hostingmiljön och aldrig i GitHub.

När pilotlåset är avstängt kan besökare skapa testkonto via `/signup`. Företagsanvändare går till `/app`; inbjudna slutkunder använder `/kundportal/login` och `/kundportal`.

## Produktionsgränser

Externa avtal och konfiguration krävs fortfarande för BankID/Freja, e-faktura/Peppol, faktura-PDF/leverans, bankkoppling, myndighetsinlämning samt respektive bokförings- och leverantörsadapter. Gränssnittet ska endast visa en koppling som aktiv när den faktiskt är verifierad.

Bynex Smart skapar granskningsbara underlag. Ritningar, konstruktion, el, VVS, myndighetskrav, bindande pris, bokslut och betalningsbeslut kräver rätt behörighet och mänsklig kontroll.
