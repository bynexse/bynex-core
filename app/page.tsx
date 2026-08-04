import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  FileSignature,
  FolderKanban,
  HardHat,
  HousePlug,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const modules = [
  { icon: Clock3, name: "Tid & Lön", text: "Tid, raster, frånvaro, attest och löneunderlag i samma flöde." },
  { icon: FolderKanban, name: "Projekt", text: "Planering, bemanning, dokumentation och uppföljning från ett ställe." },
  { icon: ReceiptText, name: "Offert & faktura", text: "Från kundförfrågan till godkänt fakturaunderlag utan dubbelarbete." },
  { icon: FileSignature, name: "ÄTA på plats", text: "Dokumentera, beräkna och få startbesked utan att stoppa bygget." },
  { icon: PackageSearch, name: "Material & inköp", text: "Priser, lagerstatus, beställningsvaror och stillestånd i kalkylen." },
  { icon: HousePlug, name: "Kundportal & fastighet", text: "Ett digitalt minne som följer byggnaden genom drift och underhåll." },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f4f2] text-zinc-950">
      <header className="relative z-20 border-b border-zinc-200/80 bg-[#f4f4f2]/90 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-xl font-black tracking-[0.22em]">BYNEX</Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-white">Logga in</Link>
            <Link href="/signup" className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Prova Bynex</Link>
          </div>
        </div>
      </header>

      <section className="relative px-5 pb-20 pt-16 md:px-10 md:pb-28 md:pt-24">
        <div className="absolute left-1/2 top-0 -z-0 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800"><Sparkles className="h-4 w-4" /> Bynex beta är öppen</div>
            <h1 className="mt-7 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-8xl">Från första idé till en byggnad som står i 100 år.</h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-600 sm:text-xl">Bynex samlar projekt, personal, tid, lön, offert, ÄTA, material, fakturering och kundens dokumentation i ett enkelt arbetsflöde.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-7 py-4 font-semibold text-white shadow-lg shadow-emerald-900/10">Skapa testkonto <ArrowRight className="h-5 w-5" /></Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-2xl border border-zinc-300 bg-white px-7 py-4 font-semibold">Jag har redan konto</Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-600"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" /> 30 dagar kostnadsfritt</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" /> Ingen betalning i beta</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Företagsisolerad data</span></div>
          </div>

          <div className="rounded-[2.5rem] bg-zinc-950 p-5 text-white shadow-2xl sm:p-7">
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Bynex Smart</p><h2 className="mt-2 text-2xl font-semibold">Nästa bästa åtgärd</h2></div><div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300"><HardHat className="h-7 w-7" /></div></div>
              <div className="mt-7 space-y-3">
                {["Samla in kundens underlag", "Beräkna och granska", "Godkänn och starta arbetet", "Dokumentera för framtiden"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-2xl bg-white/7 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-zinc-950">{index + 1}</span><span className="font-semibold text-zinc-100">{item}</span></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Ett system, valfria moduler</p><h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Börja där nyttan är störst.</h2><p className="mt-5 text-lg leading-8 text-zinc-600">Varje företag ser bara de moduler som ingår. Tid & Lön kan stå helt på egna ben, medan byggföretag kan koppla ihop hela kedjan.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(({ icon: Icon, name, text }) => <article key={name} className="rounded-[2rem] border border-zinc-200 p-6 transition hover:-translate-y-1 hover:shadow-lg"><div className="inline-flex rounded-2xl bg-zinc-100 p-3"><Icon className="h-6 w-6" /></div><h3 className="mt-5 text-xl font-semibold">{name}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="px-5 py-20 md:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] bg-emerald-600 p-7 text-white lg:col-span-2"><Building2 className="h-8 w-8" /><h2 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight">Bygg är spetsen. Fastighetens hela liv blir fortsättningen.</h2><p className="mt-5 max-w-3xl leading-7 text-emerald-50">Ritningar, dolda installationer, egenkontroller, garantier och beslut följer projektet vidare till fastighetsägaren och kundportalen.</p></div>
          <div className="rounded-[2rem] bg-zinc-950 p-7 text-white"><ShieldCheck className="h-8 w-8 text-emerald-400" /><h2 className="mt-8 text-3xl font-semibold">Rätt person ser rätt sak.</h2><p className="mt-5 leading-7 text-zinc-300">Roller, företag och moduler kontrolleras i databasen. Interna priser och persondata delas aldrig automatiskt.</p></div>
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-[2.5rem] bg-zinc-950 p-8 text-white sm:p-12 lg:flex-row lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Testa med egen data</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Öppna ert Bynex-företag idag.</h2><p className="mt-4 text-zinc-300">Skapa konto, välj moduler och börja prova arbetsflödet.</p></div><Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-semibold text-zinc-950">Starta 30 dagar <ArrowRight className="h-5 w-5" /></Link></div>
      </section>

      <footer className="border-t border-zinc-200 px-5 py-8 text-sm text-zinc-500 md:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row"><p className="font-bold tracking-[0.18em] text-zinc-950">BYNEX</p><p>Bygg mer. Administrera mindre.</p></div></footer>
    </main>
  );
}
