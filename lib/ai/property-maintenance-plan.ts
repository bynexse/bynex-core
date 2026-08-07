export type BinderPropertyType =
  | "single_family"
  | "condominium"
  | "holiday_home"
  | "land";

export type PropertyMaintenanceProfile = {
  propertyType: BinderPropertyType;
  constructionYear: number | null;
  livingAreaSqm: number | null;
  plotAreaSqm: number | null;
  notes: string;
};

export type MaintenanceSuggestion = {
  title: string;
  category:
    | "roof"
    | "facade"
    | "windows"
    | "foundation"
    | "drainage"
    | "ground"
    | "heating"
    | "ventilation"
    | "electrical"
    | "plumbing"
    | "bathroom"
    | "kitchen"
    | "interior"
    | "fire_safety"
    | "appliance"
    | "association"
    | "documentation"
    | "other";
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  dueInMonths: number;
  recurrenceMonths: number | null;
  smartReason: string;
};

function age(profile: PropertyMaintenanceProfile) {
  return profile.constructionYear
    ? Math.max(0, new Date().getFullYear() - profile.constructionYear)
    : null;
}

function commonSuggestions(): MaintenanceSuggestion[] {
  return [
    {
      title: "Kontrollera brandvarnare och brandskydd",
      category: "fire_safety",
      description:
        "Prova brandvarnare, kontrollera batterier och dokumentera var brandsläckare och brandfilt finns.",
      priority: "high",
      dueInMonths: 1,
      recurrenceMonths: 12,
      smartReason: "Årlig säkerhetskontroll som är relevant oavsett boendeform.",
    },
    {
      title: "Samla försäkring, energideklaration och viktiga avtal",
      category: "documentation",
      description:
        "Ladda upp aktuella försäkringsbrev, energideklaration, besiktningsprotokoll och serviceavtal så att framtida beslut bygger på rätt underlag.",
      priority: "normal",
      dueInMonths: 1,
      recurrenceMonths: 12,
      smartReason: "Pärmen blir mer användbar när fastighetens styrande dokument hålls aktuella.",
    },
  ];
}

export function buildPropertyMaintenanceSuggestions(
  profile: PropertyMaintenanceProfile,
): MaintenanceSuggestion[] {
  const propertyAge = age(profile);
  const ageReason = propertyAge == null
    ? "Byggår saknas, därför föreslås en första okulär kontroll."
    : `Fastigheten är cirka ${propertyAge} år gammal, vilket motiverar dokumenterad statuskontroll.`;

  if (profile.propertyType === "land") {
    return [
      {
        title: "Dokumentera tomtgränser, servitut och tillfarter",
        category: "documentation",
        description:
          "Samla kartor, servitut, ledningsanvisningar och uppgifter om tillfart eller gemensamhetsanläggningar.",
        priority: "normal",
        dueInMonths: 1,
        recurrenceMonths: 24,
        smartReason: "Tomtens juridiska och tekniska underlag är centrala vid byggnation, försäljning och markarbete.",
      },
      {
        title: "Kontrollera avvattning, vegetation och markförändringar",
        category: "ground",
        description:
          "Fotografera lågpunkter, stående vatten, diken, träd nära gräns och synliga sättningar eller erosioner.",
        priority: "normal",
        dueInMonths: 3,
        recurrenceMonths: 12,
        smartReason: "Återkommande bilddokumentation gör markförändringar lättare att upptäcka.",
      },
    ];
  }

  if (profile.propertyType === "condominium") {
    return [
      ...commonSuggestions(),
      {
        title: "Kontrollera badrum, golvbrunn och synliga fogar",
        category: "bathroom",
        description:
          "Fotografera golvbrunn, anslutningar, fogar och synliga missfärgningar. Vid osäkerhet bör behörig fackperson anlitas.",
        priority: "high",
        dueInMonths: 3,
        recurrenceMonths: 12,
        smartReason: "Våtrum är en vanlig källa till kostsamma skador och bör följas med återkommande bilder.",
      },
      {
        title: "Kontrollera ventilation och filter",
        category: "ventilation",
        description:
          "Rengör eller byt filter enligt tillverkarens och föreningens anvisningar och dokumentera senaste åtgärd.",
        priority: "normal",
        dueInMonths: 3,
        recurrenceMonths: 6,
        smartReason: "Ventilationen påverkar fukt, inomhusmiljö och energianvändning.",
      },
      {
        title: "Spara föreningens underhållsplan och stadgar",
        category: "association",
        description:
          "Lägg in stadgar, årsredovisning, föreningens underhållsplan och information om ansvarsfördelningen mellan bostadsrättshavare och förening.",
        priority: "normal",
        dueInMonths: 1,
        recurrenceMonths: 12,
        smartReason: "Ansvarsfördelningen styr vilka åtgärder ägaren respektive föreningen ska hantera.",
      },
    ];
  }

  if (profile.propertyType === "holiday_home") {
    return [
      ...commonSuggestions(),
      {
        title: "Kontrollera tak, hängrännor och genomföringar",
        category: "roof",
        description:
          "Fotografera takytor från säker marknivå, rensa tillgängliga rännor och notera skador kring skorsten och andra genomföringar.",
        priority: "high",
        dueInMonths: 3,
        recurrenceMonths: 12,
        smartReason: ageReason,
      },
      {
        title: "Planera vattenavstängning och frostskydd",
        category: "plumbing",
        description:
          "Dokumentera huvudavstängning, vinterrutiner och vilka ledningar eller installationer som behöver tömmas eller hållas frostfria.",
        priority: "high",
        dueInMonths: 2,
        recurrenceMonths: 6,
        smartReason: "Fritidshus står ofta obevakade och är extra utsatta för frost- och vattenskador.",
      },
      {
        title: "Kontrollera grund, marklutning och fukttecken",
        category: "foundation",
        description:
          "Fotografera grund, krypgrundsöppningar och mark närmast huset. Notera lukt, missfärgning eller stående vatten utan att göra ingrepp.",
        priority: "normal",
        dueInMonths: 4,
        recurrenceMonths: 12,
        smartReason: "Säsongsvariationer och periodvis låg uppvärmning kan öka fuktrisken.",
      },
    ];
  }

  return [
    ...commonSuggestions(),
    {
      title: "Kontrollera tak, plåtdetaljer och avvattning",
      category: "roof",
      description:
        "Fotografera takytor från säker plats, kontrollera synliga skador och dokumentera hängrännor, stuprör och genomföringar.",
      priority: "high",
      dueInMonths: 3,
      recurrenceMonths: 12,
      smartReason: ageReason,
    },
    {
      title: "Kontrollera fasad, fönster och tätningar",
      category: "facade",
      description:
        "Dokumentera sprickor, färgsläpp, rötskador, fogar och anslutningar runt fönster och dörrar.",
      priority: "normal",
      dueInMonths: 4,
      recurrenceMonths: 12,
      smartReason: "Återkommande bilder gör det lättare att bedöma om en förändring är ny eller långsam.",
    },
    {
      title: "Kontrollera grund, dränering och marklutning",
      category: "drainage",
      description:
        "Notera stående vatten, fukttecken, sättningar och om marken leder vatten mot huset. Ingrepp ska bedömas av fackperson.",
      priority: propertyAge != null && propertyAge >= 30 ? "high" : "normal",
      dueInMonths: 6,
      recurrenceMonths: 24,
      smartReason: ageReason,
    },
    {
      title: "Serva värme och ventilation enligt tillverkaren",
      category: "heating",
      description:
        "Samla modell- och serviceuppgifter för värmesystem och ventilation. Följ tillverkarens intervall och spara serviceprotokoll.",
      priority: "normal",
      dueInMonths: 3,
      recurrenceMonths: 12,
      smartReason: "Servicehistorik ger bättre drift, färre akuta fel och ett tydligt underlag vid försäljning.",
    },
    {
      title: "Kontrollera synliga vattenanslutningar och avstängningar",
      category: "plumbing",
      description:
        "Fotografera huvudavstängning och synliga anslutningar under diskbänk, tvättställ och teknikutrymmen. Notera dropp, korrosion eller missfärgning.",
      priority: "high",
      dueInMonths: 3,
      recurrenceMonths: 12,
      smartReason: "Små läckage kan upptäckas tidigare när samma punkter dokumenteras regelbundet.",
    },
  ];
}
