"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ArrowRight, Bell, Menu, Search, Settings, Sparkles, X } from "lucide-react";

import Logo from "@/components/layout/Logo";
import type { ModuleId } from "@/lib/navigation";

export type NavigationItem = {
  id: ModuleId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export default function AppShell({
  active,
  title,
  items,
  onNavigate,
  onNotify,
  children,
}: {
  active: ModuleId;
  title: string;
  items: NavigationItem[];
  onNavigate: (module: ModuleId) => void;
  onNotify: (message: string) => void;
  children: ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);

  const navigation = (
    <nav className="mt-8 space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              setMobileNav(false);
            }}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
              selected ? "bg-zinc-950 text-white shadow-lg shadow-zinc-950/10" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-zinc-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-zinc-200 bg-white p-5 lg:block">
        <Logo />
        {navigation}
        <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-zinc-950 p-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" />Bynex AI</div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">Tre åtgärder är förberedda för godkännande.</p>
          <button onClick={() => onNavigate("site-manager")} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950">Visa rekommendationer<ArrowRight className="h-4 w-4" /></button>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden">
          <div className="h-full w-[86%] max-w-sm bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><Logo /><button onClick={() => setMobileNav(false)} className="rounded-xl p-2 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
            {navigation}
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#f3f4f6]/90 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileNav(true)} className="rounded-xl border border-zinc-200 bg-white p-2 lg:hidden"><Menu className="h-5 w-5" /></button>
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Bynex OS</p><h1 className="text-xl font-semibold">{title}</h1></div>
            </div>

            <div className="hidden max-w-md flex-1 items-center lg:flex">
              <div className="relative w-full"><Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400" /><input placeholder="Sök projekt, person eller uppdrag" className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-zinc-400" /></div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => onNotify("Inga nya notiser")} className="rounded-2xl border border-zinc-200 bg-white p-3" aria-label="Notiser"><Bell className="h-5 w-5" /></button>
              <button onClick={() => onNotify("Inställningar öppnade")} className="rounded-2xl border border-zinc-200 bg-white p-3" aria-label="Inställningar"><Settings className="h-5 w-5" /></button>
              <div className="hidden items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 sm:flex"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">CA</div><div><p className="text-sm font-semibold">Christoffer</p><p className="text-xs text-zinc-500">Administratör</p></div></div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
