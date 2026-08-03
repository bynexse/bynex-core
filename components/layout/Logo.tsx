import {
  Bot,
  PanelTop
} from "lucide-react";

export default function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 text-white">
        <PanelTop className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xl font-black tracking-tight">BYNEX</p>
        <p className="text-xs font-semibold text-zinc-400">AI för byggbranschen</p>
      </div>
    </div>
  );
}
