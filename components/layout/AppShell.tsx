import type { ReactNode } from "react";
import {
  Clock3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
} from "lucide-react";

type AppShellProps = {
  children: ReactNode;
};

const menu = [
  { icon: LayoutDashboard, label: "Ledningscentral" },
  { icon: FolderKanban, label: "Projekt" },
  { icon: Clock3, label: "Tidrapportering" },
  { icon: FileText, label: "ÄTA" },
  { icon: Settings, label: "Inställningar" },
];

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[#f4f4f2] text-[#17191b]">
      <aside className="hidden w-72 flex-col bg-[#111517] p-6 text-white lg:flex">
        <div>
          <h1 className="text-3xl font-bold tracking-[0.22em]">
            BY<span className="text-[#aeb2b4]">NEX</span>
          </h1>

          <p className="mt-3 text-sm text-[#969b9e]">
            Bygg mer. Administrera mindre.
          </p>
        </div>

        <nav className="mt-10 flex-1 space-y-2">
          {menu.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  index === 0
                    ? "bg-gradient-to-r from-[#717579] to-[#969a9d] text-white"
                    : "text-[#d6d8d9] hover:bg-[#24292b]"
                }`}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#eeeeec] to-[#aeb2b4] text-sm font-bold text-[#17191b]">
              CA
            </div>

            <div>
              <p className="text-sm font-semibold">Christoffer Alsbjer</p>
              <p className="text-xs text-[#92989b]">Administratör</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}