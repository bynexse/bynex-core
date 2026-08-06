export type ChangeOrderTemplate = {
  id: string;
  name: string;
  category: string;
  summary: string;
  title: string;
  description: string;
  assumptions: string[];
  exclusions: string[];
};

export type ChangeOrderPriceType = "fixed" | "estimated" | "running_account";

const commonAssumptions = [
  "Arbetsområdet är åtkomligt under avtalad arbetstid.",
  "Kalkylen bygger på de mått och förutsättningar som är kända när underlaget skapas.",
  "Beställaren lämnar nödvändiga besked och val utan att produktionen försenas.",
];

const commonExclusions = [
  "Dolda fel, fukt, asbest eller andra oförutsedda förhållanden som inte framgår av underlaget.",
  "Arbeten utanför den uttryckligen beskrivna omfattningen.",
  "Följdkostnader som uppstår genom ändrade förutsättningar efter kundens godkännande.",
];

export const changeOrderTemplates: ChangeOrderTemplate[] = [
  {
    id: "customer-change",
    name: "Kundbeställd ändring",
    category: "Allmänt",
    summary: "När kunden ändrar omfattning, materialval eller utförande.",
    title: "Kundbeställd ändring",
    description:
      "Kunden har begärt en ändring jämfört med ursprunglig omfattning. Beskriv vad som ska ändras, varför ändringen behövs, vilka delar som berörs och hur arbetet påverkar pris och tid.",
    assumptions: commonAssumptions,
    exclusions: commonExclusions,
  },
  {
    id: "unforeseen-condition",
    name: "Oförutsett förhållande",
    category: "Risk",
    summary: "Dolt fel eller platsförhållande som inte kunde bedömas före start.",
    title: "Oförutsett förhållande på arbetsplatsen",
    description:
      "Vid arbetets utförande upptäcktes ett förhållande som inte framgick av tillgängliga handlingar eller normal besiktning. Beskriv vad som upptäcktes, var det finns, vilken risk det medför och vilken åtgärd som rekommenderas.",
    assumptions: [
      ...commonAssumptions,
      "Arbetet i den berörda delen startar först efter dokumenterat kundbeslut.",
    ],
    exclusions: commonExclusions,
  },
  {
    id: "wall-opening",
    name: "Vägg, öppning eller förstärkning",
    category: "Snickeri",
    summary: "Ny vägg, flyttad vägg, dörröppning eller förstärkning.",
    title: "Ändring av vägg eller öppning",
    description:
      "Ändringen avser väggarbete. Ange längd, höjd, vägguppbyggnad, antal skivlager, isolering, öppningar, brand- eller ljudkrav samt vilken återställning som ska ingå.",
    assumptions: commonAssumptions,
    exclusions: [
      ...commonExclusions,
      "Konstruktionsberäkning eller myndighetsbesked om det inte uttryckligen anges.",
    ],
  },
  {
    id: "painting-surface",
    name: "Målning och ytskikt",
    category: "Måleri",
    summary: "Extra spackling, målning, tapet eller ändrat kulör- och ytskiktsval.",
    title: "Ändrat måleri eller ytskikt",
    description:
      "Ändringen avser målning eller annat ytskikt. Ange yta i m², underlagets skick, behov av tvätt, lagning, slipning eller spackling, antal strykningar och valt material eller kulör.",
    assumptions: commonAssumptions,
    exclusions: commonExclusions,
  },
  {
    id: "flooring",
    name: "Golv och underarbete",
    category: "Golv",
    summary: "Ändrad golvtyp, extra avjämning eller reparation av underlag.",
    title: "Ändrat golvarbete",
    description:
      "Ändringen avser golv. Ange golvyta i m², vald golvtyp, underlagets skick, behov av rivning eller avjämning samt lister, trösklar och anslutningar som ska ingå.",
    assumptions: commonAssumptions,
    exclusions: commonExclusions,
  },
  {
    id: "electrical",
    name: "El och belysning",
    category: "El",
    summary: "Extra uttag, belysning, kabeldragning eller ändrad placering.",
    title: "Ändrat elarbete",
    description:
      "Ändringen avser elinstallation. Ange antal och typ av uttag, armaturer eller anslutningar, placering, kabelväg, styrning och om befintlig central eller dokumentation påverkas.",
    assumptions: commonAssumptions,
    exclusions: [
      ...commonExclusions,
      "Arbeten som kräver separat projektering eller nätägaråtgärd om det inte uttryckligen anges.",
    ],
  },
  {
    id: "plumbing",
    name: "VVS och avlopp",
    category: "VVS",
    summary: "Flyttad anslutning, extra rör, blandare eller avloppsändring.",
    title: "Ändrat VVS-arbete",
    description:
      "Ändringen avser VVS. Ange berörda ledningar eller installationer, dimensioner, sträckor, anslutningspunkter, åtkomst, avstängning och vilken återställning som ska ingå.",
    assumptions: commonAssumptions,
    exclusions: commonExclusions,
  },
  {
    id: "roofing",
    name: "Tak och väderskydd",
    category: "Tak",
    summary: "Ändrad taktäckning, plåtdetalj, genomföring eller extra väderskydd.",
    title: "Ändrat takarbete",
    description:
      "Ändringen avser takarbete. Ange takyta, höjd, lutning, material, genomföringar, anslutningar, behov av ställning eller fallskydd samt hur väderskydd och tätning ska lösas.",
    assumptions: commonAssumptions,
    exclusions: [
      ...commonExclusions,
      "Ställning, kran eller särskilt väderskydd om det inte uttryckligen anges.",
    ],
  },
  {
    id: "demolition",
    name: "Rivning och bortforsling",
    category: "Rivning",
    summary: "Extra rivning, demontering, sortering eller transport av avfall.",
    title: "Utökad rivning eller demontering",
    description:
      "Ändringen avser rivning eller demontering. Ange yta eller mängd, material, åtkomst, skyddsbehov, sortering, transport och mottagningsavgifter samt om återställning ska ingå.",
    assumptions: commonAssumptions,
    exclusions: [
      ...commonExclusions,
      "Sanering eller hantering av farligt avfall utan separat inventering och godkännande.",
    ],
  },
];

export const defaultChangeOrderAssumptions = commonAssumptions;
export const defaultChangeOrderExclusions = commonExclusions;

export const priceDisclaimerByType: Record<ChangeOrderPriceType, string> = {
  fixed:
    "Det fasta priset gäller den omfattning, de förutsättningar och de undantag som anges i detta underlag. Ändras förutsättningarna tas ett nytt ÄTA-underlag fram innan ytterligare arbete utförs.",
  estimated:
    "Priset är en uppskattning baserad på kända förutsättningar. Företaget kontaktar kunden om ny information innebär att pris eller omfattning behöver ändras innan merarbete fortsätter.",
  running_account:
    "Arbetet debiteras efter faktiskt utförd tid och faktiskt material enligt företagets avtalade priser. Angivet belopp är en prognos och inte ett fast pris.",
};

export const standardLegalNotice =
  "Standardtexten i Bynex är ett dokumentationsstöd. Företaget ansvarar för att underlaget stämmer med huvudavtal, beställning och tillämpliga regler innan det skickas till kunden.";
