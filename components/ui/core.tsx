import type { ComponentType, ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "dark";
}) {
  const classes = {
    neutral: "bg-zinc-100 text-zinc-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
    dark: "bg-zinc-950 text-white",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-[28px] border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

export function Stat({ label, value, helper, icon: Icon }: {
  label: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold">{value}</p>
          <p className="mt-2 text-xs text-zinc-400">{helper}</p>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-3"><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}
