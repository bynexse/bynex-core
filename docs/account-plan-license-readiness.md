# Licensberedskap för kontoplanskatalog

Bynex använder en begränsad intern startkontoplan tills en kommersiellt licensierad maskinläsbar katalog har köpts och accepterats.

## När licensen är köpt

1. Spara order- eller avtalsreferensen i Bynex HQ.
2. Normalisera leverantörens källdata till Bynex katalogformat utan att ändra kontonas innebörd.
3. Kontrollera katalogkod, versionsetikett, publiceringsdatum och föregående version.
4. Importera filen genom den skyddade HQ-funktionen.
5. Låt servern beräkna SHA-256 och jämför beviset med den installerade katalogversionen.
6. Verifiera antal konton, dubbletter, kontotyper, normalsaldo och licensomfattning.
7. Gör katalogen till standard för nya företag först efter ett uttryckligt plattformsbeslut.
8. Låt befintliga företag granska versionsbytet; inga konton massaktiveras och ingen historisk verifikation skrivs om.

## Grundprinciper

- Katalogen och företagets aktiva konton är separata.
- Ett katalogkonto blir bokföringsbart först efter uttrycklig aktivering.
- Bynex Smart får föreslå men aldrig aktivera eller bokföra utan ett mänskligt beslut.
- Samma katalogversion med ett annat innehåll stoppas.
- Källhash, licensreferens, aktör, tidpunkt och antal konton sparas som installationsbevis.
- Själva licensierade källdatan ska inte läggas i Git-repot.
