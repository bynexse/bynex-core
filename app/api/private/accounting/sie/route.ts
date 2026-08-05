import { buildSie4Export, MAX_SIE_FILE_BYTES, parseSie } from "@/lib/accounting/sie";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);

async function sieContext() {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }

  const organizationId = profile.current_organization_id;
  const [{ data: membership }, { data: entitlement }] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("active_organization_module_entitlements")
      .select("module_slug")
      .eq("organization_id", organizationId)
      .eq("module_slug", "bookkeeping")
      .maybeSingle(),
  ]);
  if (!membership || !financeRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Ekonomibehörighet krävs för SIE-filer." }, { status: 403 }) };
  }
  if (!entitlement) {
    return { ok: false as const, response: Response.json({ error: "Bokföring ingår inte i företagets aktiva paket." }, { status: 403 }) };
  }
  return { ok: true as const, supabase: auth.supabase, organizationId };
}

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "bynex";
}

export async function POST(request: Request) {
  const context = await sieContext();
  if (!context.ok) return context.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Response.json({ error: "Ladda upp filen som formulärdata." }, { status: 415 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Välj en SIE-fil." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_SIE_FILE_BYTES) {
    return Response.json({ error: "SIE-filen måste vara mellan 1 byte och 10 MB." }, { status: 400 });
  }
  if (!/\.(?:si|se|sie)$/i.test(file.name)) {
    return Response.json({ error: "Filändelsen måste vara .SI, .SE eller .SIE." }, { status: 400 });
  }

  try {
    const preview = parseSie(new Uint8Array(await file.arrayBuffer()));
    const { data: organization } = await context.supabase
      .from("organizations")
      .select("organization_number")
      .eq("id", context.organizationId)
      .maybeSingle();
    const fileOrganizationNumber = preview.organizationNumber?.replace(/\D/g, "");
    const activeOrganizationNumber = organization?.organization_number?.replace(/\D/g, "");
    if (fileOrganizationNumber && activeOrganizationNumber && fileOrganizationNumber !== activeOrganizationNumber) {
      preview.warnings.unshift("Organisationsnumret i filen matchar inte det aktiva företaget.");
    }
    const voucherCount = preview.vouchers.length;
    return Response.json({
      file: { name: file.name, size: file.size },
      preview: { ...preview, voucherCount, vouchers: preview.vouchers.slice(0, 250) },
      canBook: false,
      message: "Filen är läst och kontrollerad. Ingen verifikation har bokförts; importen kräver ett separat granskningsbeslut.",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "SIE-filen kunde inte läsas." },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const context = await sieContext();
  if (!context.ok) return context.response;

  const requestedYear = new URL(request.url).searchParams.get("fiscalYearId");
  let fiscalYearQuery = context.supabase
    .from("bookkeeping_fiscal_years")
    .select("id,starts_on,ends_on,status")
    .eq("organization_id", context.organizationId);
  if (requestedYear) fiscalYearQuery = fiscalYearQuery.eq("id", requestedYear);
  else fiscalYearQuery = fiscalYearQuery.order("starts_on", { ascending: false }).limit(1);

  const [{ data: organization, error: organizationError }, { data: fiscalYear, error: yearError }] = await Promise.all([
    context.supabase
      .from("organizations")
      .select("name,organization_number")
      .eq("id", context.organizationId)
      .maybeSingle(),
    fiscalYearQuery.maybeSingle(),
  ]);
  if (organizationError || yearError || !organization || !fiscalYear) {
    return Response.json({ error: "Företagsuppgifter eller räkenskapsår saknas." }, { status: 409 });
  }

  const [{ data: accounts, error: accountsError }, vouchersResult] = await Promise.all([
    context.supabase
      .from("ledger_accounts")
      .select("id,account_number,name")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("account_number")
      .limit(10_000),
    context.supabase
      .from("bookkeeping_vouchers")
      .select("id,voucher_number,voucher_date,description", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .eq("fiscal_year_id", fiscalYear.id)
      .eq("status", "posted")
      .order("voucher_date")
      .order("voucher_number")
      .limit(5_001),
  ]);
  if (accountsError || vouchersResult.error) {
    return Response.json({ error: "Bokföringsunderlaget kunde inte hämtas." }, { status: 500 });
  }
  if ((vouchersResult.count ?? 0) > 5_000) {
    return Response.json({ error: "Räkenskapsåret innehåller fler än 5 000 verifikationer. Dela exporten i perioder innan filen skapas." }, { status: 409 });
  }

  const vouchers = vouchersResult.data ?? [];
  const voucherIds = vouchers.map((voucher) => voucher.id);
  const lineBatches = [];
  for (let index = 0; index < voucherIds.length; index += 200) {
    lineBatches.push(
      context.supabase
        .from("bookkeeping_voucher_lines")
        .select("voucher_id,line_number,account_id,description,debit_amount,credit_amount")
        .eq("organization_id", context.organizationId)
        .in("voucher_id", voucherIds.slice(index, index + 200))
        .order("voucher_id")
        .order("line_number")
        .limit(20_000),
    );
  }
  const lineResults = await Promise.all(lineBatches);
  if (lineResults.some((result) => result.error)) {
    return Response.json({ error: "Verifikationsraderna kunde inte hämtas." }, { status: 500 });
  }
  const lines = lineResults.flatMap((result) => result.data ?? []);
  if (lines.length > 50_000) {
    return Response.json({ error: "Exporten innehåller fler än 50 000 bokföringsrader. Dela exporten i perioder." }, { status: 409 });
  }

  const accountById = new Map((accounts ?? []).map((account) => [account.id, account.account_number]));
  const linesByVoucher = new Map<string, Array<{ accountNumber: string; amount: number; description: string | null }>>();
  for (const line of lines) {
    const accountNumber = accountById.get(line.account_id);
    if (!accountNumber) return Response.json({ error: "En bokföringsrad saknar ett aktivt konto och kan inte exporteras." }, { status: 409 });
    const rows = linesByVoucher.get(line.voucher_id) ?? [];
    rows.push({
      accountNumber,
      amount: Number(line.debit_amount) - Number(line.credit_amount),
      description: line.description,
    });
    linesByVoucher.set(line.voucher_id, rows);
  }
  if (vouchers.some((voucher) => (linesByVoucher.get(voucher.id)?.length ?? 0) < 2)) {
    return Response.json({ error: "En bokförd verifikation saknar fullständiga rader och kan inte exporteras." }, { status: 409 });
  }

  const bytes = buildSie4Export({
    companyName: organization.name,
    organizationNumber: organization.organization_number,
    generatedAt: new Date(),
    fiscalYear: { startsOn: fiscalYear.starts_on, endsOn: fiscalYear.ends_on },
    accounts: (accounts ?? []).map((account) => ({ number: account.account_number, name: account.name })),
    vouchers: vouchers.map((voucher) => ({
      number: voucher.voucher_number ?? "",
      date: voucher.voucher_date,
      description: voucher.description,
      lines: linesByVoucher.get(voucher.id) ?? [],
    })),
  });
  const filename = `${safeFilename(organization.name)}-${fiscalYear.starts_on}-${fiscalYear.ends_on}.se`;
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
