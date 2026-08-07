# Bynex Bokföring – kontrollmatris för svensk regelefterlevnad

**Version:** 2026-08-07  
**Omprövning:** minst kvartalsvis och alltid efter ändrad lag, BFN-vägledning, myndighetsgränssnitt eller bokföringsmotor  
**Status:** teknisk arbetsgrund – inte juridisk certifiering

## Syfte

Den här matrisen binder samman svensk bokföringsrätt, god redovisningssed och Bynex tekniska kontroller. Ett enkelt användarflöde får aldrig innebära att spårbarhet, periodkontroll, verifikationer, arkivering eller behandlingshistorik tas bort.

Bynex ska kunna visa vilket krav en kontroll skyddar, var kontrollen körs, hur den testas och vilket revisionsbevis som skapas.

## Primära officiella källor

- Bokföringslag (1999:1078), gällande lydelse: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/bokforingslag-19991078_sfs-1999-1078/
- Årsredovisningslag (1995:1554), gällande lydelse: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arsredovisningslag-19951554_sfs-1995-1554/
- Bokföringsnämndens vägledningar: https://www.bfn.se/informationsmaterial/vagledningar/
- Bokföringsnämndens aktuella redovisningsregler: https://www.bfn.se/
- Skatteverket – företag, bokföring, moms, arbetsgivardeklaration och deklaration: https://www.skatteverket.se/foretag.html
- Integritetsskyddsmyndigheten – dataskydd för verksamheter: https://www.imy.se/verksamhet/dataskydd/

Källorna ska läsas i gällande lydelse. En hårdkodad regel eller deadline får inte leva vidare utan ett versions- och omprövningsdatum.

## Kontrollmatris

| ID | Kravområde | Normgrund | Bynex-kontroll | Revisionsbevis | Status |
|---|---|---|---|---|---|
| BFL-01 | Alla affärshändelser ska kunna bokföras löpande och presenteras i registrerings- och systematisk ordning | BFL 4 kap. 1–2 §§, 5 kap. 1–3 §§ | Verifikationsserie, datum, räkenskapsår, period och huvudboksrader är obligatoriska. Händelser utan stöd för aktuell metod stoppas fail-closed. | Verifikationsnummer, datum, serie, period, skapad/bokförd tid och användare | Grund finns; utökad metodmatris återstår |
| BFL-02 | Varje bokföringspost ska ha en verifierbar verifikation | BFL 4 kap. 1 §, 5 kap. 6–10 §§ | Originalfil eller tillåten hänvisningsverifikation måste finnas före automatisk leverantörsfakturabokföring. Motpart, händelsedatum, belopp, beskrivning och identifierare kontrolleras. | Originalfil, SHA-256, dokument-ID, faktura-ID och verifikat-ID | Grund finns |
| BFL-03 | Sambandet mellan verifikation och bokföringspost ska vara enkelt att följa | BFL 5 kap. 7 § | Stabil tvåvägslänk mellan dokument, leverantörsfaktura, bankhändelse, projekt och verifikat. | Bevisgraf/referenser i export och UI | Delvis; full bevisgraf återstår |
| BFL-04 | Rättelser ska visa när och av vem de gjordes | BFL 5 kap. 5 och 9 §§ | Bokförda poster skrivs inte över. Rättelse och återföring skapas som nya, länkade poster. | Ursprungspost, rättelsepost, orsak, användare och tid | Grund finns; komplett rättelse-UI återstår |
| BFL-05 | Systemdokumentation och behandlingshistorik ska göra system och bearbetning begripliga | BFL 4 kap. 1 § och 5 kap. 11 § | Versionsstyrd systembeskrivning, kontrollkatalog, migrationshistorik och oföränderlig händelselogg. | Releaseversion, funktion/RPC, indatahash, utdata, användare och tidsstämpel | Pågående |
| BFL-06 | Räkenskapsinformation ska bevaras ordnat, betryggande och överskådligt i sju år | BFL 7 kap.; BFN vägledning Bokföring | Privata filer, tenant-isolering, retention-lås, export och verifierad återläsning. Ingen hårdradering under lagstadgad tid. | Retention-policy, backupinventering, restore-test och exportmanifest | Grund finns; full retentionmotor återstår |
| BFL-07 | Överföring mellan format får inte innebära risk att information förändras eller försvinner | BFL 7 kap. 6 § | Originalhash före/efter överföring, filmetadata, versionshistorik och blockerad ersättning av låst original. | Hashjämförelse, överföringslogg och källformat | Delvis |
| BFL-08 | Bokföringen ska följa vald bokföringsmetod | BFL 5 kap. 2 § och BFN vägledning | Företagets metod lagras. Enklicksflödet bokför leverantörsfaktura direkt endast för stödd fakturametod; kontantmetod väntar på betalningsmatchning. | Metod, regelbeslut och blockeringsorsak | Grund finns |
| BFL-09 | Bokföringsperioder och räkenskapsår ska skydda historiken | BFL 3, 5 och 6 kap.; BFN vägledningar | Endast öppen period tar nya poster. Låsning och stängning loggas. Återöppning kräver särskild roll, orsak och bevis. | Periodstatus, låstid, låst av, återöppningsorsak | Grund finns; fyra-ögon återöppning återstår |
| BFL-10 | Bokföringsposter ska vara balanserade och möjliga att kontrollera | God redovisningssed och dubbel bokföring | Debet och kredit måste balansera inom tillåten avrundning. Nollrader förbjuds. Samma anrop bokför atomiskt. | Radsumma, transaktions-ID och innehållshash | Grund finns |
| VAT-01 | Moms ska beräknas och rapporteras utifrån rätt händelse, period och kod | Mervärdesskattelag, skatteförfarandelag, Skatteverkets aktuella vägledning | Momskod, belopp och period valideras. Avvikande eller blandad moms kräver särskilt kontrollerat flöde. | Momskod per rad, momsrapportversion och avstämningsbevis | Grundläggande kod finns; full momsrapport återstår |
| TAX-01 | Skatte- och arbetsgivardeklarationer ska bygga på avstämda, låsta underlag | Skatteförfarandelag och Skatteverkets aktuella specifikationer | Deklarationsunderlag skapas från låst period och visar differenser mot bokföring, lön och skattekonto. | Underlagsversion, signering, skickad fil/API-kvitto och rättelsehistorik | Återstår |
| YEAR-01 | Rätt avslutsregelverk ska användas per företagsform och räkenskapsår | BFL 6 kap., ÅRL, BFN K1/K2/K3 och Årsbokslut | Företagsform, storlek, räkenskapsår och valt ramverk styr tillåtna flöden. Regelverksversion binds till året. | Ramverk/version, kontroller, låst årsrapport och inlämningskvitto | Delvis |
| GDPR-01 | Personuppgifter ska ha rättslig grund, ändamål, åtkomstskydd och retention | GDPR och IMY:s vägledning | Datakarta, minsta behörighet, loggning, maskering, export och rättelse/radering där bokföringslag inte kräver fortsatt bevarande. | Behandlingsregister, åtkomstlogg, export och gallringsbeslut | Pågående |
| SEC-01 | Ekonomidata ska skyddas mot obehörig åtkomst och sammanblandning | GDPR art. 5 och 32 samt intern säkerhetsmodell | Tenant-ID på alla ekonomiska objekt, RLS, servervaliderad aktuell organisation och rolltester. | RLS-test, rollmatris, incidentlogg och penetrationstest | Grund finns |
| OPS-01 | Kunden måste kunna få ut och återläsa sin räkenskapsinformation | BFL arkiverings- och presentationskrav | SIE och kompletterande maskinläsbar export med original, länkar, kontoplan, perioder och behandlingshistorik. Återläsning testas i isolerad miljö. | Exportmanifest, checksumma och restore-rapport | SIE-grund finns; full portabilitet återstår |

## Obligatoriska tekniska egenskaper

Varje bokförande serverfunktion ska så långt det är tillämpligt vara:

- tenant- och rollkontrollerad
- fail-closed
- atomisk
- idempotent
- explicit versionsstyrd
- skyddad mot direkt klientanrop till intern motor
- spårbar till användare, tid, källa och original
- oföränderlig efter bokföring, med rättelse genom ny post
- testad för normalfall, dubblett, obehörig roll, låst period och omklick

## Gräns mellan Smart och beslut

Bynex Smart får:

- läsa och strukturera underlag
- föreslå leverantör, projekt, konto, moms och period
- matcha bankhändelser och upptäcka avvikelser
- förklara varför en kontering föreslås

Bynex Smart får inte:

- kringgå roll, attest eller periodlås
- dölja osäkerhet eller källa
- skriva över bokförd historik
- bokföra ett specialfall som motorn inte uttryckligen stöder
- markera myndighetsleverans som genomförd utan verifierat kvitto

## Releasegrind

En ekonomifunktion får markeras produktionsklar först när:

1. normkällan och dess version är dokumenterad,
2. kontrollen finns både servernära och i användarflödet där det behövs,
3. tenant-, roll-, dubblett-, period-, balans- och omklickstest är gröna,
4. fel inte kan lämna delvis genomförd bokföring,
5. revisionsbevis kan exporteras och förstås,
6. återställningsvägen är testad,
7. en redovisningskunnig pilot har verklighetstestat flödet.

## Extern granskning

Denna matris är en ingenjörs- och produktkontroll. Innan Bynex marknadsförs som ett komplett regelverifierat bokföringssystem ska matris, systemdokumentation, bokföringsmotor, arkivering, standardavtal och personuppgiftsbehandling granskas av kvalificerad redovisningsexpert och relevant juridisk kompetens.