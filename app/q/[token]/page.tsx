import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MapPin, QrCode } from "lucide-react";
import Logo from "@/components/layout/Logo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const tokenPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-9a-f]{64})$/i;

export default async function AssetQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const match = token.match(tokenPattern);
  if (!match) return <InvalidQr />;

  const supabase = await createServerSupabaseClient();
  const claims = supabase ? await supabase.auth.getClaims() : null;
  if (!supabase || !claims?.data?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/q/${token}`)}`);

  const { data, error } = await supabase.rpc("resolve_asset_qr", {
    p_qr_code_id: match[1], p_secret: match[2], p_action: "view", p_project_id: null,
    p_ip_hash: null, p_user_agent: "Bynex QR web",
  });
  const asset = data?.[0];
  if (error || !asset) return <InvalidQr />;

  const { data: details } = await supabase.from("assets")
    .select("location_text,project_id")
    .eq("organization_id", asset.organization_id)
    .eq("id", asset.asset_id)
    .maybeSingle();
  const project = details?.project_id ? await supabase.from("projects").select("name").eq("organization_id", asset.organization_id).eq("id", details.project_id).maybeSingle() : null;

  return <main className="min-h-screen bg-zinc-100 px-5 py-10 text-zinc-950"><section className="mx-auto max-w-xl rounded-[32px] border border-zinc-200 bg-white p-7 shadow-xl"><Logo priority /><div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-7 w-7" /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">{asset.asset_number}</p><h1 className="mt-2 text-3xl font-semibold">{asset.asset_name}</h1><p className="mt-2 text-sm text-zinc-500">QR-koden är giltig och tillhör ett företag där du är aktiv medlem.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs text-zinc-500">Status</p><p className="mt-1 font-semibold">{asset.asset_status}</p></div><div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs text-zinc-500">Aktuell plats</p><p className="mt-1 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> {details?.location_text ?? "Behöver registreras"}</p></div></div>{project?.data?.name && <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950">Aktuellt projekt: <strong>{project.data.name}</strong></p>}<Link href="/app?module=assets" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white"><QrCode className="h-5 w-5" /> Öppna tillgången i Bynex</Link><p className="mt-4 text-center text-xs text-zinc-400">Skanningen är registrerad i företagets spårbara historik.</p></section></main>;
}

function InvalidQr() { return <main className="grid min-h-screen place-items-center bg-zinc-100 p-5"><section className="max-w-md rounded-[28px] bg-white p-7 text-center shadow-xl"><QrCode className="mx-auto h-10 w-10 text-zinc-400" /><h1 className="mt-5 text-2xl font-semibold">QR-koden kan inte användas</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Koden är ogiltig, ersatt, utgången eller tillhör ett annat företag än det du är inloggad i.</p><Link href="/app" className="mt-6 inline-flex rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Till Bynex</Link></section></main>; }
