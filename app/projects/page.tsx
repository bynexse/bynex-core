"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CircleAlert,
  FolderPlus,
  MapPin,
  Search,
  UserRound,
  X,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";

type ProjectStatus = "Planering" | "Pågår" | "Risk" | "Klart";

type Project = {
  id: string;
  name: string;
  customer: string;
  location: string;
  manager: string;
  status: ProjectStatus;
  progress: number;
  budget: number;
  margin: number | null;
  startDate: string;
  endDate: string;
};

type ProjectForm = {
  name: string;
  customer: string;
  location: string;
  manager: string;
  budget: string;
  startDate: string;
  endDate: string;
};

const initialProjects: Project[] = [
  {
    id: "BX-2027-0008",
    name: "Villa Björkvägen 12",
    customer: "Anders Svensson",
    location: "Trosa",
    manager: "Christoffer Alsbjer",
    status: "Pågår",
    progress: 68,
    budget: 1_240_000,
    margin: 59_000,
    startDate: "2027-05-03",
    endDate: "2027-09-24",
  },
  {
    id: "BX-2027-0009",
    name: "Solängen 4",
    customer: "Fastighet AB",
    location: "Gnesta",
    manager: "Christoffer Alsbjer",
    status: "Risk",
    progress: 54,
    budget: 860_000,
    margin: -18_400,
    startDate: "2027-06-01",
    endDate: "2027-10-12",
  },
  {
    id: "BX-2027-0010",
    name: "Kvarnvägen 7",
    customer: "Eva Karlsson",
    location: "Nyköping",
    manager: "Anders Nilsson",
    status: "Planering",
    progress: 12,
    budget: 1_580_000,
    margin: 92_000,
    startDate: "2027-08-16",
    endDate: "2027-11-30",
  },
];

const emptyForm: ProjectForm = {
  name: "",
  customer: "",
  location: "",
  manager: "Christoffer Alsbjer",
  budget: "",
  startDate: "",
  endDate: "",
};

const statusFilters: Array<"Alla" | ProjectStatus> = [
  "Alla",
  "Planering",
  "Pågår",
  "Risk",
  "Klart",
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "Inte angivet";

  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function statusClass(status: ProjectStatus) {
  if (status === "Risk") {
    return "bg-[#fff0e8] text-[#ad4929]";
  }

  if (status === "Pågår") {
    return "bg-[#e9f2ed] text-[#286a49]";
  }

  if (status === "Klart") {
    return "bg-[#e8eee9] text-[#365e45]";
  }

  return "bg-[#ececea] text-[#626668]";
}

export default function ProjectsPage() {
  const [projects, setProjects] =
    useState<Project[]>(initialProjects);

  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<"Alla" | ProjectStatus>("Alla");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [formError, setFormError] = useState("");

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus =
        status === "Alla" || project.status === status;

      const matchesSearch =
        !normalizedSearch ||
        project.name.toLowerCase().includes(normalizedSearch) ||
        project.customer.toLowerCase().includes(normalizedSearch) ||
        project.id.toLowerCase().includes(normalizedSearch) ||
        project.location.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [projects, search, status]);

  const activeProjects = projects.filter(
    (project) =>
      project.status === "Pågår" || project.status === "Risk",
  ).length;

  const riskProjects = projects.filter(
    (project) => project.status === "Risk",
  ).length;

  const totalBudget = projects.reduce(
    (sum, project) => sum + project.budget,
    0,
  );

  function updateForm(
    field: keyof ProjectForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError("");
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const budget = Number(form.budget);

    if (!form.name.trim()) {
      setFormError("Ange ett projektnamn.");
      return;
    }

    if (!form.customer.trim()) {
      setFormError("Ange en kund.");
      return;
    }

    if (!form.location.trim()) {
      setFormError("Ange projektets ort.");
      return;
    }

    if (!Number.isFinite(budget) || budget <= 0) {
      setFormError("Ange en giltig projektbudget.");
      return;
    }

    if (
      form.startDate &&
      form.endDate &&
      form.endDate < form.startDate
    ) {
      setFormError(
        "Slutdatum kan inte vara före startdatum.",
      );
      return;
    }

    const sequence = projects.length + 11;
    const projectNumber = String(sequence).padStart(4, "0");

    const newProject: Project = {
      id: `BX-2027-${projectNumber}`,
      name: form.name.trim(),
      customer: form.customer.trim(),
      location: form.location.trim(),
      manager:
        form.manager.trim() || "Ej tilldelad",
      status: "Planering",
      progress: 0,
      budget,
      margin: null,
      startDate: form.startDate,
      endDate: form.endDate,
    };

    setProjects((current) => [
      newProject,
      ...current,
    ]);

    setForm(emptyForm);
    setFormError("");
    setDrawerOpen(false);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#777b7d]">
              Bynex Projekt
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Projekt
            </h1>

            <p className="mt-2 text-[#707477]">
              Följ framdrift, budget och risker för företagets
              projekt.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex w-fit items-center gap-2 rounded-xl bg-gradient-to-b from-[#575b5d] to-[#292d2f] px-5 py-3 font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <FolderPlus size={19} />
            Nytt projekt
          </button>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_10px_30px_rgba(30,33,35,0.05)]">
            <p className="text-sm text-[#707477]">
              Totalt antal projekt
            </p>
            <p className="mt-3 text-3xl font-bold">
              {projects.length}
            </p>
          </article>

          <article className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_10px_30px_rgba(30,33,35,0.05)]">
            <p className="text-sm text-[#707477]">
              Aktiva projekt
            </p>
            <p className="mt-3 text-3xl font-bold">
              {activeProjects}
            </p>
          </article>

          <article className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_10px_30px_rgba(30,33,35,0.05)]">
            <p className="text-sm text-[#707477]">
              Projekt med risk
            </p>
            <p className="mt-3 text-3xl font-bold text-[#ad4929]">
              {riskProjects}
            </p>
          </article>

          <article className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_10px_30px_rgba(30,33,35,0.05)]">
            <p className="text-sm text-[#707477]">
              Samlad projektbudget
            </p>
            <p className="mt-3 text-2xl font-bold">
              {formatMoney(totalBudget)} kr
            </p>
          </article>
        </section>

        <section className="mt-6 rounded-3xl border border-[#dedfdd] bg-[#fafaf8] shadow-[0_12px_34px_rgba(30,33,35,0.05)]">
          <div className="border-b border-[#dedfdd] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full max-w-xl">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Sök projekt, kund, ort eller projektnummer..."
                  className="w-full rounded-xl border border-[#d5d6d4] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#8a8e90] focus:ring-2 focus:ring-black/5"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {statusFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatus(filter)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      status === filter
                        ? "bg-[#303436] text-white"
                        : "border border-[#d7d8d6] bg-white text-[#55595b] hover:bg-[#ececea]"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="p-12 text-center">
              <BriefcaseBusiness
                size={34}
                className="mx-auto text-[#8b8f91]"
              />
              <h2 className="mt-4 text-lg font-bold">
                Inga projekt hittades
              </h2>
              <p className="mt-2 text-sm text-[#74787a]">
                Ändra sökningen eller välj ett annat statusfilter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#dedfdd]">
              {filteredProjects.map((project) => (
                <article
                  key={project.id}
                  className="grid gap-5 p-5 transition hover:bg-[#f1f1ef] xl:grid-cols-[1.4fr_1fr_1fr_170px]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs font-bold tracking-[0.12em] text-[#85898b]">
                        {project.id}
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          project.status,
                        )}`}
                      >
                        {project.status}
                      </span>
                    </div>

                    <h2 className="mt-3 text-lg font-bold">
                      {project.name}
                    </h2>

                    <p className="mt-1 text-sm text-[#74787a]">
                      {project.customer}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#74787a]">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} />
                        {project.location}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <UserRound size={14} />
                        {project.manager}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-[#85898b]">
                      Framdrift
                    </p>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-[#74787a]">
                        Genomfört
                      </span>
                      <span className="font-bold">
                        {project.progress} %
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e1e2e0]">
                      <div
                        className={`h-full rounded-full ${
                          project.status === "Risk"
                            ? "bg-gradient-to-r from-[#ad684b] to-[#d69573]"
                            : "bg-gradient-to-r from-[#666b6d] to-[#afb2b3]"
                        }`}
                        style={{
                          width: `${project.progress}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-[#85898b]">
                      Ekonomi och tid
                    </p>

                    <p className="mt-3 font-semibold">
                      {formatMoney(project.budget)} kr
                    </p>

                    <p
                      className={`mt-2 text-sm font-semibold ${
                        project.margin === null
                          ? "text-[#74787a]"
                          : project.margin < 0
                            ? "text-[#c94e32]"
                            : "text-[#24744d]"
                      }`}
                    >
                      {project.margin === null
                        ? "Prognos saknas"
                        : `${
                            project.margin > 0 ? "+" : ""
                          }${formatMoney(project.margin)} kr`}
                    </p>

                    <p className="mt-3 flex items-center gap-1.5 text-xs text-[#74787a]">
                      <CalendarDays size={14} />
                      {formatDate(project.endDate)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#dedfdd] to-[#c9cbcb] px-4 py-3 text-sm font-semibold transition hover:brightness-95"
                    >
                      Öppna projekt
                      <ArrowRight size={16} />
                    </button>

                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#d6d7d5] bg-white px-4 py-3 text-sm font-semibold text-[#666a6c] transition hover:bg-[#ececea]"
                    >
                      <Archive size={16} />
                      Arkivera
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <button
        type="button"
        aria-label="Stäng panelen"
        onClick={closeDrawer}
        className={`fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] transition-opacity duration-300 ${
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-[#f7f7f5] shadow-[-24px_0_70px_rgba(10,12,14,0.2)] transition-transform duration-300 ${
          drawerOpen
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between border-b border-[#dedfdd] px-6 py-6 md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#777b7d]">
              Bynex Projekt
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Skapa nytt projekt
            </h2>
          </div>

          <button
            type="button"
            onClick={closeDrawer}
            className="rounded-xl border border-[#d7d8d6] bg-white p-2.5 hover:bg-[#e9e9e7]"
            aria-label="Stäng"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={createProject}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 md:px-8">
            <ProjectInput
              label="Projektnamn"
              value={form.name}
              onChange={(value) =>
                updateForm("name", value)
              }
              placeholder="Villa Ängsvägen 8"
            />

            <ProjectInput
              label="Kund"
              value={form.customer}
              onChange={(value) =>
                updateForm("customer", value)
              }
              placeholder="Kundens namn eller företag"
            />

            <ProjectInput
              label="Ort"
              value={form.location}
              onChange={(value) =>
                updateForm("location", value)
              }
              placeholder="Trosa"
            />

            <ProjectInput
              label="Projektledare"
              value={form.manager}
              onChange={(value) =>
                updateForm("manager", value)
              }
              placeholder="Projektledarens namn"
            />

            <ProjectInput
              label="Projektbudget"
              value={form.budget}
              onChange={(value) =>
                updateForm("budget", value)
              }
              placeholder="0"
              type="number"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <ProjectInput
                label="Startdatum"
                value={form.startDate}
                onChange={(value) =>
                  updateForm("startDate", value)
                }
                type="date"
              />

              <ProjectInput
                label="Slutdatum"
                value={form.endDate}
                onChange={(value) =>
                  updateForm("endDate", value)
                }
                type="date"
              />
            </div>

            {formError && (
              <div className="rounded-xl border border-[#edc5b7] bg-[#fff1eb] px-4 py-3 text-sm font-medium text-[#a94728]">
                <div className="flex gap-2">
                  <CircleAlert
                    size={18}
                    className="shrink-0"
                  />
                  {formError}
                </div>
              </div>
            )}
          </div>

          <footer className="flex gap-3 border-t border-[#dedfdd] px-6 py-5 md:px-8">
            <button
              type="button"
              onClick={closeDrawer}
              className="flex-1 rounded-xl border border-[#d5d6d4] bg-white px-5 py-3 font-semibold hover:bg-[#ececea]"
            >
              Avbryt
            </button>

            <button
              type="submit"
              className="flex-1 rounded-xl bg-gradient-to-b from-[#575b5d] to-[#292d2f] px-5 py-3 font-semibold text-white hover:brightness-110"
            >
              Skapa projekt
            </button>
          </footer>
        </form>
      </aside>
    </AppShell>
  );
}

type ProjectInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date";
};

function ProjectInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: ProjectInputProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <input
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-[#d6d7d5] bg-white px-4 py-3 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
      />
    </label>
  );
}