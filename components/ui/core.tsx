import type { ComponentType, ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "dark";
}) {
  const classes = {
    neutral: "bg-[#e8e8e6] text-[#454950] before:bg-[#7e858f]",
    success: "bg-[#edf5ef] text-[#285f3d] before:bg-[#2f7d4d]",
    warning: "bg-[#fbf1e5] text-[#8d5414] before:bg-[#c47718]",
    danger: "bg-[#f9ebeb] text-[#8d3030] before:bg-[#b23a3a]",
    dark: "bg-[#202226] text-white before:bg-[#b8bdc5]",
  };
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:content-[''] ${classes[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`bynex-panel rounded-[28px] ${className}`}>{children}</section>;
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
          <p className="text-sm font-medium text-[#454950]">{label}</p>
          <p className="mt-3 text-2xl font-semibold">{value}</p>
          <p className="mt-2 text-xs text-[#7e858f]">{helper}</p>
        </div>
        <div className="bynex-icon-tile rounded-2xl p-3"><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}
