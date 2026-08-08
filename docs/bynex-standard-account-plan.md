# Bynex standardkontoplan 2026

Bynex standardkontoplan är en självständigt framtagen, intern kontoplanskatalog för svenska små och medelstora företag med extra täckning för bygg, service och entreprenad.

Den är **inte** den officiella BAS-kontoplanen och får inte marknadsföras, märkas eller exporteras som BAS. Syftet är att ge Bynex en bred och fungerande kontokatalog tills bolaget köper rätt maskinläsbar BAS-licens.

## Omfattning

Version 2026.1 innehåller 482 sökbara konton i kontoklass 1–8 och omfattar bland annat:

- tillgångar, eget kapital, skulder och periodiseringar
- svensk och internationell försäljning
- projektintäkter, ÄTA, material och maskiner
- underentreprenörer, inhyrd personal och omvänd byggmoms
- rörelsekostnader, fordon, verktyg, lokaler och administration
- löner, traktamente, arbetsgivaravgifter och pensioner
- avskrivningar, finansiella poster, bokslutsdispositioner och skatt

Kontona ligger i den globala katalogen men massaktiveras inte i varje företag. Företagets aktiva kontoplan hålls enkel och konton aktiveras först när de behövs eller när en behörig användare godkänner Bynex Smarts förslag.

## Säker installation

Katalogen installeras i tre steg:

1. katalogen skapas i utkastläge
2. kontoklass 1–8 läses in och valideras var för sig
3. katalogen aktiveras endast om exakt 482 unika fyrsiffriga konton finns och samtliga åtta kontoklasser är representerade

Aktiveringen byter plattformsstandard, flyttar företag som fortfarande använder den begränsade startkatalogen och länkar redan aktiva företagskonton till motsvarande katalogkonto. Den skapar inte hundratals aktiva företagskonton och ändrar inte historiska verifikationer.

## Granskning före lansering

Kontonamn, kontotyp, normal saldo, momsmarkeringar, sökord samt boksluts- och skatteanvändning ska granskas av svensk redovisningskompetens före offentlig pilot eller marknadslansering. Katalogmetadata markerar därför `accounting_review_required_before_public_launch`.

## Senare officiell BAS

Kontoplansmotorn är fortsatt förberedd för en licensierad maskinläsbar BAS-version. När licensen köps installeras BAS som en separat versionerad katalog med licensreferens och SHA-256-bevis. Företagen kan därefter byta katalog kontrollerat utan att tidigare bokföring skrivs om.
