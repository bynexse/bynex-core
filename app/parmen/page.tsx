import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  FileArchive,
  FileText,
  Hammer,
  Home,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import Logo from "@/components/layout/Logo";

const features = [
  {
    icon: FileArchive,
    title: "Alla viktiga dokument",
    text: "Köpekontrakt, lagfart, stadgar, besiktning, ritningar, energideklaration, försäkring och manualer samlas per fastighet.",
  },
  {
    icon: ReceiptText,
    title: "Kvitton och utlägg",
    text: "Spara renoveringskvitton, inköp och kostnader med datum, leverantör och belopp så att historiken finns kvar.",
  },
  {
    icon: Hammer,
    title: "Från hantverkaren",
    text: "Garantier, serviceprotokoll, foton, fakturor och överlämningsunderlag kan märkas som mottagna från hantverkare.",
  },
  {
    icon: Sparkles,
    title: "Bynex Smart underhåll",
    text: "Få förslag utifrån boendeform, byggår, mått, egen beskrivning och valda bilder. Du godkänner alltid planen själv.",
  },
  {
    icon: CalendarCheck2,
    title: "Planera och följ upp",
    text: "Sätt datum, prioritet, återkommande intervall och ungefärlig kostnad. Markera när en åtgärd är klar.",
  },
  {
    icon: ShieldCheck,
    title: "Privat och avskilt",
    text: "Varje Pärm ligger i ett eget avgränsat konto. Dokument öppnas med tidsbegränsade länkar och publiceras inte öppet.",
  },
];

const objectTypes = [
  [Home, "Villa", "Husets dokument, installationer, underhåll och renoveringshistorik."],
  [Landmark, "Bostadsrätt", "Egna handlingar tillsammans med föreningens stadgar, årsredovisning och ansvarsfördelning."],
  [Wrench, "Fritidshus", "Vinterrutiner, vatten, frostskydd, service och säsongsvis kontroll."],
  [FileText, "Tomt", "Fastighetsbeteckning, kartor, servitut, markförhållanden och framtida projekt."],
] as const;

export default function BinderLandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#111214]">
      <header className="border-b border-[#d5d4d0] bg-[#f5f3ee]/95 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" aria-label="Bynex startsida"><Logo priority /></Link>
          <div className="flex items-center gap-2">
            <Link href="/login?next=/parmen/start" className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-white">Logga in</Link>
            <Link href="/parmen/skapa" className="rounded-xl bg-[#1d1f22] px-5 py-3 text-sm font-semibold text-white">Prova gratis</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#d5d4d0] px-5 py-16 md:px-10 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(151,163,151,0.34),transparent_38%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.05fr_.95fr] xl:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#c8cbd0] bg-white/70 px-4 py-2 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-700" /> 14 dagar kostnadsfritt
            </span>
            <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Bynex Pärmen</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-8xl">
              Fastighetens samlade minne.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#555b63] sm:text-xl">
              Dokument, kvitton, garantier, hantverkarunderlag och en levande underhållsplan för villa, bostadsrätt, fritidshus eller tomt.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/parmen/skapa" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1d1f22] px-7 py-4 font-semibold text-white">
                Starta 14 dagar gratis <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#funktioner" className="inline-flex items-center justify-center rounded-2xl border border-[#c8cbd0] bg-white/70 px-7 py-4 font-semibold">Se funktionerna</a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#555b63]">
              {[
                "Ingen kostnad under provperioden",
                "19 kr/mån eller 190 kr/år inkl. moms",
                "Avsluta innan första debiteringen",
              ].map((item) => <span key={item} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" />{item}</span>)}
            </div>
          </div>

          <div className="rounded-[2.5rem] bg-[#1d1f22] p-6 text-white shadow-2xl sm:p-8">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9bec6]">Min fastighet</p>
              <h2 className="mt-3 text-3xl font-semibold">Vagnhärad 5:42</h2>
              <p className="mt-2 text-[#c9cdd3]">Villa · byggår 1987 · 142 m²</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <PreviewStat label="Dokument" value="36" helper="avtal, garantier, kvitton" />
                <PreviewStat label="Nästa åtgärd" value="3 mån" helper="kontrollera takavvattning" />
                <PreviewStat label="Garantier" value="4" helper="två löper ut i år" />
                <PreviewStat label="Hantverkare" value="8" helper="historik och underlag" />
              </div>
            </div>
            <div className="mt-4 rounded-[1.7rem] bg-[#b9bec6] p-5 text-[#111214]">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-6 w-6" />
                <div><p className="font-semibold">Bynex Smart föreslår – du bestämmer</p><p className="mt-2 text-sm leading-6 text-[#3f444b]">Bilder används bara när du själv väljer dem. Förslag måste granskas innan de blir del av underhållsplanen.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">En Pärm för rätt objekt</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Börja med fastigheten – inte med mapparna.</h2><p className="mt-5 text-lg leading-8 text-[#5d636b]">Du anger fastighetsbeteckning, typ, adress, byggår och relevanta mått. Bynex ordnar sedan materialet efter vad det faktiskt är.</p></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {objectTypes.map(([Icon, title, text]) => <article key={title} className="rounded-[2rem] border border-[#d5d4d0] bg-[#fbfaf7] p-6"><Icon className="h-7 w-7" /><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[#5d636b]">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section id="funktioner" className="scroll-mt-20 border-y border-[#d5d4d0] bg-[#ebeae6] px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#555b63]">Allt på sin plats</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Bygg ett användbart fastighetsarkiv medan du bor där.</h2></div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-[2rem] border border-[#d0d0cc] bg-[#fbfaf7] p-7"><div className="inline-flex rounded-2xl bg-[#e3e4e3] p-3"><Icon className="h-6 w-6" /></div><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-[#5d636b]">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[2.3rem] bg-[#1d1f22] p-8 text-white sm:p-10"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Enkel prissättning</p><h2 className="mt-5 text-4xl font-semibold">Prova först. Behåll sedan Pärmen för 19 kr i månaden.</h2><div className="mt-8 grid gap-3 sm:grid-cols-2"><Price label="Månadsvis" value="19 kr" helper="per månad inkl. moms" /><Price label="Årsvis" value="190 kr" helper="per år inkl. moms" /></div><p className="mt-6 text-sm leading-6 text-[#c9cdd3]">Vald debitering börjar först efter den 14 dagar långa provperioden. Ett abonnemang som avslutas under provperioden debiteras inte.</p></div>
          <div className="rounded-[2.3rem] bg-[#b9bec6] p-8 sm:p-10"><ShieldCheck className="h-8 w-8" /><h2 className="mt-10 text-3xl font-semibold">Dina dokument är inte en publik molnmapp.</h2><p className="mt-5 leading-7 text-[#3f444b]">Lagringen är privat. Nedladdningar använder tidsbegränsade länkar och Bynex Smart får bara analysera bilder som du uttryckligen väljer.</p></div>
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-[#111214] p-8 text-white sm:p-12 lg:flex-row lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#b9bec6]">Redo att samla fastigheten?</p><h2 className="mt-4 text-4xl font-semibold">Öppna Bynex Pärmen.</h2><p className="mt-4 text-[#c9cdd3]">14 dagar gratis med din egen fastighet och dina egna dokument.</p></div><Link href="/parmen/skapa" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#b9bec6] px-7 py-4 font-semibold text-[#111214]">Starta gratis <ArrowRight className="h-5 w-5" /></Link></div>
      </section>

      <footer className="border-t border-[#d5d4d0] px-5 py-8 md:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#666c74] sm:flex-row sm:items-center"><div><Logo /><p className="mt-3">Bynex Pärmen · fastighetens samlade minne.</p></div><div className="flex gap-5"><Link href="/" className="font-semibold">Bynex företag</Link><Link href="/login?next=/parmen/start" className="font-semibold text-[#111214]">Logga in</Link></div></div></footer>
    </main>
  );
}

function PreviewStat({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs text-[#aeb4bd]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[#aeb4bd]">{helper}</p></div>;
}

function Price({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-sm text-[#b9bec6]">{label}</p><p className="mt-2 text-4xl font-semibold">{value}</p><p className="mt-1 text-xs text-[#aeb4bd]">{helper}</p></div>;
}
