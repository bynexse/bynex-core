export type VisibleModule = {
  slug: string;
  name: string;
  visible: boolean;
};

export type ModuleVisibilityIntent = {
  kind: "intent";
  action: "show" | "hide";
  module: VisibleModule;
  visible: boolean;
};

export type ModuleVisibilityParseResult =
  | ModuleVisibilityIntent
  | { kind: "blocked"; reason: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "unsupported"; reason: string };

const commercialTerms = [
  "abonnemang", "betalning", "beställ", "debiter", "faktura", "köp",
  "nedgradera", "pris", "säg upp", "uppgradera", "avsluta",
];

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("sv-SE")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function aliases(module: VisibleModule) {
  const name = normalize(module.name);
  const slug = normalize(module.slug.replaceAll(/[-_]/g, " "));
  const values = new Set([name, slug]);
  if (name.startsWith("bynex ")) values.add(name.slice("bynex ".length));
  if (module.slug === "bookkeeping") {
    values.add("bokföring");
    values.add("bokföringen");
    values.add("bynex bokföring");
  }
  return values;
}

/**
 * Parses only a deliberately small command grammar. This is not an AI prompt:
 * unsupported wording can never be promoted to a write operation.
 */
export function parseModuleVisibilityCommand(
  command: string,
  modules: VisibleModule[],
): ModuleVisibilityParseResult {
  const normalized = normalize(command);
  if (!normalized || normalized.length > 160) {
    return { kind: "unsupported", reason: "Skriv exempelvis ”dölj bokföring” eller ”visa bokföring”." };
  }
  if (commercialTerms.some((term) => normalized.includes(term))) {
    return {
      kind: "blocked",
      reason: "Bynex Smart får inte köpa, avsluta eller ändra pris och abonnemang med det här kommandot.",
    };
  }

  const match = /^(dölj|göm|visa)(?: modulen)? (.+)$/.exec(normalized);
  if (!match) {
    return { kind: "unsupported", reason: "Kommandot stöds inte. Skriv exempelvis ”dölj bokföring” eller ”visa bokföring”." };
  }
  const action = match[1] === "visa" ? "show" : "hide";
  const requestedModule = match[2];
  const matches = modules.filter((module) => aliases(module).has(requestedModule));
  if (matches.length === 0) {
    return { kind: "unsupported", reason: "Modulen känns inte igen eller ingår inte i företagets aktiva moduler." };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous", reason: "Flera aktiva moduler matchar namnet. Ange modulens fullständiga namn." };
  }
  return { kind: "intent", action, module: matches[0], visible: action === "show" };
}
