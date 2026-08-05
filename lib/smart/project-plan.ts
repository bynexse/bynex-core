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

export function createLocalProjectPlan(input: SmartPlanInput): SmartProjectPlan {
  const description = input.description.trim();

  return {
    title: description ? `Underlag för ${input.projectName}` : "Bynex Smart-underlag",
    summary: "Inget verifierbart Smart-underlag kunde skapas. Inga tider, mängder eller material har uppskattats.",
    tasks: [],
    materials: [],
    supervisorTips: [],
    possibleChangeOrder: { detected: false, reason: null },
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
    tasks,
    materials,
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
