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
const seoDescription =
  "Bynex är ett affärssystem och byggsystem för svenska byggföretag med tidrapportering, byggdagbok, projekt, ÄTA, offerter, fakturering, lön och bokföring i ett system.";

export const metadata: Metadata = {
  title: "Affärssystem för byggföretag",
  description: seoDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    locale: "sv_SE",
    siteName: "Bynex",
    title: "Bynex – affärssystem för byggföretag",
    description: seoDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Bynex – affärssystem för byggföretag",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bynex – affärssystem för byggföretag",
    description: seoDescription,
    images: ["/opengraph-image"],
  },
};

const promises = [
  "Registrera en gång – använd underlaget hela vägen",
  "Fånga tid, byggdagbok och ÄTA innan något tappas bort",
  "Fakturera snabbare med ett granskat projektunderlag",
];

const modules = [
  {
    icon: Clock3,
    name: "Bynex Tid & Personal",
    text: "Tidrapportering, GPS-policy, raster, frånvaro, attest, anställningskort och löneunderlag i samma arbetsflöde.",
  },
  {
    icon: FolderKanban,
    name: "Bynex Projekt & Byggdagbok",
    text: "Planering, bemanning, dagbok, bilder, dokumentation, risker och ekonomi samlat per byggprojekt.",
  },
  {
    icon: ReceiptText,
    name: "Bynex Offert & Faktura",
    text: "Återanvänd kund-, projekt-, tid- och materialdata från första kalkyl till färdigt fakturaunderlag.",
  },
  {
    icon: FileSignature,
    name: "Bynex ÄTA",
    text: "Dokumentera ändringen på plats, få hjälp med prisuppskattning och inhämta kundens spårbara startbesked.",
  },
  {
    icon: PackageSearch,
    name: "Bynex Material",
    text: "Arbeta med egna prislistor, verifierade leverantörskällor, artiklar, lagerläge, inköp och materialpåslag.",
  },
  {
    icon: QrCode,
    name: "Bynex Maskiner",
    text: "QR-koder, utlåning, placering, service, underhåll och bevis för företagets verkliga maskinpark.",
  },
  {
    icon: HousePlug,
    name: "Bynex Pärmen",
    text: "Dela granskad projekthistorik och bevara byggdagbok, ritningar, garantier och installationsdata för kunden.",
  },
  {
    icon: BookOpenCheck,
    name: "Bynex Bokföring",
    text: "Samla verifikat, kund- och leverantörsfakturor, moms och bokföringsdata med stöd för SIE-import och export.",
  },
];

const constructionWorkflows = [
  {
    icon: Clock3,
    title: "Tidrapportering och byggdagbok",
    text: "Medarbetaren registrerar tid och en kort arbetsbeskrivning. Kontoret får ett sammanhängande underlag för dagbok, lön och fakturering.",
  },
  {
    icon: FileSignature,
    title: "ÄTA, offert och kundbeslut",
    text: "Bynex Smart hjälper till med följdfrågor, kalkylunderlag och uppskattat pris. Behörig person granskar innan kunden får underlaget.",
  },
  {
    icon: ReceiptText,
    title: "Faktura, lön och bokföring",
    text: "Godkänd tid, material och ÄTA förs vidare i stället för att skrivas om. Företaget behåller kontrollen över pris, attest och publicering.",
  },
];

const plans = [
  {
    name: "Bynex Företag",
    price: 439,
    audience: "Företagsgrunden för enskild firma och mindre aktiebolag.",
    users: "1 användare ingår",
    features: [
      "Bynex Tid och löneunderlag",
      "Projekt och fakturering",
      "Bynex Bokföring och SIE",
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
      "Arbetsledning och byggdagbok",
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
      "Bynex Pärmen och digital dokumentation",
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
    title: "Fånga verkligheten",
    text: "Tid, bilder, material, dagbok, beslut och avvikelser registreras där arbetet händer.",
  },
  {
    step: "02",
    title: "Granska och agera",
    text: "Kontoret får ett sammanhängande underlag för bemanning, ekonomi, offert, lön och faktura.",
  },
  {
    step: "03",
    title: "Dela rätt information",
    text: "Kunden ser endast det som har granskats och publicerats för det aktuella projektet.",
  },
];

const questions: Array<[string, string]> = [
  [
    "Kan vi prova Bynex med egen data?",
    "Ja. Ni får ett eget företag och kan prova de aktiverade arbetsflödena kostnadsfritt i 14 dagar. Ingen betalning krävs för att starta provperioden.",
  ],
  [
    "Vilka byggföretag passar Bynex för?",
    "Bynex är byggt för bland annat byggentreprenörer, snickare, målare, elektriker, VVS-företag, markföretag, serviceföretag, underentreprenörer och fastighetsverksamheter.",
  ],
  [
    "Kan ett enmans-AB välja Bynex Företag?",
    "Ja. Bynex Företag är grundpaketet för både enskild firma och mindre aktiebolag. Företaget kan behålla sin historik när det växer och byter paket.",
  ],
  [
    "Kan andra företag se vår information?",
    "Nej. Åtkomst avgränsas per företag, roll och aktiverad modul. Användaren arbetar bara med information som den har behörighet till.",
  ],
  [
    "Vad är Bynex Smart?",
    "Bynex Smart hjälper i den modul där arbetet utförs, exempelvis med ÄTA, prisunderlag, saknad tid, fakturaunderlag och nästa rekommenderade åtgärd. Den använder företagets egna behörighetsstyrda uppgifter och blandar inte data mellan företag.",
  ],
  [
    "Ingår bokföring?",
    "Bynex Företag och de större paketen innehåller Bynex Bokföring och SIE-flöde. Direkta bank-, myndighets- och externa systemkopplingar visas först när respektive anslutning är verifierad och aktiverad.",
  ],
  [
    "Hur fungerar byggdagbok och kundportal?",
    "Tid, arbetsbeskrivningar, bilder och projektets granskade händelser kan återanvändas i byggdagboken. Företaget väljer därefter vad som publiceras i Bynex Pärmen för kunden.",
  ],
  [
    "Kan vi byta paket senare?",
    "Ja. Paket och köpta moduler styr vad som visas. Uppgradering ska kunna göras utan att företagets projekt och historik behöver flyttas.",
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
      description: seoDescription,
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
      applicationSubCategory: "Affärssystem för byggföretag",
      operatingSystem: "Web",
      inLanguage: "sv-SE",
      description: seoDescription,
      provider: { "@id": `${siteUrl}/#organization` },
      offers: plans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        url: `${siteUrl}/#priser`,
        price: plan.price,
        priceCurrency: "SEK",
        availability: "https://schema.org/InStock",
        description: `${plan.audience} ${plan.users}. Ordinarie månadspris exklusive moms med 12 månaders bindningstid.`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: plan.price,
          priceCurrency: "SEK",
          unitText: "MONTH",
          valueAddedTaxIncluded: false,
        },
      })),
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
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

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-[#111214]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <header className="relative z-20 border-b border-[#d5d4d0] bg-[#f5f3ee]/90 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Logo priority />
          <nav
            className="hidden items-center gap-7 text-sm font-semibold text-[#555b63] lg:flex"
            aria-label="Huvudmeny"
          >
            <a href="#varfor" className="transition hover:text-black">
              Varför Bynex
            </a>
            <a href="#funktioner" className="transition hover:text-black">
              Funktioner
            </a>
            <a href="#byggsystem" className="transition hover:text-black">
              För byggföretag
            </a>
            <a href="#priser" className="transition hover:text-black">
              Priser
            </a>
            <a href="#fragor" className="transition hover:text-black">
              Frågor
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-4 py-3 text-sm font-semibold transition hover:bg-white"
            >
              Logga in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-[#1d1f22] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >
              Prova Bynex
            </Link>
          </div>
        </div>
      </header>

      <section className="relative border-b border-[#d5d4d0] px-5 py-16 md:px-10 md:py-24">
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_68%_28%,rgba(171,176,184,0.36),transparent_42%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.03fr_0.97fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c8cbd0] bg-white/70 px-4 py-2 text-sm font-semibold text-[#444a52] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#2f7d4d]" /> 14 dagar
              kostnadsfritt
            </div>
            <h1 className="mt-7 max-w-5xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Affärssystemet för byggföretag.
              <br />
              Hela företaget i ett system.
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-[#555b63] sm:text-xl">
              Bynex samlar tidrapportering, byggdagbok, personal, projekt, ÄTA,
              offerter, fakturering, lön och bokföring i ett sammanhängande
              arbetsflöde – från mobilen på bygget till kontoret.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214] shadow-xl shadow-black/10 transition hover:bg-[#d2d5da]"
              >
                Starta 14 dagar gratis <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#priser"
                className="inline-flex items-center justify-center rounded-2xl border border-[#c8cbd0] bg-white/70 px-7 py-4 font-semibold transition hover:bg-white"
              >
                Se paket och priser
              </a>
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
            <div className="flex min-h-44 items-center justify-center rounded-[2rem] border border-white/10 bg-[#07080a] px-8 py-9">
              <Image
                src="/brand/bynex-wordmark.png"
                alt="Bynex"
                width={2172}
                height={724}
                priority
                className="h-auto w-full max-w-xl"
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                <Sparkles className="h-6 w-6 text-[#c9cdd3]" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#aeb4bd]">
                  Bynex Smart
                </p>
                <h2 className="mt-2 text-xl font-semibold">Hjälp där arbetet sker</h2>
                <p className="mt-3 text-sm leading-6 text-[#c9cdd3]">
                  Prisunderlag, kontroller, risker och nästa rekommenderade åtgärd i
                  rätt modul och rätt projekt.
                </p>
              </div>
              <div className="rounded-[1.7rem] bg-[#b9bec6] p-5 text-[#111214]">
                <ShieldCheck className="h-6 w-6" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#454a51]">
                  Företagets data
                </p>
                <h2 className="mt-2 text-xl font-semibold">Avgränsad från början</h2>
                <p className="mt-3 text-sm leading-6 text-[#3f444b]">
                  Företag, roller och moduler styr vad varje användare kan läsa, ändra
                  och godkänna.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="varfor"
        className="scroll-mt-20 bg-[#1d1f22] px-5 py-20 text-white md:px-10"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">
              Bygg mer. Administrera mindre.
            </p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
              Det som händer i verksamheten ska bli användbar data – inte mer
              dubbelarbete.
            </h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 lg:grid-cols-3">
            {flow.map((item) => (
              <article key={item.step} className="bg-[#1d1f22] p-7 sm:p-9">
                <span className="text-sm font-bold tracking-[0.18em] text-[#b9bec6]">
                  {item.step}
                </span>
                <h3 className="mt-10 text-2xl font-semibold">{item.title}</h3>
                <p className="mt-4 leading-7 text-[#c9cdd3]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="funktioner" className="scroll-mt-20 px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">
              En gemensam grund
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              Bynex följer informationen från arbetsplats till ekonomi.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#5d636b]">
              Varje roll ser relevanta funktioner. Informationen stannar samtidigt i
              samma företagsyta och kan återanvändas där behörigheten tillåter det.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map(({ icon: Icon, name, text }) => (
              <article
                key={name}
                className="group rounded-[2rem] border border-[#d5d4d0] bg-[#fbfaf7] p-6 transition hover:-translate-y-1 hover:border-[#aeb4bd] hover:shadow-xl"
              >
                <div className="inline-flex rounded-2xl bg-[#e3e4e3] p-3 text-[#383d43]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">{name}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5d636b]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="byggsystem"
        className="scroll-mt-20 border-y border-[#d5d4d0] bg-[#fbfaf7] px-5 py-20 md:px-10"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">
                Byggsystem för verkliga arbetsflöden
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Tidrapportering, byggdagbok, ÄTA och fakturering hänger ihop.
              </h2>
            </div>
            <p className="text-lg leading-8 text-[#5d636b]">
              Bynex är utvecklat för svenska byggföretag och yrkesgrupper som
              snickare, målare, elektriker, VVS-montörer, markarbetare,
              serviceföretag, underentreprenörer och projektledare. Företagets egna
              priser, avtal och behörigheter styr alltid resultatet.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {constructionWorkflows.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-[2rem] border border-[#d5d4d0] bg-[#f5f3ee] p-7"
              >
                <Icon className="h-7 w-7 text-[#383d43]" />
                <h3 className="mt-7 text-2xl font-semibold">{title}</h3>
                <p className="mt-4 leading-7 text-[#5d636b]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="priser"
        className="scroll-mt-20 border-b border-[#d5d4d0] bg-[#ebeae6] px-5 py-20 md:px-10"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.65fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">
                Paket och priser
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Börja med företagsgrunden. Lägg till branschen.
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5d636b]">
                Alla priser nedan är ordinarie månadspris exklusive moms med 12
                månaders bindningstid. Prova först med er egen verksamhet i 14 dagar.
              </p>
            </div>
            <div className="rounded-[2rem] bg-[#1d1f22] p-6 text-white">
              <p className="text-sm font-semibold text-[#b9bec6]">
                Gemensamt i alla paket
              </p>
              <p className="mt-3 text-xl font-semibold">
                Tid, projekt, fakturering, Bynex Bokföring och Bynex Smart.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`flex flex-col rounded-[2rem] border p-6 ${
                  plan.featured
                    ? "border-[#1d1f22] bg-[#1d1f22] text-white shadow-2xl"
                    : "border-[#d0d0cc] bg-[#fbfaf7]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  {plan.badge && (
                    <span className="rounded-full bg-[#b9bec6] px-3 py-1 text-[11px] font-bold text-[#111214]">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p
                  className={`mt-3 min-h-20 text-sm leading-6 ${
                    plan.featured ? "text-[#c9cdd3]" : "text-[#5d636b]"
                  }`}
                >
                  {plan.audience}
                </p>
                <div className="mt-5">
                  <p className="text-4xl font-semibold">
                    {plan.price.toLocaleString("sv-SE")} kr
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      plan.featured ? "text-[#aeb4bd]" : "text-[#717780]"
                    }`}
                  >
                    per företag/mån exkl. moms
                  </p>
                </div>
                <p className="mt-6 flex items-center gap-2 text-sm font-semibold">
                  <UsersRound className="h-4 w-4" /> {plan.users}
                </p>
                <ul className="mt-5 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2 text-sm leading-6 ${
                        plan.featured ? "text-[#d7dade]" : "text-[#5d636b]"
                      }`}
                    >
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2f7d4d]" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-7 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold ${
                    plan.featured
                      ? "bg-[#b9bec6] text-[#111214]"
                      : "bg-[#1d1f22] text-white"
                  }`}
                >
                  Prova gratis i 14 dagar
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-[#666c74]">
            Längre bindningstid och separata tillval visas först när företaget väljer
            eller ändrar abonnemang. Direkta bank-, myndighets- och externa
            systemanslutningar visas endast när den aktuella kopplingen är verifierad
            och aktiverad.
          </p>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[2.3rem] bg-[#b9bec6] p-8 sm:p-10">
            <Building2 className="h-8 w-8" />
            <h2 className="mt-10 max-w-3xl text-4xl font-semibold tracking-[-0.035em]">
              Ett byggsystem som kan följa företaget när det växer.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#3f444b]">
              Börja som ensam företagare, bygg teamet, lägg till branschmoduler och
              behåll projekt, dokument, kunddata och historik i samma struktur.
            </p>
          </div>
          <div className="rounded-[2.3rem] bg-[#1d1f22] p-8 text-white sm:p-10">
            <FileCheck2 className="h-8 w-8 text-[#b9bec6]" />
            <h2 className="mt-10 text-3xl font-semibold">Rätt data till rätt person.</h2>
            <p className="mt-5 leading-7 text-[#c9cdd3]">
              Företag, roller, moduler, attest och kundpublicering styrs separat.
            </p>
          </div>
        </div>
      </section>

      <section
        id="fragor"
        className="scroll-mt-20 border-t border-[#d5d4d0] px-5 py-20 md:px-10"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">
              Bynex Smart FAQ
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">
              Vanliga frågor om Bynex för byggföretag.
            </h2>
            <p className="mt-5 leading-7 text-[#5d636b]">
              Tydliga svar om provperiod, byggflöden, åtkomst, paket och hur
              informationen används.
            </p>
          </div>
          <SmartFaq questions={questions} />
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-[#111214] p-8 text-white sm:p-12 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">
              Redo att prova?
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">
              Öppna ert Bynex-företag.
            </h2>
            <p className="mt-4 text-[#c9cdd3]">
              14 dagar med er egen verksamhet. Ingen betalning krävs för att börja
              testa.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214]"
          >
            Starta gratis <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#d5d4d0] px-5 py-8 text-sm text-[#666c74] md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Logo />
            <p className="mt-3">Affärssystemet för byggföretag.</p>
          </div>
          <div className="flex gap-5">
            <Link href="/login" className="font-semibold text-[#444a52]">
              Logga in
            </Link>
            <Link href="/signup" className="font-semibold text-[#111214]">
              Prova gratis i 14 dagar
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
