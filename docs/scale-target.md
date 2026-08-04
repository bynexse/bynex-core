# Kapacitetsmål för Bynex

Bynex dimensioneras för minst **10 000 företag** och **40 000 aktiva användare**. Det är ett arkitekturkrav, inte ett påstående om att ett visst driftpaket redan är lasttestat.

## Regler som gäller från start

- Alla affärsrader är företagsägda och skyddas med Row Level Security.
- Alla vanliga listfrågor börjar med `organization_id`, använder stabil sortering och cursorbaserad paginering.
- Index leder med företag och därefter flödets vanligaste status-/tidsfält.
- Kundportalen läser endast granskade publiceringsposter, aldrig interna projekttabeller direkt.
- Låsta offerter och fakturaunderlag får inte ändras i efterhand.
- Dokumenttolkning, utskick, synk mot leverantörer, e-faktura och Bynex Smart körs som köade jobb med återförsök och dead-letter-läge.
- Ingen extern adapter får hålla en webbförfrågan öppen medan en tredjepart behandlar jobbet.
- Större rapporter byggs från sammanställningar eller repliker och får inte skanna alla transaktionsrader i den interaktiva databasen.

## Mätbara acceptanskriterier före produktion

Följande ska verifieras i en produktionslik stagingmiljö:

1. 40 000 användare och 10 000 företag kan seedas reproducerbart.
2. Minst 1 000 samtidiga aktiva sessioner kan köra normala projektflöden utan företagsläckage.
3. P95 för vanliga tenantfiltrerade läsningar ligger under 300 ms från API:t i vald driftregion.
4. Skapande av tid, material och ÄTA är idempotent och klarar säkra återförsök.
5. Köjobb kan återupptas efter avbrott utan dubbla fakturor, mejl eller bokföringsexporter.
6. RLS-testsviten provar minst två företag och både tillåtna och förbjudna roller för varje exponerad tabell.
7. Återläsning från backup provas regelbundet och kontrollerar både radantal, checksummor och centrala affärsinvarianter.

Exakta instansstorlekar, anslutningspool och kökapacitet väljs efter lasttestet; de ska inte hårdkodas i produktlogiken.
