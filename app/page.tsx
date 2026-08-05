import Link from "next/link";
import Image from "next/image";
import SmartFaq from "@/components/marketing/SmartFaq";
import Logo from "@/components/layout/Logo";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  FolderKanban,
  HardHat,
  HousePlug,
  PackageSearch,
  ReceiptText,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
  UsersRound,
} from "lucide-react";

const modules = [
  { icon: Clock3, name: "Bynex Tid", text: "Tid, raster, frånvaro, attest och löneunderlag i samma flöde." },
  { icon: FolderKanban, name: "Projekt", text: "Planering, bemanning, dokumentation och uppföljning från ett ställe." },
  { icon: ReceiptText, name: "Offert & faktura", text: "Från kundförfrågan till godkänt fakturaunderlag utan dubbelarbete." },
  { icon: FileSignature, name: "ÄTA på plats", text: "Dokumentera, beräkna och få startbesked utan att stoppa bygget." },
  { icon: PackageSearch, name: "Material & inköp", text: "Verifierade leverantörskällor ger pris- och lagerdata; Bynex väger även in beställningsvaror och stillestånd." },
  { icon: QrCode, name: "Maskiner & tillgångar", text: "QR, utlåning, plats, service och bevis för företagets verkliga maskinpark." },
  { icon: HousePlug, name: "Kundportal & fastighet", text: "Ett digitalt minne som följer byggnaden genom drift och underhåll." },
];

const flow = [
  { step: "01", title: "På arbetsplatsen", text: "Tid, bilder, material, avvikelser och ÄTA registreras där arbetet händer." },
  { step: "02", title: "På kontoret", text: "Underlag granskas, kalkyleras, attesteras och blir offert, lön eller faktura." },
  { step: "03", title: "Hos kunden", text: "Kunden följer godkända händelser, signerar och får byggnadens digitala dokumentation." },
];

const questions: Array<[string, string]> = [
  ["Måste vi köpa hela Bynex?", "Nej. Bynex Tid kan användas separat. Under betan väljer företaget Bynex Tid eller Hela Bynex; fler separata modulval öppnas först när respektive avtals- och faktureringsflöde är verifierat."],
  ["Kan andra företag se vår information?", "Nej. Företag, roller och moduler avgränsas i databasen. Varje användare får bara åtkomst till det som rollen tillåter."],
  ["Vad är Bynex Smart?", "Bynex Smart hjälper till i den modul du arbetar i—från arbetsdagbok och ÄTA till tidsplan, materialunderlag och uppföljning."],
  ["Kan vi prova med egen data?", "Ja. Under testperioden skapar ni ett eget företag och provar de aktiverade arbetsflödena i en separat företagsyta."],
  ["Hur fungerar rabatten?", "Företag som startats de senaste 12 månaderna får 50 % rabatt på vald paketnivå i 12 månader. Övriga nya Bynex-kunder får 30 % i tre månader. Erbjudandena kombineras inte; det bästa giltiga erbjudandet används."],
  ["Kan ett enmans-AB välja Bynex Solo?", "Ja. Bynex Solo är gjort för både enskild firma och enmans-AB. Arbetsflödet anpassas efter företagsformen: enskild firma får stöd för egna uttag, egenavgifter och planerat NE-underlag, medan aktiebolag får lön, arbetsgivaravgifter, AGI och planerat K2-underlag. När företaget växer kan det byta paket utan att lämna Bynex."],
  ["Kan Bynex importera från vårt nuvarande system?", "Bynex bygger ett granskat importflöde för CSV, Excel, SIE och verifierade systemkopplingar. Ni får alltid en förhandsgranskning av poster, dubbletter och fel innan ni godkänner importen. Endast kopplingar som är testade visas som tillgängliga."],
  ["När kan vi köpa Bynex Bokföring?", "Bynex Bokföring har ett planerat lanseringspris men kan inte köpas eller debiteras förrän bokföring, moms, bankavstämning, revisionsspår och svenska regelkontroller är produktionsklara."],
  ["Är bokslut planerat för Bynex Bokföring?", "Ja. Målsättningen för den planerade produktionsversionen är att ordinarie årsbokslut ska ingå utan separat bokslutsavgift. Bynex Smart ska kunna förbereda förenklat årsbokslut och NE-underlag för enskild firma samt K2-underlag för mindre aktiebolag. Funktionerna lanseras först när svenska regelkontroller och officiella kopplingar är verifierade; användaren granskar och signerar. Revision, K3, koncern och komplicerade rättelser kan kräva specialist."],
  ["Kan en enskild firma senare bli aktiebolag?", "Ja. Bynex Solo är tänkt att följa företagaren vidare. Det planerade ombildningsflödet skapar det nya juridiska företaget från rätt startdatum och återanvänder tillåtna register, samtidigt som den enskilda firmans gamla fakturor och bokföring ligger kvar oförändrade."],
  ["Hur länge har kunden kvar sin kundportal?", "Kundportalen ingår i Bynex Bygg under hela projektet och i 12 månader efter att projektet avslutas. Därefter kan kunden behålla ritningar, garantier, protokoll och den publicerade projekthistoriken i Bynex Digitalpärm för 19 kr/mån eller 190 kr/år inklusive moms per fastighet."],
];

const plans = [
  {
    name: "Bynex Tid",
    price: 299,
    firstYear: "149,50",
    audience: "För företag som vill börja med närvaro, tid och löneunderlag.",
    users: "3 användare ingår",
    features: ["In- och utcheckning med GPS-policy", "Raster, frånvaro och attest", "Löneunderlag och perioder", "Projekt och arbetsplats per tidspost"],
  },
  {
    name: "Bynex Solo",
    price: 349,
    firstYear: "174,50",
    audience: "Helheten för enskild firma och enmans-AB.",
    users: "1 användare + redovisningsåtkomst",
    badge: "Småföretagaren",
    features: ["Bynex Tid, offert och fakturering", "Kvitton och leverantörsfakturor", "Enskild: egna uttag och uppskattat disponibelt saldo", "AB: ägarlön, arbetsgivaravgifter och AGI-underlag", "Bokföring, moms och rätt bokslutsflöde när modulen är produktionsklar"],
  },
  {
    name: "Bynex Bygg",
    price: 899,
    firstYear: "449,50",
    audience: "För byggföretag som vill samla arbetet från offert till faktura.",
    users: "5 användare ingår",
    featured: true,
    badge: "Rekommenderad",
    features: ["Allt i Bynex Tid", "Projekt, offert, ÄTA och fakturaunderlag", "Arbetsledaren och Platschef", "Kundportal under projektet + 12 månader", "Material, inköp, maskinpark och Bynex Connect"],
  },
  {
    name: "Bynex Fastighet",
    price: 1295,
    firstYear: "647,50",
    audience: "För fastighetsägare som vill samla byggnadsdata, portal och tillgångar.",
    users: "4 användare ingår · extra användare 199 kr/mån",
    features: ["Fastigheter och byggnadsdelar", "Kundportal och Digitalpärm", "Installationer, ritningar och relationsdata", "Maskiner och tillgångar"],
  },
  {
    name: "Bynex Komplett",
    price: 1499,
    firstYear: "749,50",
    audience: "Hela Bynex för företag som vill växa utan att byta system.",
    users: "10 användare ingår",
    features: ["Alla släppta bygg- och ekonomimoduler", "Kundportal och fastighetens digitala minne", "Bynex Bokföring vid produktionslansering", "Utökad styrning, behörighet och support"],
  },
];

const modulePrices = [
  ["Bynex Tid", "299 kr/mån", "Tid, GPS, frånvaro, attest och löneunderlag", "Beta"],
  ["Projekt, offert & ÄTA", "599 kr/mån", "Projektflöde från kalkyl till fakturaunderlag", "Beta"],
  ["Material & inköp", "299 kr/mån", "Pris och lager från verifierade leverantörskällor, order, leverans och stillestånd", "Beta"],
  ["Bynex Connect", "149 kr/mån", "Företags- och projektkanaler", "Beta"],
  ["Fastighet & förvaltning", "299 kr/mån", "Långlivad byggnadsdata, drift och underhåll", "Planerad"],
  ["Bynex Bokföring", "349 kr/mån", "Bokföring, bank, moms, kvitton, deklarationsunderlag och ordinarie bokslut", "Planerad"],
];

const commitmentDiscounts = [
  ["12 månader", "Ordinarie pris", "Vanligast"],
  ["24 månader", "10 % rabatt", ""],
  ["36 månader", "15 % rabatt", ""],
  ["48 månader", "20 % rabatt", ""],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f5f0] text-[#090a0c]">
      <header className="relative z-20 border-b border-[#d8d8d5] bg-[#f7f5f0]/90 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Logo priority />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-zinc-600 lg:flex">
            <a href="#funktioner" className="hover:text-zinc-950">Funktioner</a>
            <a href="#arbetsflode" className="hover:text-zinc-950">Så fungerar det</a>
            <a href="#priser" className="hover:text-zinc-950">Priser</a>
            <a href="#sakerhet" className="hover:text-zinc-950">Säkerhet</a>
            <a href="#fragor" className="hover:text-zinc-950">Frågor</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-white">Logga in</Link>
            <Link href="/signup" className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Prova Bynex</Link>
          </div>
        </div>
      </header>

      <section className="relative px-5 pb-20 pt-16 md:px-10 md:pb-28 md:pt-24">
        <div className="absolute left-1/2 top-0 -z-0 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#b8bdc5]/35 blur-3xl" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c9cdd3] bg-[#e8e8e6] px-4 py-2 text-sm font-bold text-[#454950]"><span className="h-2 w-2 rounded-full bg-[#2f7d4d]" /><Sparkles className="h-4 w-4" /> Bynex beta är öppen</div>
            <h1 className="mt-7 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-8xl">Från första idé till en byggnad som står i 100 år.</h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-600 sm:text-xl">Bynex samlar projekt, personal, tid, lön, offert, ÄTA, material, fakturering och kundens dokumentation i ett enkelt arbetsflöde.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#b8bdc5] px-7 py-4 font-semibold text-[#090a0c] shadow-lg shadow-black/10 transition hover:bg-[#d5d8dc]">Skapa testkonto <ArrowRight className="h-5 w-5" /></Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-2xl border border-[#c9cdd3] bg-[#fcfbf8] px-7 py-4 font-semibold">Jag har redan konto</Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-600"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" /> 30 dagar kostnadsfritt</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" /> Ingen betalning i beta</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Företagsisolerad data</span></div>
          </div>

          <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#090a0c] p-5 text-white shadow-2xl sm:p-7">
            <div className="mb-5 flex min-h-40 items-center justify-center rounded-[2rem] border border-white/10 bg-black px-7 py-8">
              <Image src="/brand/bynex-wordmark.png" alt="Bynex" width={2172} height={724} priority className="h-auto w-full max-w-lg" />
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b8bdc5]">Bynex Smart</p><h2 className="mt-2 text-2xl font-semibold">Nästa bästa åtgärd</h2></div><div className="rounded-2xl bg-white/10 p-3 text-[#c9cdd3]"><HardHat className="h-7 w-7" /></div></div>
              <div className="mt-7 space-y-3">
                {["Samla in kundens underlag", "Beräkna och granska", "Godkänn och starta arbetet", "Dokumentera för framtiden"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-2xl bg-white/7 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-zinc-950">{index + 1}</span><span className="font-semibold text-zinc-100">{item}</span></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funktioner" className="scroll-mt-20 border-y border-[#d8d8d5] bg-[#fcfbf8] px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#454950]">Ett system, valfria moduler</p><h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Börja där nyttan är störst.</h2><p className="mt-5 text-lg leading-8 text-zinc-600">Varje företag ser bara de moduler som ingår. Bynex Tid kan stå helt på egna ben och samlar tid, närvaro, GPS, frånvaro och löneunderlag, medan byggföretag kan koppla ihop hela kedjan.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(({ icon: Icon, name, text }) => <article key={name} className="rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-6 transition hover:-translate-y-1 hover:shadow-lg"><div className="inline-flex rounded-2xl bg-[#e8e8e6] p-3 text-[#454950]"><Icon className="h-6 w-6" /></div><h3 className="mt-5 text-xl font-semibold">{name}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{text}</p></article>)}</div>
        </div>
      </section>

      <section id="priser" className="scroll-mt-20 border-y border-[#d8d8d5] bg-[#fcfbf8] px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#454950]">Tydliga lanseringspriser</p><h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Börja komplett. Välj om efter första året.</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">Nystartade företag får 50 % rabatt i 12 månader på vald paketnivå. Alla andra nya Bynex-kunder får 30 % rabatt de första tre månaderna. Inför nästa period kan företaget fortsätta, byta nivå eller välja enskilda moduler.</p></div><div className="space-y-3"><div className="rounded-3xl border border-[#c9cdd3] bg-[#e8e8e6] p-6 text-[#454950]"><div className="flex items-center gap-3"><Tag className="h-6 w-6" /><p className="font-semibold">Nystartad 50 % första året</p></div><p className="mt-3 text-sm leading-6">Gäller företag som startats inom de senaste 12 månaderna.</p></div><div className="rounded-3xl bg-[#202226] p-6 text-white"><p className="font-semibold">Ny kund: 30 % i tre månader</p><p className="mt-3 text-sm leading-6 text-zinc-300">För företag som byter till Bynex. Det bästa giltiga erbjudandet används; rabatterna kombineras inte.</p></div></div></div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <article key={plan.name} className={`flex flex-col rounded-[2rem] border bg-[#fcfbf8] p-6 ${plan.featured ? "border-[#7e858f] shadow-xl ring-1 ring-[#b8bdc5]" : "border-[#d8d8d5]"}`}><div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">{plan.name}</h3>{plan.badge && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${plan.featured ? "bg-[#202226] text-white" : "bg-[#e8e8e6] text-[#454950]"}`}>{plan.badge}</span>}</div><p className="mt-3 min-h-16 text-sm leading-6 text-zinc-600">{plan.audience}</p><div className="mt-6"><p className="text-4xl font-semibold">{plan.price.toLocaleString("sv-SE")} kr</p><p className="mt-1 text-xs text-zinc-500">per företag/mån exkl. moms · 12 månader</p></div><div className="mt-5 rounded-2xl bg-[#e8e8e6] p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#454950]">Nystartad första året</p><p className="mt-2 text-2xl font-semibold">{plan.firstYear} kr/mån</p></div><p className="mt-5 flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4" /> {plan.users}</p><ul className="mt-5 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm leading-6 text-zinc-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2f7d4d]" />{feature}</li>)}</ul><Link href="/signup" className={`mt-7 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold ${plan.featured ? "bg-[#b8bdc5] text-[#090a0c]" : "bg-[#202226] text-white"}`}>Prova utan betalning</Link></article>)}</div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_0.7fr]">
            <div><div className="flex items-center gap-3"><Tag className="h-6 w-6 text-emerald-700" /><div><h3 className="text-2xl font-semibold">Välj bindningstid</h3><p className="mt-1 text-sm text-zinc-500">Månadsfakturering är möjlig även med längre bindningstid.</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{commitmentDiscounts.map(([period, discount, badge]) => <div key={period} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"><div><p className="font-semibold">{period}</p><p className="mt-1 text-sm text-zinc-500">{discount}</p></div>{badge && <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white">{badge}</span>}</div>)}</div></div>
            <div className="rounded-[2rem] bg-zinc-950 p-7 text-white"><UsersRound className="h-7 w-7 text-emerald-400" /><h3 className="mt-6 text-2xl font-semibold">Väx utan att byta system</h3><p className="mt-4 text-sm leading-6 text-zinc-300">Extra användare kostar från 99 kr/mån beroende på paket. Företag med minst 25 användare får ett anpassat volympris. Bynex Solo följer både enskild firma och enmans-AB; när företaget anställer eller behöver fler moduler kan det uppgradera och behålla sin historik.</p><p className="mt-4 text-xs leading-5 text-zinc-400">Rabatter kombineras inte. Nystartad med 24 månaders bindning får 50 % under månad 1–12 och därefter 10 % under återstående bindningstid.</p></div>
          </div>

          <div className="mt-14 grid gap-6 rounded-[2rem] bg-[#202226] p-7 text-white shadow-xl lg:grid-cols-[0.65fr_1.35fr] lg:items-center sm:p-9">
            <div><BookOpenCheck className="h-8 w-8 text-[#b8bdc5]" /><p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-[#b8bdc5]">Bynex Bokföring · planerat lanseringspris 349 kr/mån</p><h3 className="mt-3 text-3xl font-semibold">Målsättning: ordinarie bokslut utan separat avgift.</h3></div>
            <div><p className="text-lg leading-8 text-[#f3f1ed]">I den planerade produktionsversionen ska Bynex Smart kunna förbereda bokslutet, kontrollera underlaget och visa vad som behöver granskas före signering. Målet är stöd för förenklat årsbokslut och NE-underlag för enskild firma samt K2-underlag för mindre aktiebolag.</p><p className="mt-4 text-sm leading-6 text-[#c9cdd3]">Funktionerna kan inte köpas eller användas för inlämning innan svenska regelkontroller och officiella kopplingar är verifierade. Revision, K3, koncernredovisning och komplicerade rättelser kan kräva specialist.</p></div>
          </div>

          <div className="mt-6 grid gap-6 rounded-[2rem] border border-[#c9cdd3] bg-[#e8e8e6] p-7 lg:grid-cols-[0.7fr_1.3fr] lg:items-center sm:p-9">
            <div><HousePlug className="h-8 w-8 text-[#454950]" /><p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-[#454950]">Bynex Digitalpärm</p><h3 className="mt-3 text-3xl font-semibold">19 kr/mån eller 190 kr/år</h3><p className="mt-2 text-sm font-semibold text-[#454950]">inklusive moms · per fastighet</p></div>
            <div><p className="text-lg leading-8 text-[#202226]">Kundportalen ingår i Bynex Bygg under hela projektet och i 12 månader efter avslut. Därefter kan fastighetsägaren behålla ritningar, garantier, protokoll och den publicerade projekthistoriken som en trygg digital pärm.</p><p className="mt-4 text-sm leading-6 text-[#454950]">Fortsättningen är frivillig och aktiveras av kunden. Betalning startar först när abonnemangsflöde, villkor och export är verifierade för produktion.</p></div>
          </div>

          <div className="mt-14 flex items-center gap-3"><BookOpenCheck className="h-6 w-6 text-emerald-700" /><div><h3 className="text-2xl font-semibold">Moduler var för sig</h3><p className="mt-1 text-sm text-zinc-500">För företag som bara vill lägga till en särskild del.</p></div></div>
          <div className="mt-6 overflow-hidden rounded-[2rem] border border-zinc-200"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500"><tr><th className="p-4">Modul</th><th className="p-4">Ordinarie pris</th><th className="p-4">Ingår</th><th className="p-4">Status</th></tr></thead><tbody>{modulePrices.map(([name, price, included, status]) => <tr key={name} className="border-t border-zinc-100"><td className="p-4 font-semibold">{name}</td><td className="p-4">{price} exkl. moms</td><td className="p-4 text-zinc-600">{included}</td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "Beta" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{status}</span></td></tr>)}</tbody></table></div></div>
          <p className="mt-5 text-xs leading-5 text-zinc-500">Beta är kostnadsfri och utan betalning. Betalda abonnemang börjar först när respektive modul är produktionsklar och avtalsvillkoren har godkänts. Planerade moduler kan inte köpas eller debiteras ännu. Extra användare och transaktionskostnader kommer att anges innan betald lansering. Vid systembyte erbjuds förhandsgranskad importhjälp för de filformat och adaptrar som vid tidpunkten är verifierade.</p>
        </div>
      </section>

      <section id="arbetsflode" className="scroll-mt-20 px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Ett sammanhängande arbetsflöde</p><h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Informationen registreras en gång.</h2><p className="mt-5 text-lg leading-8 text-zinc-600">Det som händer på byggplatsen blir ett granskat underlag på kontoret och en tydlig uppdatering för kunden.</p></div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">{flow.map((item) => <article key={item.step} className="rounded-[2rem] border border-zinc-200 bg-white p-7"><span className="text-sm font-black tracking-[0.18em] text-emerald-700">{item.step}</span><h3 className="mt-8 text-2xl font-semibold">{item.title}</h3><p className="mt-4 leading-7 text-zinc-600">{item.text}</p></article>)}</div>
        </div>
      </section>

      <section id="sakerhet" className="scroll-mt-20 bg-white px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] bg-[#b8bdc5] p-7 text-[#090a0c] lg:col-span-2"><Building2 className="h-8 w-8" /><h2 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight">Bygg är spetsen. Fastighetens hela liv blir fortsättningen.</h2><p className="mt-5 max-w-3xl leading-7 text-[#454950]">Ritningar, dolda installationer, egenkontroller, garantier och beslut följer projektet vidare till fastighetsägaren och kundportalen.</p></div>
          <div className="rounded-[2rem] bg-[#202226] p-7 text-white"><ShieldCheck className="h-8 w-8 text-[#b8bdc5]" /><h2 className="mt-8 text-3xl font-semibold">Rätt person ser rätt sak.</h2><p className="mt-5 leading-7 text-zinc-300">Roller, företag och moduler kontrolleras i databasen. Interna priser och persondata delas aldrig automatiskt.</p></div>
        </div>
        <div className="mx-auto mt-6 grid max-w-7xl gap-4 sm:grid-cols-3">
          {["Stark inloggning och verifierade sessioner", "Behörighet per företag, roll och modul", "Granskning före publicering till kund"].map((item) => <div key={item} className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-5 text-sm font-semibold leading-6"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />{item}</div>)}
        </div>
      </section>

      <section id="fragor" className="scroll-mt-20 px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Bynex Smart FAQ</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Vanliga frågor före start.</h2><p className="mt-5 leading-7 text-zinc-600">Tydliga svar nu. Bynex Smart Chat kopplas senare till samma kvalitetssäkrade information.</p></div>
          <SmartFaq questions={questions} />
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-zinc-950 p-8 text-white sm:p-12 lg:flex-row lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Testa med egen data</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Öppna ert Bynex-företag idag.</h2><p className="mt-4 text-zinc-300">Skapa konto, välj testomfattning och börja prova arbetsflödet.</p></div><Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-semibold text-zinc-950">Starta 30 dagar <ArrowRight className="h-5 w-5" /></Link></div>
      </section>

      <footer className="border-t border-zinc-200 px-5 py-8 text-sm text-zinc-500 md:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><Logo /><p className="mt-3">Bygg mer. Administrera mindre.</p></div><div className="flex gap-5"><Link href="/login" className="font-semibold text-zinc-700">Logga in</Link><Link href="/signup" className="font-semibold text-zinc-950">Skapa konto</Link></div></div></footer>
    </main>
  );
}
