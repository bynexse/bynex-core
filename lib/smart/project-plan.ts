export type SmartPlanInput = {
  projectName: string;
  description: string;
  imageDataUrl?: string;
  fileName?: string;
};

export type SmartPlanTask = {
  id: string;
  title: string;
  durationHours: number;
  dependsOn: string[];
  role: string;
};

export type SmartPlanMaterial = {
  name: string;
  quantity: number | null;
  unit: string;
  neededByStep: string;
};

export type SmartProjectPlan = {
  title: string;
  summary: string;
  tasks: SmartPlanTask[];
  materials: SmartPlanMaterial[];
  supervisorTips: string[];
  possibleChangeOrder: { detected: boolean; reason: string | null };
  reviewRequired: boolean;
  source: "bynex_smart" | "local";
};

const changeWords = ["extra", "ändring", "tillägg", "skada", "fel", "hinder", "oväntat", "kunden vill"];

function containsAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

export function createLocalProjectPlan(input: SmartPlanInput): SmartProjectPlan {
  const description = input.description.trim();
  const searchable = `${description} ${input.fileName ?? ""}`.toLocaleLowerCase("sv-SE");
  const isDoor = containsAny(searchable, ["dörr", "ytterdörr", "innerdörr", "karm"]);
  const isWall = containsAny(searchable, ["vägg", "gips", "regel", "isolering"]);
  const possibleChangeOrder = containsAny(searchable, changeWords);

  const tasks: SmartPlanTask[] = isDoor
    ? [
        { id: "measure", title: "Kontrollmät öppning och väggtjocklek", durationHours: 1, dependsOn: [], role: "Arbetsledare" },
        { id: "order", title: "Bekräfta dörr, karm och leveransdag", durationHours: 1, dependsOn: ["measure"], role: "Inköp" },
        { id: "remove", title: "Skydda ytor och demontera befintlig dörr", durationHours: 3, dependsOn: ["order"], role: "Montör" },
        { id: "install", title: "Montera, dreva och funktionsprova", durationHours: 5, dependsOn: ["remove"], role: "Montör" },
      ]
    : isWall
      ? [
          { id: "verify", title: "Kontrollera mått och dolda installationer", durationHours: 1, dependsOn: [], role: "Arbetsledare" },
          { id: "frame", title: "Regla och dokumentera installationer", durationHours: 4, dependsOn: ["verify"], role: "Snickare" },
          { id: "board", title: "Montera isolering och skivor", durationHours: 5, dependsOn: ["frame"], role: "Snickare" },
          { id: "finish", title: "Spackla, kontrollera och fotografera", durationHours: 4, dependsOn: ["board"], role: "Snickare" },
        ]
      : [
          { id: "verify", title: "Kontrollera omfattning, mått och risker", durationHours: 1, dependsOn: [], role: "Arbetsledare" },
          { id: "prepare", title: "Säkra material och förbered arbetsområdet", durationHours: 2, dependsOn: ["verify"], role: "Arbetslag" },
          { id: "perform", title: "Utför och dokumentera arbetet", durationHours: 6, dependsOn: ["prepare"], role: "Arbetslag" },
          { id: "inspect", title: "Egenkontroll och kundunderlag", durationHours: 1, dependsOn: ["perform"], role: "Arbetsledare" },
        ];

  const materials: SmartPlanMaterial[] = isDoor
    ? [
        { name: "Dörr med karm enligt kontrollmått", quantity: 1, unit: "st", neededByStep: "order" },
        { name: "Karmskruv", quantity: 1, unit: "förp", neededByStep: "install" },
        { name: "Drevning och fog", quantity: 1, unit: "sats", neededByStep: "install" },
      ]
    : isWall
      ? [
          { name: "Regel", quantity: null, unit: "lm", neededByStep: "frame" },
          { name: "Isolering", quantity: null, unit: "m²", neededByStep: "board" },
          { name: "Gipsskiva", quantity: null, unit: "m²", neededByStep: "board" },
          { name: "Skruv och spackel", quantity: 1, unit: "sats", neededByStep: "finish" },
        ]
      : [
          { name: "Material enligt kontrollmätning", quantity: null, unit: "st", neededByStep: "prepare" },
          { name: "Skydds- och förbrukningsmaterial", quantity: 1, unit: "sats", neededByStep: "prepare" },
        ];

  return {
    title: description ? `Arbetsunderlag: ${description.slice(0, 80)}` : "Arbetsunderlag från Bynex Smart",
    summary: description
      ? `Ett första genomförandeunderlag för ${input.projectName}. Mått och mängder ska verifieras på plats.`
      : `Beskriv arbetet för ett mer precist underlag för ${input.projectName}.`,
    tasks,
    materials,
    supervisorTips: [
      "Bekräfta kontrollmått innan material beställs.",
      "Lås leveransdagen före start om momentet annars riskerar stillestånd.",
      "Dokumentera dolda installationer före igenbyggnad.",
      possibleChangeOrder
        ? "Underlaget kan innebära en ÄTA. Säkra startbesked och prisstatus innan fakturering."
        : "Jämför omfattningen mot beställningen innan arbetet startar.",
    ],
    possibleChangeOrder: {
      detected: possibleChangeOrder,
      reason: possibleChangeOrder ? "Beskrivningen innehåller en möjlig ändring, ett tillägg eller ett hinder." : null,
    },
    reviewRequired: true,
    source: "local",
  };
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeProjectPlan(value: unknown, input: SmartPlanInput): SmartProjectPlan {
  const fallback = createLocalProjectPlan(input);
  if (!value || typeof value !== "object") return fallback;
  const plan = value as Record<string, unknown>;

  const tasks = Array.isArray(plan.tasks)
    ? plan.tasks.flatMap((item, index): SmartPlanTask[] => {
        if (!item || typeof item !== "object") return [];
        const task = item as Record<string, unknown>;
        return [{
          id: text(task.id, `step-${index + 1}`).replace(/[^a-z0-9-_]/gi, "-").slice(0, 60),
          title: text(task.title, `Arbetsmoment ${index + 1}`),
          durationHours: positiveNumber(task.durationHours, 1),
          dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.filter((id): id is string => typeof id === "string") : [],
          role: text(task.role, "Arbetslag"),
        }];
      }).slice(0, 30)
    : fallback.tasks;

  const materials = Array.isArray(plan.materials)
    ? plan.materials.flatMap((item): SmartPlanMaterial[] => {
        if (!item || typeof item !== "object") return [];
        const material = item as Record<string, unknown>;
        return [{
          name: text(material.name, "Material att verifiera"),
          quantity: typeof material.quantity === "number" && Number.isFinite(material.quantity) ? material.quantity : null,
          unit: text(material.unit, "st"),
          neededByStep: text(material.neededByStep, tasks[0]?.id ?? "start"),
        }];
      }).slice(0, 50)
    : fallback.materials;

  return {
    title: text(plan.title, fallback.title),
    summary: text(plan.summary, fallback.summary),
    tasks: tasks.length ? tasks : fallback.tasks,
    materials: materials.length ? materials : fallback.materials,
    supervisorTips: Array.isArray(plan.supervisorTips)
      ? plan.supervisorTips.filter((tip): tip is string => typeof tip === "string" && Boolean(tip.trim())).slice(0, 12)
      : fallback.supervisorTips,
    possibleChangeOrder: {
      detected: Boolean((plan.possibleChangeOrder as Record<string, unknown> | undefined)?.detected),
      reason: text((plan.possibleChangeOrder as Record<string, unknown> | undefined)?.reason, "") || null,
    },
    reviewRequired: true,
    source: "bynex_smart",
  };
}
