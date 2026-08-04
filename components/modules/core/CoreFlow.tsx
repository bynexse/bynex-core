"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  Hammer,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import ProjectSmartStudio from "@/components/modules/core/ProjectSmartStudio";

type Props = { notify: (message: string) => void };

type PilotState = {
  customerName: string;
  customerEmail: string;
  address: string;
  work: string;
  quoteAmount: number;
  quoteSent: boolean;
  quoteApproved: boolean;
  projectStarted: boolean;
  minutes: number;
  materialAmount: number;
  changeDescription: string;
  changeEstimate: number;
  changeStarted: boolean;
  changeApproved: boolean;
  invoiceCreated: boolean;
  portalPublished: boolean;
};

const STORAGE_KEY = "bynex-pilot-core-v1";

const initialState: PilotState = {
  customerName: "Anna Andersson",
  customerEmail: "anna@example.se",
  address: "Storgatan 12, Södertälje",
  work: "Renovering av entré och byte av ytterdörr",
  quoteAmount: 48500,
  quoteSent: false,
  quoteApproved: false,
  projectStarted: false,
  minutes: 0,
  materialAmount: 0,
  changeDescription: "",
  changeEstimate: 0,
  changeStarted: false,
  changeApproved: false,
  invoiceCreated: false,
  portalPublished: false,
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function Step({
  number,
  title,
  done,
  active,
}: {
  number: number;
  title: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-zinc-950 text-white"
              : "bg-zinc-200 text-zinc-500"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : number}
      </span>
      <span className={`truncate text-sm font-semibold ${active || done ? "text-zinc-950" : "text-zinc-400"}`}>
        {title}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "email" | "number";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-zinc-950"
      />
    </label>
  );
}

export default function CoreFlow({ notify }: Props) {
  const [state, setState] = useState<PilotState>(initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setState({ ...initialState, ...(JSON.parse(saved) as Partial<PilotState>) });
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      setLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [loaded, state]);

  const stage = !state.quoteSent
    ? 1
    : !state.quoteApproved
      ? 2
      : !state.projectStarted
        ? 3
        : !state.invoiceCreated
          ? 4
          : 5;

  const labourAmount = Math.round((state.minutes / 60) * 695);
  const subtotal = state.quoteAmount + state.materialAmount + (state.changeApproved ? state.changeEstimate : 0);
  const vat = Math.round(subtotal * 0.25);
  const total = subtotal + vat;

  const nextAction = useMemo(() => {
    if (!state.quoteSent) return "Kontrollera uppgifterna och skicka offerten";
    if (!state.quoteApproved) return "Invänta eller registrera kundens godkännande";
    if (!state.projectStarted) return "Starta projektet";
    if (!state.invoiceCreated) return "Registrera arbetet och skapa fakturaunderlaget";
    if (!state.portalPublished) return "Publicera projektets kundvy";
    return "Pilotflödet är komplett";
  }, [state]);

  function patch(update: Partial<PilotState>) {
    setState((current) => ({ ...current, ...update }));
  }

  function reset() {
    setState(initialState);
    window.localStorage.removeItem(STORAGE_KEY);
    notify("Pilotflödet återställdes");
  }

  function sendQuote() {
    if (!state.customerName || !state.customerEmail || !state.address || !state.work || state.quoteAmount <= 0) {
      notify("Fyll i kund, adress, arbete och pris först");
      return;
    }
    patch({ quoteSent: true });
    notify("Offerten skickades till kundportalen");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <Sparkles className="h-4 w-4" />
              Bynex Smart · nästa bästa åtgärd
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{nextAction}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Ett enda flöde från första kunduppgift till godkänt fakturaunderlag och publicerad kundportal.
            </p>
          </div>
          <button onClick={reset} className="flex items-center gap-2 self-start rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/10 lg:self-auto">
            <RotateCcw className="h-4 w-4" /> Återställ pilot
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-5 sm:p-6">
        <Step number={1} title="Offert" done={state.quoteSent} active={stage === 1} />
        <Step number={2} title="Godkänd" done={state.quoteApproved} active={stage === 2} />
        <Step number={3} title="Projekt" done={state.projectStarted} active={stage === 3} />
        <Step number={4} title="Utförande" done={state.invoiceCreated} active={stage === 4} />
        <Step number={5} title="Kundportal" done={state.portalPublished} active={stage === 5} />
      </section>

      {stage === 1 && (
        <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="rounded-2xl bg-zinc-100 p-3"><UserRound className="h-5 w-5" /></span>
              <div><h3 className="text-xl font-semibold">Kund och arbete</h3><p className="text-sm text-zinc-500">Minsta uppgifterna som krävs för att gå vidare.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kund" value={state.customerName} onChange={(value) => patch({ customerName: value })} />
              <Field label="E-post" type="email" value={state.customerEmail} onChange={(value) => patch({ customerEmail: value })} />
              <div className="sm:col-span-2"><Field label="Arbetsadress" value={state.address} onChange={(value) => patch({ address: value })} /></div>
              <div className="sm:col-span-2"><Field label="Vad ska göras?" value={state.work} onChange={(value) => patch({ work: value })} /></div>
              <Field label="Pris exkl. moms" type="number" value={state.quoteAmount} onChange={(value) => patch({ quoteAmount: Number(value) || 0 })} />
            </div>
          </div>
          <div className="rounded-[2rem] bg-emerald-50 p-6 ring-1 ring-emerald-100">
            <ShieldCheck className="h-8 w-8 text-emerald-700" />
            <h3 className="mt-5 text-2xl font-semibold">Redo att skicka</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-950/70">Kunden får omfattning, pris och möjlighet att godkänna. ROT/RUT väljs och kompletteras i kundsteget när det används.</p>
            <div className="mt-6 rounded-2xl bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Offertvärde inkl. moms</p>
              <p className="mt-2 text-3xl font-semibold">{money.format(state.quoteAmount * 1.25)}</p>
            </div>
            <button onClick={sendQuote} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white">
              Skicka offert <Send className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {stage === 2 && (
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <FileSignature className="h-9 w-9" />
          <h3 className="mt-5 text-3xl font-semibold">Offerten väntar på kunden</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">I piloten registrerar du godkännandet här. I skarp drift kommer signaturen från BankID, Freja eID+ eller spårbar e-post/SMS-bekräftelse.</p>
          <div className="mt-6 rounded-2xl bg-zinc-50 p-5 text-sm">
            <p className="font-semibold">{state.customerName}</p><p className="mt-1 text-zinc-500">{state.customerEmail} · {state.address}</p>
          </div>
          <button onClick={() => { patch({ quoteApproved: true }); notify("Kundens godkännande registrerades"); }} className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white">
            <CheckCircle2 className="h-5 w-5" /> Registrera kundens godkännande
          </button>
        </section>
      )}

      {stage === 3 && (
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <Hammer className="h-9 w-9" />
          <h3 className="mt-5 text-3xl font-semibold">Allt är klart för byggstart</h3>
          <p className="mt-3 text-sm text-zinc-600">Bynex har skapat projektet från den godkända offerten. Kund, adress, omfattning och pris följer med utan dubbelregistrering.</p>
          <button onClick={() => { patch({ projectStarted: true }); notify("Projektet startades"); }} className="mt-6 flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white">
            Starta projekt <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {stage === 4 && (
        <div className="grid gap-6 xl:grid-cols-3">
          <ProjectSmartStudio
            projectName={state.work}
            notify={notify}
            onCreateChangeOrder={(description) => {
              patch({ changeDescription: description });
              notify("Smart-underlaget lades in som ÄTA-utkast");
            }}
          />
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
            <Clock3 className="h-7 w-7" /><h3 className="mt-4 text-xl font-semibold">Tid</h3>
            <p className="mt-2 text-sm text-zinc-500">Registrerad arbetstid: {Math.floor(state.minutes / 60)} h {state.minutes % 60} min</p>
            <button onClick={() => { patch({ minutes: state.minutes + 60 }); notify("En arbetstimme registrerades"); }} className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold hover:bg-zinc-200">+ Lägg till 1 timme</button>
          </section>
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
            <PackagePlus className="h-7 w-7" /><h3 className="mt-4 text-xl font-semibold">Material</h3>
            <p className="mt-2 text-sm text-zinc-500">Tillagt material: {money.format(state.materialAmount)}</p>
            <button onClick={() => { patch({ materialAmount: state.materialAmount + 1250 }); notify("Material för 1 250 kr lades till"); }} className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold hover:bg-zinc-200">+ Lägg till material</button>
          </section>
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <FileCheck2 className="h-7 w-7 text-amber-800" /><h3 className="mt-4 text-xl font-semibold">ÄTA på plats</h3>
            {!state.changeStarted ? (
              <>
                <input value={state.changeDescription} onChange={(event) => patch({ changeDescription: event.target.value })} placeholder="Beskriv ändringen kort" className="mt-4 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none" />
                <input type="number" value={state.changeEstimate || ""} onChange={(event) => patch({ changeEstimate: Number(event.target.value) || 0 })} placeholder="Uppskattat pris (valfritt)" className="mt-3 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none" />
                <button onClick={() => { if (!state.changeDescription) return notify("Beskriv ändringen först"); patch({ changeStarted: true }); notify("Kunden gav startbesked på plats"); }} className="mt-3 w-full rounded-2xl bg-amber-900 px-4 py-3 text-sm font-semibold text-white">Få startbesked nu</button>
              </>
            ) : state.changeApproved ? (
              <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold text-emerald-700">Pris och omfattning godkända.</p>
            ) : (
              <>
                <p className="mt-4 text-sm leading-6 text-amber-950">Arbetet får fortsätta. {state.changeEstimate > 0 ? `Uppskattat pris ${money.format(state.changeEstimate)}. Priset är preliminärt och kan avvika.` : "Priset uppdateras senare när behörig personal har räknat."}</p>
                <button onClick={() => { patch({ changeApproved: true }); notify("ÄTA-priset slutgodkändes"); }} className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-amber-300">Slutgodkänn ÄTA</button>
              </>
            )}
          </section>

          <section className="rounded-[2rem] bg-zinc-950 p-6 text-white xl:col-span-3">
            <div className="grid gap-5 md:grid-cols-4 md:items-end">
              <div><p className="text-xs uppercase tracking-wider text-zinc-400">Godkänd offert</p><p className="mt-2 text-xl font-semibold">{money.format(state.quoteAmount)}</p></div>
              <div><p className="text-xs uppercase tracking-wider text-zinc-400">Tillagd tid</p><p className="mt-2 text-xl font-semibold">{money.format(labourAmount)}</p></div>
              <div><p className="text-xs uppercase tracking-wider text-zinc-400">Material + godkänd ÄTA</p><p className="mt-2 text-xl font-semibold">{money.format(state.materialAmount + (state.changeApproved ? state.changeEstimate : 0))}</p></div>
              <button onClick={() => { if (state.changeStarted && !state.changeApproved) return notify("Slutgodkänn ÄTA-priset innan fakturaunderlaget skapas"); patch({ invoiceCreated: true }); notify("Fakturaunderlaget skapades och låstes"); }} className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950">Skapa fakturaunderlag <ReceiptText className="h-5 w-5" /></button>
            </div>
          </section>
        </div>
      )}

      {stage === 5 && (
        <section className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl">
            <ReceiptText className="h-8 w-8" />
            <h3 className="mt-5 text-2xl font-semibold">Fakturaunderlag klart</h3>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between text-zinc-300"><span>Summa exkl. moms</span><span>{money.format(subtotal)}</span></div>
              <div className="flex justify-between text-zinc-300"><span>Moms 25 %</span><span>{money.format(vat)}</span></div>
              <div className="flex justify-between border-t border-white/15 pt-3 text-lg font-semibold"><span>Att betala</span><span>{money.format(total)}</span></div>
            </div>
            <p className="mt-5 text-xs leading-5 text-zinc-400">Underlaget är låst i piloten. Skarp utskickning och ekonomisynk kräver ansluten leverantör.</p>
          </div>
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Kundportal</p><h3 className="mt-2 text-3xl font-semibold">Projektets levande tidslinje</h3></div>
              {state.portalPublished && <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700">Publicerad</span>}
            </div>
            <div className="mt-6 space-y-3">
              {["Offert godkänd av kund", "Projekt startat", `${Math.floor(state.minutes / 60)} arbetstimmar registrerade`, `${money.format(state.materialAmount)} material dokumenterat`, "Fakturaunderlag färdigt"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{item}</div>
              ))}
            </div>
            {!state.portalPublished ? (
              <button onClick={() => { patch({ portalPublished: true }); notify("Den granskade kundvyn publicerades"); }} className="mt-6 flex w-full items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white">Publicera granskad kundvy <Send className="h-4 w-4" /></button>
            ) : (
              <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">Klart. Kunden kan nu följa projektets godkända tidslinje utan tillgång till interna priser, marginaler eller anteckningar.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
