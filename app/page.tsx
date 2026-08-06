import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileSignature,
  FolderKanban,
  HardHat,
  HousePlug,
  PackageSearch,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import Logo from "@/components/layout/Logo";
import SmartFaq from "@/components/marketing/SmartFaq";

const siteUrl = "https://www.bynex.se";

export const metadata: Metadata = {
  title: "Byggprogram för tidrapportering, projekt, ÄTA och fakturering",
  description:
    "Bynex samlar tidrapportering, byggdagbok, projektstyrning, ÄTA, offert, fakturering, löneunderlag, material och bokföring för svenska byggföretag.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "Bynex – byggprogrammet som driver arbetet framåt",
    description:
      "Från åtta sekunders tidrapportering på bygget till byggdagbok, ÄTA, löneunderlag och faktura i samma system.",
  },
};

type Plan = {
  name: string;
  price: number;
  audience: string;
  users: string;
  features: string[];
  featured?: boolean;
  badge?: string;
};

const promises = [
  "Registrera tid från mobilen på sekunder",
  "Låt Bynex Smart bygga dagbok och underlag",
  "Fakturera snabbare med spårbara projektdata",
];

const modules = [
  {
    icon: Clock3,
    name: "Bynex Tid & Personal",
    text: "Tidrapportering för bygg, in- och utcheckning, raster, frånvaro, attest och löneunderlag i samma flöde.",
  },
  {
    icon: FolderKanban,
    name: "Bynex Projekt",
    text: "Projektstyrning, bemanning, tidsplan, dokumentation, risker, kostnader och marginal samlat per projekt.",
  },
  {
    icon: FileCheck2,
    name: "Bynex Byggdagbok",
    text: "Tid, bilder, väder, material och korta arbetsanteckningar blir en sökbar dagbok för kontor, kund och Pärmen.",
  },
  {
    icon: FileSignature,
    name: "Bynex ÄTA",
    text: "Dokumentera ändringen, få AI-stödd prisuppskattning och inhämta kundens spårbara startbesked.",
  },
  {
    icon: ReceiptText,
    name: "Bynex Offert & Fakturering",
    text: "Återanvänd kund-, kalkyl- och projektdata från första offert till granskat fakturaunderlag.",
  },
  {
    icon: PackageSearch,
    name: "Bynex Material",
    text: "Egna prislistor, artiklar, kvitton, leveranser, verifierade hyllkantspriser och projektets materialunderlag.",
  },
  {
    icon: QrCode,
    name: "Bynex Maskiner",
    text: "QR, utlåning, placering, service, kontroller och bevis för företagets maskiner och verktyg.",
  },
  {
    icon: BookOpenCheck,
    name: "Bynex Bokföring",
    text: "Verifikat, leverantörsfakturor, kundfakturor, moms och neutral SIE-import eller export i samma företagsyta.",
  },
];

const plans: Plan[] = [
  {
    name: "Bynex Företag",
    price: 439,
    audience: "Företagsgrunden för enskild firma och mindre aktiebolag.",
    users: "1 användare ingår",
    features: [
      "Bynex Tid och löneunderlag",
      "Projekt, fakturering och byggdagbok",
      "Bokföringsarbetsyta och SIE",
      "Bynex Smart i företagets egna data",
    ],
  },
  {
    name: "Bynex Bygg",
    price: 899,
    audience: "För byggföretag som vill styra hela flödet från arbetsplats till kund.",
    users: "5 användare ingår",
    featured: true,
    badge: "Rekommenderad",
    features: [
      "Allt i Bynex Företag",
      "Offert, ÄTA och material",
      "Arbetsledare, platschef och tidsplan",
      "Bynex Pärmen och maskinpark",
    ],
  },
  {
    name: "Bynex Fastighet",
    price: 1295,
    audience: "För fastighetsägare och förvaltare som behöver långsiktig kontroll.",
    users: "4 användare ingår",
    features: [
      "Allt i Bynex Företag",
      "Fastigheter, enheter och service",
      "Digital dokumentation och Pärmen",
      "Maskiner, nycklar och tillgångar",
    ],
  },
  {
    name: "Bynex Komplett",
    price: 1499,
    audience: "Hela Bynex för verksamheter som arbetar över flera områden.",
    users: "10 användare ingår",
    features: [
      "Företag, bygg och fastighet",
      "Alla tillgängliga branschmoduler",
      "Gemensam data och behörighetsstyrning",
      "Väx utan att byta system",
    ],
  },
];

const flow = [
  {
    step: "01",
    title: "Fånga verkligheten på bygget",
    text: "Tid, tre ord, bilder, material, leveranser och avvikelser registreras där arbetet händer.",
  },
  {
    step: "02",
    title: "Bynex Smart gör underlaget användbart",
    text: "AI skapar dagbok, hittar saknad tid, föreslår ÄTA-pris och visar nästa viktiga åtgärd.",
  },
  {
    step: "03",
    title: "Kontoret granskar och skickar vidare",
    text: "Samma data används till bemanning, lön, offert, faktura, projektuppföljning och kundens Pärm.",
  },
];

const smartActions = [
  {
    icon: CircleAlert,
    eyebrow: "Risk före arbetsstart",
    title: "Granska blockerad ÄTA",
    text: "Bynex Smart visar projekt, uppskattat värde och varför arbetet inte bör starta utan kundbeslut.",
  },
  {
    icon: CircleDollarSign,
    eyebrow: "Fakturering",
    title: "Tre underlag är redo",
    text: "Utförd tid, material och godkända ÄTA samlas till fakturaförslag i stället för att letas fram i efterhand.",
  },
  {
    icon: Clock3,
    eyebrow: "Tid & lön",
    title: "Två personer saknar tid",
    text: "Påminnelser och avvikelser visas innan löneunderlaget eller kundfakturan blir ofullständig.",
  },
  {
    icon: FolderKanban,
    eyebrow: "Projektmarginal",
    title: "Marginalen har sjunkit",
    text: "Företagets egna historik används för att upptäcka kostnadsrisker och förbättra kommande kalkyler.",
  },
];

const questions: Array<[string, string]> = [
  [
    "Kan vi prova Bynex med företagets egna data?",
    "Ja. Ni får ett eget avgränsat Bynex-företag och kan prova valda arbetsflöden kostnadsfritt i 14 dagar. Ingen betalning krävs för att starta.",
  ],
  [
    "Vad gäller för nystartade företag?",
    "Nystartade företag kan ansöka om 6 månader Bynex Företag utan kostnad. Förmånen aktiveras först efter separat kontroll av organisationsnummer och registreringsdatum. Andra paket och tillvalsmoduler följer ordinarie pris.",
  ],
  [
    "Kan ett enmans-AB välja Bynex Företag?",
    "Ja. Bynex Företag är grundpaketet för både enskild firma och mindre aktiebolag. Företaget behåller projekt, dokument och historik när det växer eller byter paket.",
  ],
  [
    "Kan andra företag se vår information?",
    "Nej. Åtkomst avgränsas per företag, roll och aktiverad modul. Användaren arbetar bara med information som den har behörighet till.",
  ],
  [
    "Vad är Bynex Smart?",
    "Bynex Smart är den operativa AI-motorn i Bynex. Den hjälper i rätt modul, hittar risker och saknade underlag, förbereder nästa åtgärd och använder bara det aktuella företagets behörighetsstyrda data.",
  ],
  [
    "Hur snabbt kan en anställd rapportera tid?",
    "Flödet är byggt för att kunna gå från telefonen till registrerad tid på ungefär åtta sekunder i ett normalt återkommande projekt. En kort anteckning kan sedan användas av Bynex Smart till byggdagbok och underlag.",
  ],
  [
    "Ingår bokföring?",
    "Bynex Företag och de större paketen innehåller Bynex Bokföring och SIE-flöde. Direkta bank-, myndighets- och externa systemkopplingar visas först när respektive anslutning är verifierad och aktiverad.",
  ],
  [
    "Hur fungerar kundportalen och Bynex Pärmen?",
    "Företaget väljer vad som publiceras. Kunden kan följa granskad byggdagbok, händelser, dokument, ritningar och garantier utan att interna priser eller anteckningar följer med automatiskt.",
  ],
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Bynex",
      url: siteUrl,
      logo: `${siteUrl}/brand/bynex-mark.png`,
      description:
        "Svenskt affärs- och byggsystem för tid, projekt, byggdagbok, ÄTA, offert, fakturering och bokföring.",
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Bynex",
      inLanguage: "sv-SE",
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "Bynex",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "sv-SE",
      description:
        "Byggprogram för tidrapportering, projektstyrning, byggdagbok, ÄTA, offert, fakturering, löneunderlag, material och bokföring.",
      audience: {
        "@type": "BusinessAudience",
        audienceType: "Byggföretag, entreprenörer, hantverkare och fastighetsföretag",
      },
      offers: plans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.price,
        priceCurrency: "SEK",
        url: `${siteUrl}/#priser`,
        category: "Månadsabonnemang exklusive moms",
      })),
      provider: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#fragor`,
      mainEntity: questions.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ],
};

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-[#111214]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />

      <header className="relative z-20 border-b border-[#d5d4d0] bg-[#f5f3ee]/90 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Logo priority />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#555b63] lg:flex" aria-label="Huvudmeny">
            <a href="#varfor" className="transition hover:text-black">Varför Bynex</a>
            <a href="#smart" className="transition hover:text-black">Bynex Smart</a>
            <a href="#funktioner" className="transition hover:text-black">Funktioner</a>
            <a href="#priser" className="transition hover:text-black">Priser</a>
            <a href="#fragor" className="transition hover:text-black">Frågor</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-semibold transition hover:bg-white">Logga in</Link>
            <Link href="/signup" className="rounded-xl bg-[#1d1f22] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black">Prova Bynex</Link>
          </div>
        </div>
      </header>

      <section className="relative border-b border-[#d5d4d0] px-5 py-16 md:px-10 md:py-24">
        <div className="absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_68%_28%,rgba(171,176,184,0.36),transparent_42%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.03fr_0.97fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c8cbd0] bg-white/70 px-4 py-2 text-sm font-semibold text-[#444a52] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#2f7d4d]" /> 14 dagar kostnadsfritt
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Byggprogram för tid, projekt, ÄTA och fakturering.
              <span className="mt-3 block text-[#555b63]">Hela byggföretaget i ett system.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#555b63] sm:text-xl">
              Bynex kopplar ihop arbetsplatsen och kontoret: tidrapportering, byggdagbok, personal, offert, ÄTA, material, löneunderlag, faktura och bokföring använder samma granskade projektdata.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214] shadow-xl shadow-black/10 transition hover:bg-[#d2d5da]">
                Prova gratis i 14 dagar <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#smart" className="inline-flex items-center justify-center rounded-2xl border border-[#c8cbd0] bg-white/70 px-7 py-4 font-semibold transition hover:bg-white">Se hur Bynex Smart arbetar</a>
            </div>
            <div className="mt-8 grid max-w-3xl gap-3 text-sm text-[#4d535b] sm:grid-cols-3">
              {promises.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7d4d]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#111214] p-5 text-white shadow-2xl sm:p-7">
            <div className="flex min-h-40 items-center justify-center rounded-[2rem] border border-white/10 bg-[#07080a] px-8 py-8">
              <Image src="/brand/bynex-wordmark.png" alt="Bynex" width={2172} height={724} priority className="h-auto w-full max-w-xl" />
            </div>
            <div className="mt-5 rounded-[1.7rem] border border-amber-200/20 bg-amber-200/10 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Bynex Smart · behöver åtgärd</p>
                  <h2 className="mt-2 text-xl font-semibold">Arbetsstart riskerar att ske utan godkänd ÄTA</h2>
                </div>
                <CircleAlert className="h-6 w-6 shrink-0 text-amber-200" />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#d7dade] sm:grid-cols-2">
                <p>Projekt: Tillbyggnad</p>
                <p>Uppskattat värde: 18 500 kr</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#c9cdd3]">Rekommendation: skicka det låsta underlaget till kunden innan den ändrade omfattningen startas.</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                <Clock3 className="h-6 w-6 text-[#c9cdd3]" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#aeb4bd]">Åtta sekunder</p>
                <h2 className="mt-2 text-xl font-semibold">Tid direkt på bygget</h2>
                <p className="mt-3 text-sm leading-6 text-[#c9cdd3]">Välj projekt, stämpla och skriv eller tala tre ord.</p>
              </div>
              <div className="rounded-[1.7rem] bg-[#b9bec6] p-5 text-[#111214]">
                <FileCheck2 className="h-6 w-6" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#454a51]">Samma data</p>
                <h2 className="mt-2 text-xl font-semibold">Dagbok, lön och faktura</h2>
                <p className="mt-3 text-sm leading-6 text-[#3f444b]">Kontoret granskar i stället för att skriva om.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="varfor" className="scroll-mt-20 bg-[#1d1f22] px-5 py-20 text-white md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Bygg mer. Administrera mindre.</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">Det som händer på bygget ska bli användbar data – inte mer dubbelarbete.</h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[#c9cdd3]">
              Ett modernt byggsystem måste hjälpa snickaren, arbetsledaren, projektledaren och ekonomin i samma kedja. Därför följer Bynex underlaget från mobilens första registrering till kundens faktura och digitala Pärm.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 lg:grid-cols-3">
            {flow.map((item) => (
              <article key={item.step} className="bg-[#1d1f22] p-7 sm:p-9">
                <span className="text-sm font-bold tracking-[0.18em] text-[#b9bec6]">{item.step}</span>
                <h3 className="mt-10 text-2xl font-semibold">{item.title}</h3>
                <p className="mt-4 leading-7 text-[#c9cdd3]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="smart" className="scroll-mt-20 border-b border-[#d5d4d0] px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Bynex Smart · bygg-AI i arbetsflödet</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">AI som driver företaget framåt – inte bara svarar på frågor.</h2>
            </div>
            <p className="text-lg leading-8 text-[#5d636b]">
              Bynex Smart bevakar det aktuella företagets projektdata, hittar blockerade ÄTA, saknad tid, faktureringsmöjligheter och marginalrisker. Den kan även hjälpa till med prisuppskattning, offert, byggdagbok, tidsplan och rätt bemanning – alltid med mänsklig kontroll där beslut krävs.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {smartActions.map(({ icon: Icon, eyebrow, title, text }) => (
              <article key={title} className="rounded-[2rem] border border-[#d5d4d0] bg-[#fbfaf7] p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[#1d1f22] p-3 text-white"><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6b7179]">{eyebrow}</p>
                    <h3 className="mt-2 text-2xl font-semibold">{title}</h3>
                    <p className="mt-3 leading-7 text-[#5d636b]">{text}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <article className="rounded-[2rem] bg-[#b9bec6] p-7">
              <CalendarDays className="h-7 w-7" />
              <h3 className="mt-8 text-2xl font-semibold">Tidsplan från offert</h3>
              <p className="mt-3 leading-7 text-[#3f444b]">Smart kan föreslå byggmoment, yrkesgrupper, beroenden och milstolpar som sedan granskas i projektet.</p>
            </article>
            <article className="rounded-[2rem] bg-[#dfe2e5] p-7">
              <HardHat className="h-7 w-7" />
              <h3 className="mt-8 text-2xl font-semibold">Rätt person på rätt plats</h3>
              <p className="mt-3 leading-7 text-[#4d535b]">Kompetens, behörigheter, arbetad tid och faktisk projekthistorik kan stödja bemanningsförslag.</p>
            </article>
            <article className="rounded-[2rem] bg-[#1d1f22] p-7 text-white">
              <Sparkles className="h-7 w-7 text-[#b9bec6]" />
              <h3 className="mt-8 text-2xl font-semibold">Företagets egen erfarenhet</h3>
              <p className="mt-3 leading-7 text-[#c9cdd3]">Ju mer granskad data företaget samlar, desto bättre underlag får kommande priser, tidsplaner och riskbedömningar.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="funktioner" className="scroll-mt-20 px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Byggprogram för svenska företag</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Tidrapportering, byggdagbok och ekonomi i samma projektflöde.</h2>
            <p className="mt-5 text-lg leading-8 text-[#5d636b]">Varje roll ser relevanta moduler. Informationen stannar samtidigt i samma företagsyta och återanvänds där behörigheten tillåter det.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map(({ icon: Icon, name, text }) => (
              <article key={name} className="group rounded-[2rem] border border-[#d5d4d0] bg-[#fbfaf7] p-6 transition hover:-translate-y-1 hover:border-[#aeb4bd] hover:shadow-xl">
                <div className="inline-flex rounded-2xl bg-[#e3e4e3] p-3 text-[#383d43]"><Icon className="h-6 w-6" /></div>
                <h3 className="mt-6 text-xl font-semibold">{name}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5d636b]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#d5d4d0] bg-[#ebeae6] px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2.3rem] bg-[#1d1f22] p-8 text-white sm:p-10">
            <Clock3 className="h-8 w-8 text-[#b9bec6]" />
            <p className="mt-10 text-sm font-bold uppercase tracking-[0.18em] text-[#b9bec6]">Från telefon till registrerad tid</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">Byggt för åtta sekunder i vardagen.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9cdd3]">Återkommande projekt ska inte kräva långa formulär. Medarbetaren stämplar, väljer projekt och lämnar en kort arbetsnotering.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ["1", "Stämpla in eller välj projekt"],
              ["2", "Skriv eller tala tre ord"],
              ["3", "Smart förbereder dagbok och underlag"],
            ].map(([number, text]) => (
              <div key={number} className="flex items-center gap-4 rounded-[1.7rem] border border-[#d0d0cc] bg-[#fbfaf7] p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b9bec6] font-bold">{number}</span>
                <p className="font-semibold">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-emerald-950 p-8 text-white sm:p-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-emerald-200"><BadgeCheck className="h-6 w-6" /><p className="text-sm font-bold uppercase tracking-[0.18em]">Nystartat företag</p></div>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em]">Ansök om 6 månader Bynex Företag utan kostnad.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-emerald-100/80">Ange organisationsnummer vid registreringen. Efter godkänd kontroll av företaget och registreringsdatum kan Bynex Företag aktiveras kostnadsfritt i sex månader. Andra paket och tillvalsmoduler följer ordinarie pris.</p>
            </div>
            <Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-semibold text-emerald-950">Skapa konto och ansök <ArrowRight className="h-5 w-5" /></Link>
          </div>
        </div>
      </section>

      <section id="priser" className="scroll-mt-20 border-y border-[#d5d4d0] bg-[#ebeae6] px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.65fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Paket och priser</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Börja med företagsgrunden. Lägg till branschen.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5d636b]">Alla priser nedan är ordinarie månadspris exklusive moms med 12 månaders bindningstid efter provperioden. Prova först med er egen verksamhet i 14 dagar.</p>
            </div>
            <div className="rounded-[2rem] bg-[#1d1f22] p-6 text-white">
              <p className="text-sm font-semibold text-[#b9bec6]">Gemensamt i alla paket</p>
              <p className="mt-3 text-xl font-semibold">Tid, projekt, fakturering, bokföringsarbetsyta och Bynex Smart.</p>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article key={plan.name} className={`flex flex-col rounded-[2rem] border p-6 ${plan.featured ? "border-[#1d1f22] bg-[#1d1f22] text-white shadow-2xl" : "border-[#d0d0cc] bg-[#fbfaf7]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  {plan.badge && <span className="rounded-full bg-[#b9bec6] px-3 py-1 text-[11px] font-bold text-[#111214]">{plan.badge}</span>}
                </div>
                <p className={`mt-3 min-h-20 text-sm leading-6 ${plan.featured ? "text-[#c9cdd3]" : "text-[#5d636b]"}`}>{plan.audience}</p>
                <div className="mt-5">
                  <p className="text-4xl font-semibold">{plan.price.toLocaleString("sv-SE")} kr</p>
                  <p className={`mt-1 text-xs ${plan.featured ? "text-[#aeb4bd]" : "text-[#717780]"}`}>per företag/mån exkl. moms</p>
                </div>
                <p className="mt-6 flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4" /> {plan.users}</p>
                <ul className="mt-5 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className={`flex items-start gap-2 text-sm leading-6 ${plan.featured ? "text-[#d7dade]" : "text-[#5d636b]"}`}>
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2f7d4d]" />{feature}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className={`mt-7 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold ${plan.featured ? "bg-[#b9bec6] text-[#111214]" : "bg-[#1d1f22] text-white"}`}>Prova i 14 dagar</Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-[#666c74]">Längre bindningstid och separata tillval visas när företaget väljer eller ändrar abonnemang. Direkta bank-, myndighets- och externa systemanslutningar visas endast när den aktuella kopplingen är verifierad och aktiverad.</p>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[2.3rem] bg-[#b9bec6] p-8 sm:p-10">
            <Building2 className="h-8 w-8" />
            <h2 className="mt-10 max-w-3xl text-4xl font-semibold tracking-[-0.035em]">Ett system som följer byggföretaget när det växer.</h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#3f444b]">Börja som ensam företagare, bygg teamet, lägg till branschmoduler och behåll projekt, dokument och historik i samma struktur.</p>
          </div>
          <div className="rounded-[2.3rem] bg-[#1d1f22] p-8 text-white sm:p-10">
            <ShieldCheck className="h-8 w-8 text-[#b9bec6]" />
            <h2 className="mt-10 text-3xl font-semibold">Rätt data till rätt person.</h2>
            <p className="mt-5 leading-7 text-[#c9cdd3]">Företag, roller, moduler, ekonomisk åtkomst och kundpublicering styrs separat.</p>
          </div>
        </div>
      </section>

      <section id="fragor" className="scroll-mt-20 border-t border-[#d5d4d0] px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Vanliga frågor om Bynex</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">Inför provperioden och företagsstarten.</h2>
            <p className="mt-5 leading-7 text-[#5d636b]">Tydliga svar om byggsystemet, Bynex Smart, åtkomst, priser och hur företagets data används.</p>
          </div>
          <SmartFaq questions={questions} />
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-[#111214] p-8 text-white sm:p-12 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Redo att prova?</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">Öppna ert Bynex-företag.</h2>
            <p className="mt-4 text-[#c9cdd3]">14 dagar med er egen verksamhet. Ingen betalning krävs för att börja testa.</p>
          </div>
          <Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214]">Starta gratis <ArrowRight className="h-5 w-5" /></Link>
        </div>
      </section>

      <footer className="border-t border-[#d5d4d0] px-5 py-8 text-sm text-[#666c74] md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><Logo /><p className="mt-3">Bygg mer. Administrera mindre.</p></div>
          <div className="flex gap-5"><Link href="/login" className="font-semibold text-[#444a52]">Logga in</Link><Link href="/signup" className="font-semibold text-[#111214]">Skapa konto</Link></div>
        </div>
      </footer>
    </main>
  );
}
