"use client";

import { ChangeEvent, useState } from "react";
import { CalendarDays, FilePlus2, ImagePlus, Lightbulb, ListChecks, LoaderCircle, PackageCheck } from "lucide-react";
import type { SmartProjectPlan } from "@/lib/smart/project-plan";

type Props = {
  projectName: string;
  onCreateChangeOrder: (description: string) => void;
  notify: (message: string) => void;
};

const MAX_FILE_BYTES = 5_000_000;

export default function ProjectSmartStudio({ projectName, onCreateChangeOrder, notify }: Props) {
  const [description, setDescription] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [plan, setPlan] = useState<SmartProjectPlan>();
  const [loading, setLoading] = useState(false);

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
      notify("Välj en bild som är mindre än 5 MB");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
        setFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function createPlan() {
    if (!description.trim() && !imageDataUrl) return notify("Lägg till en bild eller beskriv arbetet kort");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/project-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, description, imageDataUrl, fileName }),
      });
      if (!response.ok) throw new Error("Planeringen misslyckades");
      setPlan(await response.json() as SmartProjectPlan);
      notify("Bynex Smart skapade ett granskningsbart arbetsunderlag");
    } catch {
      notify("Bynex Smart kunde inte skapa underlaget just nu");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm xl:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Bynex Smart · byggunderlag</p>
          <h3 className="mt-3 text-2xl font-semibold">Bild och förklaring räcker</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-950/70">Skapar arbetslista, material, tidsplan och tips till arbetsledaren. Underlaget sparas som utkast tills det har granskats.</p>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Exempel: Kunden vill flytta dörröppningen 40 cm och väggen behöver reglas om." className="mt-5 min-h-28 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-emerald-200">
              <ImagePlus className="h-4 w-4" /> {fileName ? "Byt bild" : "Lägg till bild"}
              <input type="file" accept="image/*" onChange={chooseImage} className="sr-only" />
            </label>
            <button onClick={createPlan} disabled={loading} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              {loading ? "Beräknar…" : "Skapa underlag"}
            </button>
          </div>
          {fileName && <p className="mt-3 truncate text-xs font-medium text-emerald-800">Bild: {fileName}</p>}
        </div>

        {plan ? (
          <div className="rounded-[1.5rem] bg-white p-5 ring-1 ring-emerald-100">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div><h4 className="text-lg font-semibold">{plan.title}</h4><p className="mt-1 text-sm text-zinc-600">{plan.summary}</p></div>
              <span className="shrink-0 rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">Granskning krävs</span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><CalendarDays className="h-4 w-4" /> Tidsplan</p><div className="mt-3 space-y-2">{plan.tasks.map((task, index) => <div key={task.id} className="rounded-xl bg-zinc-50 p-3 text-xs"><span className="font-bold">{index + 1}. {task.title}</span><p className="mt-1 text-zinc-500">{task.durationHours} h · {task.role}</p></div>)}</div></div>
              <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><PackageCheck className="h-4 w-4" /> Material</p><div className="mt-3 space-y-2">{plan.materials.map((item) => <div key={`${item.name}-${item.neededByStep}`} className="rounded-xl bg-zinc-50 p-3 text-xs"><span className="font-bold">{item.name}</span><p className="mt-1 text-zinc-500">{item.quantity ?? "Mängdas"} {item.unit}</p></div>)}</div></div>
              <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><Lightbulb className="h-4 w-4" /> Arbetsledartips</p><div className="mt-3 space-y-2">{plan.supervisorTips.map((tip) => <div key={tip} className="rounded-xl bg-zinc-50 p-3 text-xs font-medium">{tip}</div>)}</div></div>
            </div>
            {plan.possibleChangeOrder.detected && (
              <button onClick={() => onCreateChangeOrder(description || plan.summary)} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-amber-900 px-5 py-4 text-sm font-semibold text-white">
                Skapa ÄTA-utkast av underlaget <FilePlus2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-72 items-center justify-center rounded-[1.5rem] border border-dashed border-emerald-300 bg-white/50 p-8 text-center text-sm leading-6 text-emerald-950/60">Resultatet visas samlat här — utan att skapa fem nya flikar eller kräva dubbelregistrering.</div>
        )}
      </div>
    </section>
  );
}
