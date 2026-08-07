import Image from "next/image";

export const metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-zinc-950">
      <section className="w-full max-w-xl rounded-[2rem] border border-zinc-200 bg-white p-7 text-center shadow-xl sm:p-10">
        <Image
          src="/brand/bynex-mark.png"
          alt="Bynex"
          width={1254}
          height={1254}
          className="mx-auto h-16 w-16 rounded-2xl"
        />
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Säker offlinevy</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Bynex väntar på anslutning</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-600">
          Kund-, personal- och ekonomidata sparas inte i en öppen webbcache. Anslutningen behöver därför återställas innan arbetsytan kan öppnas igen.
        </p>
        <a
          href="/app"
          className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white"
        >
          Försök öppna Bynex igen
        </a>
      </section>
    </main>
  );
}
