# Bynex Bokföring – konkurrent- och försprångskarta

**Kartlagd:** 2026-08-07  
**Källprincip:** endast officiella produkt- och supportsidor för funktionspåståenden  
**Syfte:** funktionsparitet är golvet; Bynex egna byggflöden, design, kod och texter är försprånget

## Officiella källor som användes i denna version

### Fortnox

- Bokföring, attest, kvitto/utlägg och företagskort: https://www.fortnox.se/produkt/
- Leverantörsfakturaattest: https://www.fortnox.se/produkt/bokforingsprogram/leverantorsfakturaattest
- Kvitto & Utlägg: https://www.fortnox.se/produkt/kvitto-utlagg
- Bokslut & Skatt: https://support.fortnox.se/produkthjalp/bokslut-skatt
- Byrå och realtidsbokföring/Blink: https://www.fortnox.se/byra/blink

### Spiris

- Bokföring & Fakturering: https://www.spiris.se/ekonomiplattform/bokforing-fakturering/
- Bankkoppling och matchning: https://support.spiris.se/bokforing-fakturering/sv-se/content/online-help/cashbank-bank-integration.htm
- Matchningsregler: https://support.spiris.se/bokforing-fakturering/sv-se/content/online-help/settings-cashbank-matching-rules.htm
- Scanner/bildunderlag: https://support.spiris.se/bokforing-fakturering/sv-se/content/online-help/apps-extensions-app-scanner.htm
- Deklaration & Årsredovisning: https://support.spiris.se/bokforing-fakturering-plus/sv-se/content/online-help/apps-extensions-extensions-deklaration-arsredovisning.htm

### Bokio

- Produktöversikt: https://www.bokio.se/
- Bankkoppling: https://www.bokio.se/bankkoppling/
- Smartfunktioner: https://www.bokio.se/hjalp/bokforing/att-bokfora-i-bokio/sa-fungerar-bokios-smartfunktioner/
- Mobilapp: https://www.bokio.se/hjalp/komma-igang/skapa-ett-konto/har-bokio-en-mobilapp/
- Bokslut/årsredovisning: https://www.bokio.se/hjalp/bokslut/arsredovisning-och-deklaration/arsredovisning-online/

### Björn Lundén

Björn Lundéns funktioner ska kartläggas i nästa verifierade version direkt från aktuella produkt- och supportsidor. Inga funktionspåståenden förs in utan officiell källa och datum.

## Marknadens etablerade grundförmågor

| Förmåga | Fortnox | Spiris | Bokio | Bynex mål |
|---|---|---|---|---|
| Bankkoppling och automatisk transaktionshämtning | Ja | Ja | Ja | Ja, med bankoberoende adapter och full dubblettspärr |
| Matchning mot kund-/leverantörsfaktura | Ja | Ja | Ja | Ja, även mot tid, följesedel, projekt, lön, skatt och kortköp |
| Regler för återkommande bankhändelser | Genom automatisering/integrationer | Ja | Ja | Ja, i klartext med förhandsvisning, källbevis och återställning |
| Mobilfoto av kvitto/faktura | Ja | Ja | Ja | Ja, kamera först och projekt föreslaget automatiskt |
| OCR/AI-tolkning | Ja | Ja | Ja | Ja, förklarbar, tenant-lärande och med tydlig osäkerhet |
| Leverantörsfakturaattest | Ja | Stöd i plattformen/paket | Samarbetsflöden | Ja, beloppsgräns, projekt, fyra ögon och eskalering |
| Betalningsuppdrag/bankflöde | Ja i stödda upplägg | Ja i stödda banker | Integrerat konto eller extern bankkoppling | Ja, först efter partner-, säkerhets- och avtalsgranskning |
| Kundfakturor, e-faktura, kredit och påminnelse | Ja | Ja | Ja | Ja, byggunderlag hämtas utan dubbelregistrering |
| Lön, utlägg och AGI | Ja | Ja | Ja | Ja, direkt från godkänd tid, frånvaro och ersättning |
| Periodisering, valuta och kursdifferens | Ja | Ja | Delvis/paketberoende | Ja, särskilda regelmotorer och tydliga spärrar |
| Anläggningsregister/avskrivning | Ja | Produkt-/paketberoende | Begränsat/arbetsflödesberoende | Ja, kopplat till Bynex Maskiner och inköpsbevis |
| Moms, skatt och viktiga datum | Ja | Ja | Ja | Ja, avstämt mot bokföring, lön, bank och skattekonto |
| Bokslut, deklaration och årsredovisning | Ja | Ja | Ja via eget flöde/integration | Ja, versionsbundet K1/K2/K3 och digitalt myndighetskvitto |
| Redovisningsbyråvy | Ja | Ja | Ja | Ja, byggkundens avvikelser och bevis i en gemensam kö |
| SIE/API/integrationer | Ja | Ja | Ja | Ja, plus komplett bevis- och återläsningsmanifest |
| Realtidsöversikt | Ja | Ja | Ja | Ja, med projektekonomi, marginal, risk och kontinuerligt bokslut |

Paket, bankstöd och exakt automatiseringsgrad förändras över tid. Tabellen är en produktkarta, inte ett inköpsråd eller ett påstående om att alla funktioner ingår i varje abonnemang.

## Bynex unika försprång

### 1. Ett enda ekonomiskt händelse-ID genom hela byggflödet

En materialleverans ska kunna följas som samma ekonomiska händelse från foto/följesedel till artikel, projektkostnad, leverantörsfaktura, ÄTA, kundfaktura, bankbetalning och verifikation. Bynex får inte skapa sex fristående kopior av samma kostnad.

### 2. Följesedel före faktura

Bynex Smart läser följesedeln ute på arbetsplatsen, föreslår projekt och artiklar och reserverar kostnaden. När leverantörsfakturan kommer matchas raderna mot leveransen. Projektet får aktuell kostnad tidigt, men fakturan bokförs bara en gång.

### 3. Kontinuerligt bokslut

Bynex visar inte bara vad som redan är bokfört. Systemet berättar varje dag:

- vad som är klart,
- vad som saknar underlag,
- vad som inte stämmer mot bank eller projekt,
- vad som blockerar periodstängning,
- vem som kan lösa avvikelsen snabbast.

### 4. Förklarbar bokföring

Varje Smart-förslag ska kunna svara på:

- Vad tror Bynex att detta är?
- Varför valdes leverantör, projekt, konto och moms?
- Vilka källor och tidigare verifierade händelser användes?
- Vad är säkert, osäkert och blockerande?
- Vad ändrade människan?

### 5. Hantverkarens gränssnitt, redovisningens djup

Primärvyn använder ord som `Material till Projekt X`, `Kvitto saknas` och `Bokför`. Konto, momskod, verifikationsserie och behandlingshistorik finns alltid för ekonomi och redovisningsbyrå, men belastar inte hantverkarens vardag.

### 6. Projektmarginal i realtid

Tid, material, UE, maskin, ÄTA, fakturerat och prognos ska uppdatera projektets ekonomi utan manuella överföringar. Bynex Smart varnar innan ett fastprisjobb förlorar sin marginal, inte efter bokslutet.

### 7. Regelmotor som produktförmåga

En kontroll i Bynex är versionsstyrd, testbar och förklarbar. När lag, BFN-vägledning eller myndighetsformat ändras ska vi kunna se vilka kunder, perioder, funktioner och tester som påverkas.

### 8. Säker autonomi

Bynex ska automatisera mer än konkurrenterna, men aldrig genom att dölja beslut. Autonomi tillåts endast när:

- regel och riskklass uttryckligen stöds,
- källorna är kompletta,
- samma åtgärd är idempotent,
- resultatet går att förklara och återföra,
- rätt roll har aktiverat nivån,
- specialfall går fail-closed till mänsklig kontroll.

## Prioriterad funktionsordning

1. Enklicksbokföring och snabbkomplettering – lanserad grund.
2. Bynex Kontroll: kontinuerlig månadskoll med exakta nästa åtgärder.
3. Bankhändelser och bevisad matchning.
4. Följesedel–artikel–leverantörsfaktura utan dubblett.
5. Byråkö och saknade-underlag-dialog direkt med rätt person.
6. Moms, skattekonto och periodstängning.
7. Anläggningsregister kopplat till maskiner och inköp.
8. Lön/AGI från godkänd tid och ersättning.
9. Bokslut, deklaration, årsredovisning och digital inlämning.
10. Prognoser, avvikelseförklaring och kontinuerligt revisionspaket.

## Uppdateringsregel

- Kartan omprövas kvartalsvis.
- Varje konkurrentpåstående ska ha officiell källa och granskningsdatum.
- Pris och paketjämförelser hålls utanför denna fil eftersom de förändras snabbare.
- Funktioner kopieras inte rakt av. Bynex utgår från användarbehov, lagkrav och egen produktdesign.