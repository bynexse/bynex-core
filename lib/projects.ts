export type Project = {
  id: string;
  name: string;
  customer: string;
  location: string;
  progress: number;
  margin: number;
  team: number;
  value: string;
  risk?: boolean;
};

export const projects: Project[] = [
  {
    id: "BX-2027-0008",
    name: "Villa Björkvägen 12",
    customer: "Andersson Fastigheter AB",
    location: "Trosa",
    progress: 68,
    margin: 18.4,
    team: 13,
    value: "1 840 000 kr",
  },
  {
    id: "BX-2027-0009",
    name: "Solängen 4",
    customer: "Sörmland Förvaltning AB",
    location: "Gnesta",
    progress: 41,
    margin: 13.2,
    team: 9,
    value: "984 000 kr",
    risk: true,
  },
  {
    id: "BX-2027-0010",
    name: "Kvarnvägen 7",
    customer: "Privatkund",
    location: "Nyköping",
    progress: 24,
    margin: 21.7,
    team: 5,
    value: "612 000 kr",
  },
];
