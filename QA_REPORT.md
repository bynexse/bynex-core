# QA-rapport – aktuell arbetskopia

## Godkända kontroller

- TypeScript: `npm run typecheck`
- ESLint: `npm run lint`
- Next.js produktionsbygge: `npm run build`
- Databaskärna: `npm run test:db`
- Bynex Smart-kommandon och säkra auth-redirecter: Node-tester
- Digitalpärm: idempotent PDF-, leverans- och bokföringskö i isolerat databastest
- Maskinpark: QR, företagsisolering, underhållsgranskning, stöldhändelser och låsta bevispaket
- Privat maskindokumentation: kvitto/bild/manual/intyg via kortlivad signerad fillänk
- Kundportal: tokenbunden inbjudan, exakt e-postbindning, engångsanvändning, återkallning och revisionsspår
- Modulrättigheter: Maskiner & tillgångar spärras i databasen utan aktivt paket eller tillägg
- `git diff --check`

## Säkerhetskontroller

- Bynex Smart kräver verifierad inloggning, aktiv organisation och aktivt medlemskap.
- Projektbaserad bild- och arbetsdagsanalys verifierar att projektet tillhör aktuellt företag.
- Företagsdata används aldrig över organisationsgränser.
- Kundportalens publicerade kundversion är separerad från företagets interna data.
- Auth-callback tillåter endast uttryckligen godkända interna destinationer.
- GPS-positioner kan endast matas in av en framtida verifierad adapter; klienter kan inte skapa falska snapshots.
- Tillverkar-ID, stöldstatus och bevispaket har separata spärrar mot självcertifiering och efterhandsändring.

## Kvar före skarp betalande drift

- Gör hela Supabase-schemat reproducerbart från ett tomt projekt.
- Konfigurera juridisk fakturautställare, privat PDF-lagring och verkliga leverans-/bokföringsadaptrar.
- Aktivera och verifiera externa avtal för BankID/Freja, Peppol/e-faktura, banker, bokföringssystem och myndighetsinlämning.
- Aktivera läckta-lösenordsskyddet i Supabase Auth.
- Genomför last-, återställnings- och incidenttester innan 10 000 företag ansluts.
