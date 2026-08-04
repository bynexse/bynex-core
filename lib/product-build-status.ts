export type BuildState = "ready" | "testing" | "building" | "planned";

export const productBuildStatus: Array<{ name: string; state: BuildState; note: string }> = [
  { name: "Översikt", state: "ready", note: "Riktig projekt-, risk-, offert-, ÄTA- och fakturadata." },
  { name: "Projekt", state: "ready", note: "Lista, sökning, skapande, detalj, status och framdrift är kopplat." },
  { name: "Personal & UE", state: "ready", note: "Personal, UE, kompetenser, intyg och rollskydd är kopplat." },
  { name: "Bynex Tid", state: "testing", note: "In-/utcheckning, rast, GPS, historik och chefsattest är kopplat." },
  { name: "Tid & Lön", state: "building", note: "Löneperiod och riktiga poster är kopplade; attest återstår." },
  { name: "Arbetsledaren", state: "planned", note: "Dagens plan, hinder och resurser." },
  { name: "Platschef", state: "planned", note: "Portfölj, risk, ekonomi och beslut." },
  { name: "Material & inköp", state: "planned", note: "Pris, lager, leverans och stillestånd." },
  { name: "Bynex Connect", state: "planned", note: "Projekttråd, filer och uppgifter." },
  { name: "ÄTA", state: "planned", note: "Startbesked, prisgranskning och slutgodkännande." },
  { name: "Offerter", state: "planned", note: "Kundunderlag, ROT/RUT, signering och projektstart." },
  { name: "Företagsinställningar", state: "testing", note: "Grunduppgifter, plan och aktiva moduler." },
  { name: "Bynex HQ", state: "testing", note: "Ägare, ekonomi, tillväxt, företag, användare och hanterbar supportinkorg är kopplat." },
];

export const buildStateLabel: Record<BuildState, string> = {
  ready: "Klar lokalt",
  testing: "Testas",
  building: "Byggs",
  planned: "Planerad",
};
