import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  FolderKanban,
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

const siteUrl = "https://bynex.se";
const pageTitle = "Byggsystem för tidrapportering, projekt, ÄTA och fakturering";
const pageDescription = "Bynex är ett svenskt byggsystem som samlar tidrapportering, personal, projekt, byggdagbok, offert, ÄTA, material, fakturering, lön och bokföring i ett arbetsflöde.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: "/",
  },
  keywords: [
    "byggsystem",
    "affärssystem bygg",
    "tidrapportering bygg",
    "byggdagbok",
    "ÄTA bygg",
    "offert byggföretag",
    "fakturering bygg",
    "lön byggföretag",
    "bokföring byggföretag",
    "projektledning bygg",
    "Bynex",
  ],
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: siteUrl,
    title: `${pageTitle} | Bynex`,
    description: pageDescription,
    images: [
      {
        url: "/brand/bynex-wordmark.png",
        width: 2172,
        height: 724,
        alt: "Bynex byggsystem",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${pageTitle} | Bynex`,
    description: pageDescription,
    images: ["/brand/bynex-wordmark.png"],
  },
};

const promises = [
  "Registrera en gång – använd underlaget hela vägen",
  "Fånga tid, kostnader, dagbok och ÄTA på bygget",
  "Fakturera snabbare med ett granskat projektunderlag",
];

const modules = [
  {
    icon: Clock3,
    name: "Bynex Tid & Personal",
    text: "Tidrapportering, in- och utcheckning, GPS-policy, raster, frånvaro, attest, personal och löneunderlag i samma arbetsflöde.",
  },
  {
    icon: FolderKanban,
    name: "Bynex Projekt & Byggdagbok",
    text: "Planering, bemanning, byggdagbok, dokumentation, risker, kostnader och ekonomi samlat per byggprojekt.",
  },
  {
    icon: ReceiptText,
    name: "Bynex Offert & Fakturering",
    text: "Återanvänd kund-, kalkyl- och projektdata från första offert till färdigt fakturaunderlag.",
  },
  {
    icon: FileSignature,
    name: "Bynex ÄTA",
    text: "Dokumentera ändringen, låt Bynex Smart uppskatta priset och inhämta kundens spårbara godkännande.",
  },
  {
    icon: PackageSearch,
    name: "Bynex Material & Inköp",
    text: "Arbeta med egna prislistor, hyllkantspriser, leverantörsunderlag, materialpåslag och inköp per projekt.",
  },
  {
    icon: QrCode,
    name: "Bynex Maskiner",
    text: "QR-koder, utlåning, placering, service, underhåll och bevis för företagets maskiner och tillgångar.",
  },
  {
    icon: HousePlug,
    name: "Bynex Pärmen",
    text: "Dela granskad projekthistorik och bevara dagbok, ritningar, garantier, installationer och dokument för kunden.",
  },
  {
    icon: BookOpenCheck,
    name: "Bynex Bokföring",
    text: "Samla verifikat, kvitton och leverantörsfakturor, arbeta i Bynex och flytta bokföringsdata med SIE.",
  },
];

const smartActions = [
  "Hittar blockerade ÄTA innan arbete startar utan godkännande",
  "Upptäcker saknad tid, glömda utstämplingar och ofullständiga underlag",
  "Föreslår fakturering när projektets granskade underlag är klart",
  "Varnar när projektets marginal eller tidsplan börjar avvika",
  "Förbereder dagbok, offerttext, kalkyl och löneunderlag för granskning",
  "Lär av företagets egna verifierade utfall utan att blanda data mellan företag",
];

const plans = [
  {
    name: "Bynex Företag",
    price: 439,
    audience: "Företagsgrunden för enskild firma och mindre aktiebolag.",
    users: "1 användare ingår",
    features: [
      "Bynex Tid, personal och löneunderlag",
      "Projekt och fakturering",
      "Bynex Bokföring och SIE",
      "Bynex Smart i företagets egna data",
    ],
  },
  {
    name: "Bynex Bygg",
    price: 899,
    audience: "För byggföretag som vill styra hela flödet från byggplats till kund och ekonomi.",
    users: "5 användare ingår",
    featured: true,
    badge: "Rekommenderad",
    features: [
      "Allt i Bynex Företag",
      "Offert, ÄTA, byggdagbok och material",
      "Arbetsledare och platschef",
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
      "Kundportal och digital dokumentation",
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
    text: "Tid, tre ord till byggdagbok, bilder, material, beslut och avvikelser registreras där arbetet händer.",
  },
  {
    step: "02",
    title: "Bynex Smart granskar nästa steg",
    text: "Kontoret får ett sammanhängande underlag och Smart lyfter det som behöver göras nu – inte bara statistik i efterhand.",
  },
  {
    step: "03",
    title: "Offert, lön och faktura bygger på samma data",
    text: "Granskad tid, dagbok, ÄTA och material återanvänds utan dubbelregistrering och rätt information delas med kunden.",
  },
];

const seoAreas = [
  {
    title: "Tidrapportering för byggföretag",
    text: "Medarbetare och UE ska kunna registrera tid snabbt i mobilen. Tiden kopplas till rätt projekt, arbetsmoment, dagbok, löneunderlag och fakturering.",
  },
  {
    title: "Byggdagbok och projektdokumentation",
    text: "Dagboken blir användbar för både byggplats, kontor, lön och faktura. Granskade händelser sparas i projektet och kan publiceras i Bynex Pärmen.",
  },
  {
    title: "ÄTA, offert och faktura i samma flöde",
    text: "Bynex Smart hjälper till med omfattning, följdfrågor, uppskattat pris, villkor och kundgodkännande innan underlaget förs vidare till fakturering.",
  },
];

const questions: Array<[string, string]> = [
  [
    "Kan vi prova Bynex med egen data?",
    "Ja. Ni skapar ett eget företag med organisationsnummer och kan prova de aktiverade arbetsflödena kostnadsfritt i 14 dagar. Ingen betalning krävs för att börja.",
  ],
  [
    "Varför måste vi ange organisationsnummer och företagsform?",
    "Uppgifterna används för att identifiera företaget och för att Bynex ska visa rätt menyer, avtal och ekonomiflöden. Aktiebolag ser exempelvis inte funktioner som bara gäller enskild firma.",
  ],
  [
    "Är Bynex ett byggsystem eller ett affärssystem?",
    "Bynex är båda delarna. Systemet kombinerar byggplatsens tid, dagbok, projekt, material och ÄTA med kontorets offert, fakturering, lön och bokföring.",
  ],
  [
    "Vad gör Bynex Smart i praktiken?",
    "Bynex Smart arbetar i flödena: den hittar blockerade ÄTA, saknad tid och risker, hjälper till med kalkyl och texter samt föreslår nästa åtgärd. Behörig person granskar alltid pris, avtal och beslut innan kunden får underlaget.",
  ],
  [
    "Kan ett enmans-AB välja Bynex Företag?",
    "Ja. Bynex Företag är grundpaketet för både enskild firma och mindre aktiebolag. Företaget behåller projekt, dokument och historik när det växer eller byter paket.",
  ],
  [
    "Kan andra företag se vår information?",
    "Nej. Åtkomst avgränsas per företag, roll och aktiverad modul. Företagets egna data används bara inom den egna behörighetsstyrda miljön.",
  ],
  [
    "Ingår bokföring, lön och fakturering?",
    "Bynex Företag och större paket innehåller tid, löneunderlag, fakturering och Bynex Bokföring med SIE. Direkta externa kopplingar visas först när respektive anslutning är verifierad och aktiverad.",
  ],
  [
    "Hur fungerar Bynex Pärmen för kunden?",
    "Företaget väljer vad som publiceras. Kunden kan följa granskad byggdagbok, projekthändelser, dokument, garantier och beslut utan att interna priser eller personuppgifter följer med automatiskt.",
  ],
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Bynex",
    url: siteUrl,
    logo: `${siteUrl}/brand/bynex-mark.png`,
    description: pageDescription,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: "Bynex",
    inLanguage: "sv-SE",
    publisher: { "@id": `${siteUrl}/#organization` },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#software`,
    name: "Bynex",
    url: siteUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "sv-SE",
    description: pageDescription,
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Byggföretag, hantverksföretag och fastighetsverksamheter",
    },
    featureList: modules.map((module) => module.name),
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price,
      priceCurrency: "SEK",
      category: "Månadsabonnemang exklusive moms",
      url: `${siteUrl}/#priser`,
    })),
    provider: { "@id": `${siteUrl}/#organization` },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  },
];

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-[#111214]">
        <header className="relative z-20 border-b border-[#d5d4d0] bg-[#f5f3ee]/90 px-5 py-4 backdrop-blur md:px-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <Logo priority />
            <nav aria-label="Huvudmeny" className="hidden items-center gap-7 text-sm font-semibold text-[#555b63] lg:flex">
              <a href="#byggsystem" className="transition hover:text-black">Byggsystem</a>
              <a href="#funktioner" className="transition hover:text-black">Funktioner</a>
              <a href="#smart" className="transition hover:text-black">Bynex Smart</a>
              <a href="#priser" className="transition hover:text-black">Priser</a>
              <a href="#fragor" className="transition hover:text-black">Frågor</a>
            </nav>
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-semibold transition hover:bg-white">Logga in</Link>
              <Link href="/signup" className="rounded-xl bg-[#1d1f22] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black">Prova i 14 dagar</Link>
            </div>
          </div>
        </header>

        <section className="relative border-b border-[#d5d4d0] px-5 py-16 md:px-10 md:py-24">
          <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_68%_28%,rgba(171,176,184,0.36),transparent_42%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.03fr_0.97fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8cbd0] bg-white/70 px-4 py-2 text-sm font-semibold text-[#444a52] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#2f7d4d]" /> 14 dagar kostnadsfritt
              </div>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                Byggsystem för tid, projekt, ÄTA och ekonomi.
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-[#555b63] sm:text-xl">
                Bynex samlar tidrapportering, personal, byggdagbok, projekt, offert, ÄTA, material, fakturering, lön och bokföring. Mindre dubbelarbete – snabbare väg från byggplats till betald faktura.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214] shadow-xl shadow-black/10 transition hover:bg-[#d2d5da]">
                  Starta gratis i 14 dagar <ArrowRight className="h-5 w-5" />
                </Link>
                <a href="#priser" className="inline-flex items-center justify-center rounded-2xl border border-[#c8cbd0] bg-white/70 px-7 py-4 font-semibold transition hover:bg-white">Se paket och priser</a>
              </div>
              <p className="mt-4 text-sm text-[#666c74]">Organisationsnummer krävs. Ingen betalning krävs för att börja.</p>
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
              <div className="flex min-h-44 items-center justify-center rounded-[2rem] border border-white/10 bg-[#07080a] px-8 py-9">
                <Image src="/brand/bynex-wordmark.png" alt="Bynex byggsystem" width={2172} height={724} priority className="h-auto w-full max-w-xl" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                  <Sparkles className="h-6 w-6 text-[#c9cdd3]" />
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#aeb4bd]">Bynex Smart</p>
                  <h2 className="mt-2 text-xl font-semibold">AI som arbetar i flödet</h2>
                  <p className="mt-3 text-sm leading-6 text-[#c9cdd3]">Hittar risker, förbereder underlag och visar företagets viktigaste nästa åtgärd.</p>
                </div>
                <div className="rounded-[1.7rem] bg-[#b9bec6] p-5 text-[#111214]">
                  <ShieldCheck className="h-6 w-6" />
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#454a51]">Företagets data</p>
                  <h2 className="mt-2 text-xl font-semibold">Avgränsad från början</h2>
                  <p className="mt-3 text-sm leading-6 text-[#3f444b]">Roller och moduler styr vad varje användare kan läsa, redigera och godkänna.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="byggsystem" className="scroll-mt-20 bg-[#1d1f22] px-5 py-20 text-white md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-5xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Bygg mer. Administrera mindre.</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
                Ett affärssystem byggt runt verkligheten i byggföretaget.
              </h2>
              <p className="mt-6 max-w-4xl text-lg leading-8 text-[#c9cdd3]">
                Information som registreras på byggplatsen ska bli användbar för projektledning, kunddialog, lön, fakturering och bokföring – utan att samma uppgift skrivs flera gånger.
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

        <section className="px-5 py-20 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">För svenska byggföretag</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Från åtta sekunders tidrapportering till färdigt fakturaunderlag.</h2>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {seoAreas.map((area) => (
                <article key={area.title} className="rounded-[2rem] border border-[#d5d4d0] bg-[#fbfaf7] p-7">
                  <h3 className="text-2xl font-semibold">{area.title}</h3>
                  <p className="mt-4 leading-7 text-[#5d636b]">{area.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="funktioner" className="scroll-mt-20 border-t border-[#d5d4d0] px-5 py-20 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Bynex-moduler</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Rätt verktyg i rätt del av företaget.</h2>
              <p className="mt-5 text-lg leading-8 text-[#5d636b]">Varje roll ser relevanta moduler. Informationen stannar samtidigt i samma företagsyta och kan återanvändas där behörigheten tillåter det.</p>
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

        <section id="smart" className="scroll-mt-20 bg-[#111214] px-5 py-20 text-white md:px-10">
          <div className="mx-auto grid max-w-7xl gap-10 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
            <div className="xl:sticky xl:top-28">
              <div className="inline-flex rounded-2xl bg-white/10 p-3"><Sparkles className="h-7 w-7 text-[#c9cdd3]" /></div>
              <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Bynex Smart</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">AI som hjälper till att driva företaget.</h2>
              <p className="mt-5 text-lg leading-8 text-[#c9cdd3]">Inte bara en chatt eller sammanfattning. Bynex Smart bevakar projektens arbetsflöden och hjälper användaren innan ett problem blir dyrt.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {smartActions.map((action) => (
                <article key={action} className="flex items-start gap-3 rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <p className="text-sm leading-6 text-[#d7dade]">{action}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="priser" className="scroll-mt-20 border-y border-[#d5d4d0] bg-[#ebeae6] px-5 py-20 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.65fr] lg:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Paket och priser</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Börja med företagsgrunden. Lägg till branschen.</h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5d636b]">Alla priser nedan är ordinarie månadspris exklusive moms med 12 månaders bindningstid. Prova först med er egen verksamhet i 14 dagar.</p>
              </div>
              <div className="rounded-[2rem] bg-[#1d1f22] p-6 text-white">
                <p className="text-sm font-semibold text-[#b9bec6]">Gemensam företagsgrund</p>
                <p className="mt-3 text-xl font-semibold">Tid, personal, projekt, fakturering, Bynex Bokföring och Bynex Smart.</p>
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
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2f7d4d]" />
                        {feature}
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
              <h2 className="mt-10 max-w-3xl text-4xl font-semibold tracking-[-0.035em]">Ett byggsystem som följer företaget när det växer.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#3f444b]">Börja som ensam företagare, bygg teamet, lägg till branschmoduler och behåll projekt, dokument, personal och historik i samma struktur.</p>
            </div>
            <div className="rounded-[2.3rem] bg-[#1d1f22] p-8 text-white sm:p-10">
              <FileCheck2 className="h-8 w-8 text-[#b9bec6]" />
              <h2 className="mt-10 text-3xl font-semibold">Rätt data till rätt person.</h2>
              <p className="mt-5 leading-7 text-[#c9cdd3]">Företag, roller, moduler, löneuppgifter och kundpublicering styrs separat.</p>
            </div>
          </div>
        </section>

        <section id="fragor" className="scroll-mt-20 border-t border-[#d5d4d0] px-5 py-20 md:px-10">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Vanliga frågor</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">Om Bynex, byggsystemet och provperioden.</h2>
              <p className="mt-5 leading-7 text-[#5d636b]">Tydliga svar om åtkomst, företagsform, AI, paket och hur informationen används.</p>
            </div>
            <SmartFaq questions={questions} />
          </div>
        </section>

        <section className="px-5 pb-20 md:px-10">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-[#111214] p-8 text-white sm:p-12 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Redo att prova?</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">Öppna ert Bynex-företag.</h2>
              <p className="mt-4 text-[#c9cdd3]">14 dagar med er egen verksamhet. Organisationsnummer krävs, men ingen betalning krävs för att börja testa.</p>
            </div>
            <Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214]">Starta gratis <ArrowRight className="h-5 w-5" /></Link>
          </div>
        </section>

        <footer className="border-t border-[#d5d4d0] px-5 py-8 text-sm text-[#666c74] md:px-10">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <Logo />
              <p className="mt-3">Bygg mer. Administrera mindre.</p>
            </div>
            <div className="flex gap-5">
              <Link href="/login" className="font-semibold text-[#444a52]">Logga in</Link>
              <Link href="/signup" className="font-semibold text-[#111214]">Prova i 14 dagar</Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
