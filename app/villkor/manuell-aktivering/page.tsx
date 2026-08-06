import Link from "next/link";

export const metadata = {
  title: "Manuell aktivering | Bynex",
  description: "Tekniskt faktureringsunderlag för manuellt aktiverade Bynex-kunder.",
};

const canonicalText = [
  "Bynex HQ manuell aktivering v1",
  "Detta underlag används endast när Bynex personal registrerar att kunden har godkänt ett separat avtal, en offert, en order eller en annan dokumenterad överenskommelse.",
  "Den registrerade godkännandereferensen ska göra kundens överenskommelse spårbar.",
  "Kundens separata överenskommelse styr pris, omfattning och villkor. Detta underlag ersätter inte den överenskommelsen.",
  "Plan, användarantal, månadspris, bindningstid, startdatum och fakturaschema sparas i Bynex när aktiveringen genomförs.",
];

export default function ManualActivationTermsPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-12 text-zinc-950 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
          Bynex Billing
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Manuell aktivering enligt separat kundöverenskommelse
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-600">
          Version <strong>hq-manual-activation-v1</strong>. Dokumentet beskriver hur
          Bynex HQ skapar ett spårbart tekniskt faktureringsunderlag när kundens
          godkännande redan finns i ett separat avtal, en accepterad offert, en order
          eller motsvarande dokumentation.
        </p>

        <div className="mt-8 space-y-5">
          {canonicalText.slice(1).map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-zinc-700">
              {paragraph}
            </p>
          ))}
        </div>

        <section className="mt-8 rounded-2xl bg-zinc-50 p-5 text-sm leading-7 text-zinc-700">
          <h2 className="font-semibold text-zinc-950">Spårbarhet i HQ</h2>
          <p className="mt-2">
            Den som aktiverar kunden måste registrera en godkännandereferens. Bynex
            sparar vem som genomförde aktiveringen, tidpunkten, vald plan,
            användarantal, startdatum, bindningstid och det fakturaschema som skapades.
          </p>
        </section>

        <p className="mt-8 text-xs leading-6 text-zinc-500">
          SHA-256 för den kanoniska texten: 47a83dcf8e96913eec810816d9c0500a9db06deb8ca8273d9793188900e1f9e7
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Till Bynex
        </Link>
      </article>
    </main>
  );
}
