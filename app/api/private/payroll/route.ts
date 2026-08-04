import { requireSupabaseUser } from "@/lib/supabase/require-user";

async function organizationContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }
  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
  };
}

export async function GET() {
  const context = await organizationContext();
  if (!context.ok) return context.response;

  const [{ data: periods }, { data: workers }, { data: settings }] = await Promise.all([
    context.supabase
      .from("payroll_periods")
      .select("id,payroll_month,period_start,period_end,status,payment_date,calculation_cutoff_date,total_gross_pay,total_net_pay,total_preliminary_tax,total_employer_contributions,approved_at")
      .eq("organization_id", context.organizationId)
      .order("payroll_month", { ascending: false })
      .limit(18),
    context.supabase
      .from("workers")
      .select("id,full_name,job_title,employment_type")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("full_name"),
    context.supabase
      .from("payroll_cycle_settings")
      .select("payment_day,auto_prepare_payroll,auto_prepare_agi,require_payment_approval,require_agi_approval")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const currentPeriod = periods?.[0] ?? null;
  const { data: entries } = currentPeriod
    ? await context.supabase
        .from("payroll_entries")
        .select("id,worker_id,regular_minutes,overtime_minutes,cash_compensation,taxable_benefits,expense_reimbursements,gross_taxable_amount,preliminary_tax,employer_contributions,deductions,net_pay,vacation_balance_days,absence_percent,status,calculated_at")
        .eq("organization_id", context.organizationId)
        .eq("payroll_period_id", currentPeriod.id)
        .order("created_at")
    : { data: [] };

  return Response.json({ periods: periods ?? [], currentPeriod, entries: entries ?? [], workers: workers ?? [], settings });
}

export async function POST() {
  const context = await organizationContext();
  if (!context.ok) return context.response;

  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
  const year = Number(todayParts.year);
  const monthNumber = Number(todayParts.month);
  const month = `${todayParts.year}-${todayParts.month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const periodEnd = `${todayParts.year}-${todayParts.month}-${String(lastDay).padStart(2, "0")}`;

  const { data: existing } = await context.supabase
    .from("payroll_periods")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("payroll_month", month)
    .maybeSingle();
  if (existing) return Response.json({ period: existing });

  const { data: settings } = await context.supabase
    .from("payroll_cycle_settings")
    .select("payment_day")
    .eq("organization_id", context.organizationId)
    .eq("active", true)
    .maybeSingle();
  const paymentDay = Math.min(settings?.payment_day ?? 25, lastDay);
  const paymentDate = `${todayParts.year}-${todayParts.month}-${String(paymentDay).padStart(2, "0")}`;

  const { data, error } = await context.supabase
    .from("payroll_periods")
    .insert({
      organization_id: context.organizationId,
      payroll_month: month,
      period_start: month,
      period_end: periodEnd,
      payment_date: paymentDate,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return Response.json({ error: "Löneperioden kunde inte skapas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ period: data }, { status: 201 });
}
