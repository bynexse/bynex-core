import { Clock3, FolderPlus } from "lucide-react";
import Greeting from "./Greeting";

export default function Hero() {
  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#111517] via-[#202426] to-[#575b5d] p-7 text-white shadow-[0_20px_60px_rgba(20,23,25,0.18)] md:p-10">
      <div className="flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
        <div>
          <Greeting name="Christoffer" />

          <p className="mt-5 max-w-2xl leading-7 text-white/70">
            Bynex har analyserat företaget och sammanställt det viktigaste
            för den fortsatta arbetsdagen.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-white to-[#d7d9d9] px-5 py-3 font-semibold text-[#17191b] transition hover:brightness-95"
          >
            <FolderPlus size={19} strokeWidth={1.8} />
            Nytt projekt
          </button>

          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/15"
          >
            <Clock3 size={19} strokeWidth={1.8} />
            Rapportera tid
          </button>
        </div>
      </div>
    </section>
  );
}