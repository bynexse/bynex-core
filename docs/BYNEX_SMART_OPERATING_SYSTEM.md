# Bynex Smart – operativt byggsystem

## Målbild

Bynex Smart ska inte vara en fristående chatt eller en knapp som endast sammanfattar text. Bynex Smart ska vara en aktiv operativ motor för byggföretag som:

- följer företagets verkliga data och arbetsflöden,
- upptäcker risker och saknade underlag innan de kostar pengar,
- föreslår nästa åtgärd för rätt person,
- förbereder utkast, kalkyler, tidsplaner och dokument,
- uppdaterar rekommendationer när verklig tid, material, kostnad och utfall registreras,
- lämnar beslut, godkännanden och publicering till behöriga människor.

Bynex Smart ska fungera som en digital projektledare, kalkylator, administratör och kvalitetskontroll – men alltid vara spårbar, förklarande och behörighetsstyrd.

## Grundprinciper

1. **Företagets data stannar i företaget.**
   - Inga rekommendationer får blanda kundföretags data.
   - Historik, priser, löner, marginaler, prestationer och dokument avgränsas per organisation.

2. **Verkliga källor före gissningar.**
   - Bynex Smart ska visa källor, tidpunkt, prisnivå, osäkerhet och antaganden.
   - Saknas säkert underlag ska resultatet märkas som uppskattning eller förslag.

3. **Människa godkänner känsliga beslut.**
   - Kundpris, lön, faktura, personalbeslut, avtal och publicering kräver rätt behörighet.
   - Fyra ögon används när pris, rabatt eller avtal passerar företagets gränsvärden.

4. **Tre viktigaste åtgärder – inte tjugo varningar.**
   - Varje roll får högst tre prioriterade åtgärder på startsidan.
   - Varje kort ska beskriva vad som hänt, varför det är viktigt, ekonomisk/tidsmässig påverkan, rekommenderad åtgärd och direktknapp.

5. **Byggspråk och svenska arbetsflöden.**
   - Rubriker och statusar ska vara begripliga för medarbetare, arbetsledare, projektledare, ekonomi och kund.
   - Råa databasnycklar ska aldrig visas i användargränssnittet.

## 1. Smart operativ ledning

Bynex Smart ska övervaka och prioritera bland annat:

- blockerad ÄTA utan kundgodkännande,
- arbete som riskerar att sakna debiteringsunderlag,
- fakturaklara projekt eller ÄTA som inte fakturerats,
- medarbetare eller UE som saknar tid,
- glömd utstämpling,
- löneunderlag som väntar på attest,
- projektmarginal som sjunker under företagets gräns,
- material som behöver beställas,
- leveranser som hotar tidsplanen,
- leverantörsfaktura som avviker från prislista eller registrerat material,
- offerttyper som historiskt gått med förlust,
- kompetens- eller resursbrist i kommande moment.

### Exempel: blockerad ÄTA

Kortet ska kunna visa:

- projekt,
- ÄTA-nummer och rubrik,
- uppskattat eller granskat värde,
- kund- och signeringsstatus,
- planerad arbetsstart,
- möjlig utebliven debitering,
- rekommendation,
- knappar för att öppna ÄTA, skicka signering eller tilldela ansvarig.

Kortet ska försvinna automatiskt när systemet verifierar att problemet är löst.

## 2. Snabb tid och byggdagbok

Målet är att en medarbetare ska kunna registrera tid inom åtta sekunder från att telefonen tas upp.

### Mobilflöde

- Installerbar PWA med egen Bynex-ikon.
- Direktstart till **Snabb tid**.
- Senast använda eller GPS-föreslaget projekt är förvalt.
- Stor knapp för **Stämpla in** eller **Stämpla ut**.
- Offlinekö vid svag mottagning och automatisk synk när anslutningen återkommer.
- GPS hämtas endast enligt företagets policy och tydligt användargodkännande.

### Tre ord till dagbok

Medarbetaren kan skriva exempelvis:

> extra gipsvägg hall

Bynex Smart förbereder då:

- saklig arbetsdagbok,
- arbetsmoment,
- koppling till tidsregistreringen,
- identifierade material,
- möjlig ÄTA-varning,
- uppföljningsfrågor vid behov.

AI får inte lägga till fakta som användaren inte har lämnat eller som inte finns i företagets verifierade data.

### Dagbokens användning

Dagboken ska kunna användas av:

- medarbetare och UE som registrerar verkligt arbete,
- arbetsledare och projektledare som granskar dagen,
- ekonomi som tar fram fakturaunderlag,
- lön som verifierar arbetsmoment, projekt och tid,
- kund som ser godkända projektuppdateringar i Pärmen.

Flöde:

1. Medarbetaren registrerar tid, kort text, material och eventuella bilder.
2. Bynex Smart skapar ett dagboksutkast.
3. Kontoret granskar och kompletterar.
4. Underlaget används i projekt, fakturering och lön.
5. Kundgodkänd information publiceras i projektflödet.
6. Publicerat innehåll bevaras i Pärmen med datum och spårbar historik.

## 3. Smart ÄTA och uppskattat pris

### Insamling

Bynex Smart ska ställa korta, relevanta frågor beroende på typ av arbete, exempelvis:

- längd, bredd, höjd, yta eller antal,
- rivning och bortforsling,
- materialval och kvalitet,
- åtkomlighet och arbetshöjd,
- befintligt underlag och förberedelser,
- antal yrkesgrupper,
- UE, maskiner, etablering och resor,
- önskat startdatum och tidspress,
- om arbetet sker på löpande räkning eller som uppskattat fast pris.

Frågorna ska anpassas efter det som redan är känt i projektet och aldrig upprepas i onödan.

### Prisresultat

Kunden ska se rubriken:

> **Uppskattat pris**

Resultatet ska innehålla:

- uppskattat pris exklusive och inklusive moms,
- prisintervall när osäkerheten är betydande,
- kort förklaring,
- viktigaste antaganden,
- vad som inte ingår,
- beräknad tidsåtgång,
- datum och kalkylversion,
- tydlig text om att priset kan ändras om omfattningen ändras.

### Marginal

- Företaget anger önskad lägsta marginal per ÄTA, offerttyp, projekt eller kund.
- Förvalt riktvärde i första versionen: 10–15 procent.
- Bynex Smart ska räkna baklänges från företagets kända kostnader och rekommendera ett pris som når målmargin.
- Om målet inte kan nås ska systemet förklara varför och vilka antaganden som behöver ändras.

### Datakällor

Prisförslaget ska i prioriterad ordning använda:

1. företagets egna godkända artikel- och prislistor,
2. företagets tidigare liknande arbeten och verkliga utfall,
3. företagets arbetstider, lönekostnader, UE-priser och påslag,
4. aktuella verifierade leverantörspriser,
5. allmänna schabloner endast som tydligt märkta reservvärden.

## 4. Smart offert och efterkalkyl

Bynex Smart ska hjälpa till att skapa offerter från beskrivning, mått, bilder och projektdata.

### Historisk kalibrering

Om exempelvis fem garageofferter har gett sämre utfall än planerat ska Bynex Smart kunna säga:

> Liknande garageprojekt har i genomsnitt underskattats. Ett påslag på 12 procent ger, med nuvarande underlag, cirka 6,1 procents beräknad marginal.

Rekommendationen ska visa:

- vilka tidigare projekt som ingår i jämförelsen,
- hur lika de är,
- planerad kontra verklig tid,
- planerad kontra verklig materialkostnad,
- marginal före och efter rekommenderad justering,
- osäkerhet och eventuella avvikande projekt.

Företaget beslutar alltid om slutligt pris.

## 5. Smart tidsplan för byggprojekt

När en offert eller kalkyl skapas ska Bynex Smart kunna förbereda en genomförbar tidsplan för relevanta yrkesgrupper.

### Exempel: garage

Översiktsnivån kan visa:

- **Grundplattan färdig** – 2 veckor
- **Stomme färdig** – 4 veckor
- **Tak tätt** – 3 veckor
- **Fasad och portar** – 2 veckor
- **El och kompletteringar** – 1 vecka
- **Slutkontroll och överlämning** – 3 dagar

Användaren ska kunna öppna varje fas och se moment, exempelvis för grundplatta:

- utsättning,
- schakt,
- bärlager,
- dränering,
- isolering,
- armering,
- ingjutningsgods,
- betongleverans,
- gjutning,
- härdning,
- kontrollpunkt innan stomstart.

### Planeringsmotorn ska hantera

- moment och beroenden,
- yrkesgrupper och kompetenskrav,
- tillgängliga medarbetare och UE,
- beräknade mantimmar,
- materialens ledtider,
- maskiner och andra resurser,
- helger och arbetskalender,
- väderkänsliga moment,
- myndighets-, kontroll- och kundbeslut,
- buffert och risk,
- milstolpar och kundkommunikation.

### Levande plan

Planen ska jämföra plan mot verklighet från:

- tidregistrering,
- dagbok,
- material och leveranser,
- ÄTA,
- egenkontroller,
- foton och projektflöde.

När verkligheten avviker ska Bynex Smart föreslå en ny plan och förklara konsekvensen innan den ändras.

## 6. Kompetens och bemanning

Bynex Smart ska hjälpa ansvarig att sätta rätt person på rätt arbete.

Datakällor får omfatta:

- verifierade utbildningar, behörigheter och certifikat,
- registrerade yrkesroller,
- faktisk tid per arbetsmoment och projekttyp,
- dagbok och godkänd projektdata,
- tillgänglighet och geografiskt avstånd,
- planerade arbeten och kompetenskrav.

Bynex Smart kan rekommendera exempelvis:

- vilka medarbetare som har relevant erfarenhet,
- hur många timmar de arbetat med liknande moment,
- vilka behörigheter som saknas,
- risk för överbokning,
- behov av UE eller extra bemanning.

Rekommendationen får inte automatiskt fatta arbetsrättsliga beslut eller skapa dolda prestationsbetyg. Användaren ska kunna se underlaget och godkänna bemanningen.

## 7. Material, leveranser och byggvaruhus

### Språk i Bynex

Aktuellt publikt butikspris ska kallas:

> **Hyllkantspris**

Andra prisnivåer ska visas tydligt som exempelvis:

- Företagets avtalspris
- Importerad prislista
- Senast betalt
- Leverantörsfakturans pris
- Uppskattat pris

### Leverantörssökning

Bynex Smart ska kunna:

- hitta byggvaruhus i Sverige som publicerar onlinepris och/eller lagersaldo,
- hitta närmaste relevanta varuhus från projekt eller användarens godkända position,
- visa kedja, varuhus, adress, avstånd och karta/vägbeskrivning,
- visa pris, lagersaldo, hämtning och leverans när källan stödjer det,
- visa källa och tidpunkt för kontroll,
- markera när lagersaldo eller pris inte kan bekräftas.

Exempel:

> Närmaste byggvaruhus: Woody NA Svensson, Vagnhärad  
> Nästa alternativ: Bolist, Trosa

### Egna prislistor

Kunden ska kunna importera egna prislistor från samma leverantörer och använda:

- leverantör,
- varuhus eller avtal,
- artikelnummer,
- benämning,
- enhet,
- nettopris,
- giltighetsdatum,
- rabattgrupp,
- eventuell frakt eller miljöavgift.

Bynex ska kunna jämföra företagets pris med hyllkantspriset utan att blanda ihop prisnivåerna.

### Artikelregister

Offerter, ÄTA och inköp ska i första hand använda företagets artikelregister. Saknas artikel får Bynex Smart föreslå en ny artikel, men företaget ska godkänna:

- artikelnummer,
- benämning,
- enhet,
- kostnadspris,
- försäljningspris eller påslag,
- leverantörskoppling.

## 8. Materialregistrering på byggplatsen

Medarbetare ska kunna:

- lägga in material samtidigt med tid eller dagbok,
- söka och välja artikel,
- ange mängd och enhet,
- fotografera orderspecifikation, följesedel eller kvitto,
- koppla materialet till projekt, ÄTA och arbetsdag.

Bynex Smart ska försöka identifiera:

- leverantör,
- order- eller fakturanummer,
- artikelnummer,
- artikelnamn,
- mängd,
- enhet,
- pris,
- moms och avgifter.

Identifierade uppgifter blir ett granskningsutkast. Osäkra rader ska markeras och får inte bokföras eller faktureras automatiskt.

## 9. Avstämning mot leverantörsfaktura

Bynex ska kunna jämföra:

- registrerat material,
- följesedel eller order,
- företagets prislista,
- hyllkantspris,
- leverantörsfaktura,
- artikelregister och påslag.

Smart ska varna för exempelvis:

- annan artikel än registrerad,
- prisavvikelse,
- fel mängd,
- dubbel fakturering,
- saknad rabatt,
- material som inte kopplats till projekt,
- material som använts men inte tagits med i fakturaunderlaget.

## 10. Fakturering

Bynex Smart ska:

- identifiera fakturaklara underlag,
- föreslå fakturarader från godkänd tid, material, ÄTA och avtal,
- markera saknade attest- eller kundbeslut,
- kontrollera projektets prisform och avtal,
- föreslå fakturadatum och period,
- jämföra mot tidigare fakturering så inget dubbeldebiteras,
- lämna slutligt godkännande och utskick till behörig person eller företagets godkända automatik.

## 11. Lön och preliminära lönespecifikationer

### Månadscykel

- Den 1:a varje månad förbereder Bynex preliminära lönespecifikationer för föregående period enligt företagets löneinställningar.
- Den preliminära specifikationen skickas till den anställde för insyn och avvikelseanmälan.
- Ekonomi eller ägare granskar tid, frånvaro, tillägg, traktamente och övriga underlag.
- När lönen körs, normalt omkring den 15:e, godkänner behörig person den slutliga lönekörningen.
- Alla ändringar mellan preliminär och slutlig version ska vara spårbara.

Den 1:a och den 15:e ska vara konfigurerbara eftersom företag har olika perioder och lönecykler.

## 12. Ritningar, mått och bildanalys

Bynex Smart ska kunna förbereda:

- måttsatta principskisser,
- enkla plan- och elevationsutkast,
- material- och kaplistor,
- markeringar på uppladdade bilder,
- förslag på moment och mängder från mått.

Resultatet ska märkas som utkast och innehålla antaganden. Konstruktionshandlingar, myndighetshandlingar och andra dokument som kräver särskild kompetens måste granskas och godkännas av behörig person innan de används som styrande underlag.

## 13. Pärmen och kundens projektflöde

Godkänd information från dagbok, milstolpar, bilder, ÄTA, leveranser, kontroller, installationer och överlämning ska kunna publiceras i kundens tidslinje.

Kunden ska kunna se:

- vad som hände,
- vilket datum det hände,
- godkänd sammanfattning,
- relevanta bilder och dokument,
- milstolpar,
- beslut och ändringar som kunden har rätt att se.

Interna kostnader, löner, marginaler, personuppgifter och interna kommentarer får aldrig följa med automatiskt.

## 14. Förklarbarhet och kvalitet

Varje Smart-resultat ska där det är relevant visa:

- datakällor,
- när källorna senast uppdaterades,
- antaganden,
- osäkerhet eller konfidens,
- vilken version av kalkyl eller plan som används,
- vem som granskade och godkände,
- vad som ändrats sedan föregående version.

## Leveransordning

Varje punkt levereras som en separat, testbar release.

### Release 0 – befintlig HQ- och faktureringsgrund

- betalande kund och fakturaunderlag,
- Smart Price i exakta kronor,
- produktionskostnadsgrund,
- extra användarplatser,
- riktiga namn i Connect.

### Release 1 – HQ användbarhet

- ren Bynex-identitet i HQ,
- menyer som inte känns blockerade,
- rullbar vänstermeny,
- global sökning,
- Kund 360-lista och kundnummer,
- integrerad kostnadsarbetsyta,
- tydliga roller och supportåtkomst.

### Release 2 – Snabb tid och dagbok

- PWA och direktstart,
- åttasekundersflöde,
- offlinekö,
- tre ord till dagboksutkast,
- projekt-, lön- och fakturakoppling,
- granskningsflöde till Pärmen.

### Release 3 – Smart operativ ledning och ÄTA

- tre prioriterade morgonåtgärder,
- detaljerat ÄTA-riskkort,
- uppskattat pris och följdfrågor,
- målmargin,
- signering och automatisk upplösning av varning.

### Release 4 – Smart offert och tidsplan

- offertkalkyl från text, mått och bild,
- historisk efterkalkyl,
- marginalrekommendation,
- fas- och momentplan per yrkesgrupp,
- plan mot verklighet.

### Release 5 – Materialintelligens

- Hyllkantspris,
- närmaste byggvaruhus,
- onlinepris och lagersaldo,
- importerade prislistor,
- artikelregister,
- material från foto,
- avstämning mot leverantörsfaktura.

### Release 6 – Kompetens och bemanning

- kompetensmatris,
- erfarenhet från verifierad projekthistorik,
- resurs- och kapacitetsförslag,
- mänskligt godkännande.

### Release 7 – Faktura och lön

- Smart fakturaförslag,
- preliminär lönespecifikation den 1:a,
- avvikelseflöde för anställd,
- slutlig attest omkring den 15:e,
- full revisionshistorik.

## Kommersiellt mål

Bynex ska bygga värde genom fungerande och mätbara arbetsflöden – inte genom att samla så många AI-knappar som möjligt. Varje release ska kunna visa minst ett konkret affärsvärde:

- färre missade ÄTA,
- snabbare tidregistrering,
- högre faktureringsgrad,
- bättre offertmarginal,
- mindre materialspill,
- kortare administration,
- bättre kunddokumentation,
- färre fel i lön och leverantörsfakturor.

Detta dokument är den kanoniska produktplanen för Bynex Smart och uppdateras när funktionerna konkretiseras och levereras.