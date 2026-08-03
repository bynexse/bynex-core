"use client";

import { FormEvent, useState } from "react";
import { Building2, CalendarDays, MapPin, UserRound, X } from "lucide-react";

export type NewProjectData = {
  name: string;
  customer: string;
  location: string;
  budget: number;
  startDate: string;
  endDate: string;
};

type NewProjectDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (project: NewProjectData) => void;
};

const initialForm: NewProjectData = {
  name: "",
  customer: "",
  location: "",
  budget: 0,
  startDate: "",
  endDate: "",
};

export default function NewProjectDrawer({
  open,
  onClose,
  onCreate,
}: NewProjectDrawerProps) {
  const [form, setForm] = useState<NewProjectData>(initialForm);
  const [error, setError] = useState("");

  function updateField(
    field: keyof NewProjectData,
    value: string | number,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Ange ett projektnamn.");
      return;
    }

    if (!form.customer.trim()) {
      setError("Ange kundens namn.");
      return;
    }

    if (!form.location.trim()) {
      setError("Ange projektets ort.");
      return;
    }

    if (form.budget <= 0) {
      setError("Budgeten måste vara större än 0 kr.");
      return;
    }

    setError("");
    onCreate(form);
    setForm(initialForm);
    onClose();
  }

  function handleClose() {
    setError("");
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Stäng panelen"
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] transition-opacity duration-300 ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-[#f7f7f5] shadow-[-24px_0_70px_rgba(10,12,14,0.2)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between border-b border-[#dedfdd] px-6 py-6 md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#777b7d]">
              Projekt
            </p>

            <h2 className="mt-2 text-2xl font-bold">Skapa nytt projekt</h2>

            <p className="mt-2 text-sm text-[#74787a]">
              Grundinformationen kan kompletteras senare.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-[#d7d8d6] bg-white p-2.5 transition hover:bg-[#e9e9e7]"
            aria-label="Stäng"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 md:px-8">
            <div>
              <label
                htmlFor="project-name"
                className="text-sm font-semibold"
              >
                Projektnamn
              </label>

              <div className="relative mt-2">
                <Building2
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                />

                <input
                  id="project-name"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    updateField("name", event.target.value)
                  }
                  placeholder="Exempel: Villa Ängsvägen 8"
                  className="w-full rounded-xl border border-[#d6d7d5] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="project-customer"
                className="text-sm font-semibold"
              >
                Kund
              </label>

              <div className="relative mt-2">
                <UserRound
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                />

                <input
                  id="project-customer"
                  type="text"
                  value={form.customer}
                  onChange={(event) =>
                    updateField("customer", event.target.value)
                  }
                  placeholder="Kundens namn eller företag"
                  className="w-full rounded-xl border border-[#d6d7d5] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="project-location"
                className="text-sm font-semibold"
              >
                Ort
              </label>

              <div className="relative mt-2">
                <MapPin
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                />

                <input
                  id="project-location"
                  type="text"
                  value={form.location}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  placeholder="Exempel: Trosa"
                  className="w-full rounded-xl border border-[#d6d7d5] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="project-budget"
                className="text-sm font-semibold"
              >
                Projektbudget
              </label>

              <div className="relative mt-2">
                <input
                  id="project-budget"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.budget || ""}
                  onChange={(event) =>
                    updateField("budget", Number(event.target.value))
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-[#d6d7d5] bg-white px-4 py-3 pr-14 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                />

                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#74787a]">
                  kr
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="project-start"
                  className="text-sm font-semibold"
                >
                  Startdatum
                </label>

                <div className="relative mt-2">
                  <CalendarDays
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                  />

                  <input
                    id="project-start"
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      updateField("startDate", event.target.value)
                    }
                    className="w-full rounded-xl border border-[#d6d7d5] bg-white py-3 pl-11 pr-3 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="project-end"
                  className="text-sm font-semibold"
                >
                  Slutdatum
                </label>

                <div className="relative mt-2">
                  <CalendarDays
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#777b7d]"
                  />

                  <input
                    id="project-end"
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      updateField("endDate", event.target.value)
                    }
                    className="w-full rounded-xl border border-[#d6d7d5] bg-white py-3 pl-11 pr-3 outline-none transition focus:border-[#797d7f] focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-[#edc5b7] bg-[#fff1eb] px-4 py-3 text-sm font-medium text-[#a94728]">
                {error}
              </div>
            )}
          </div>

          <footer className="flex gap-3 border-t border-[#dedfdd] bg-[#f7f7f5] px-6 py-5 md:px-8">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-[#d5d6d4] bg-white px-5 py-3 font-semibold transition hover:bg-[#ececea]"
            >
              Avbryt
            </button>

            <button
              type="submit"
              className="flex-1 rounded-xl bg-gradient-to-b from-[#575b5d] to-[#292d2f] px-5 py-3 font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Skapa projekt
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}