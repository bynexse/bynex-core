import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "hr", "manager"]);
const qualificationRoles = new Set(["owner", "admin", "office", "manager"]);
const compensationRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const employmentTypes = new Set(["employee", "contractor", "subcontractor", "temporary"]);

async function peopleContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }),
    };
  }
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET() {
  const context = await peopleContext();
  if (!context.ok) return context.response;

  const [workersResult, skillsResult, certificatesResult] = await Promise.all([
    context.supabase
      .from("workers")
      .select("id,profile_id,full_name,email,phone,employment_type,company_name,job_title,active,gps_enabled,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("active", { ascending: false })
      .order("full_name"),
    context.supabase
      .from("worker_skills")
      .select("id,worker_id,name,level,created_at")
      .eq("organization_id", context.organizationId)
      .order("name"),
    context.supabase
      .from("worker_certificates")
      .select("id,worker_id,name,issuer,certificate_number,valid_from,valid_until,status,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("valid_until", { ascending: true, nullsFirst: false }),
  ]);

  const firstError = workersResult.error ?? skillsResult.error ?? certificatesResult.error;
  if (firstError) {
    return Response.json(
      { error: "Personaluppgifterna kunde inte hämtas." },
      { status: firstError.code === "42501" ? 403 : 500 },
    );
  }

  let compensation: Array<{
    worker_id: string;
    monthly_salary: number | string;
    hourly_cost: number | string;
    hourly_bill_rate: number | string;
    pension_percent: number | string;
    valid_from: string;
    valid_until: string | null;
  }> = [];

  if (compensationRoles.has(context.role)) {
    const { data, error } = await context.supabase
      .from("worker_compensation")
      .select("worker_id,monthly_salary,hourly_cost,hourly_bill_rate,pension_percent,valid_from,valid_until")
      .eq("organization_id", context.organizationId)
      .order("valid_from", { ascending: false });

    if (error) {
      return Response.json(
        { error: "Personalkostnaderna kunde inte hämtas." },
        { status: error.code === "42501" ? 403 : 500 },
      );
    }
    compensation = data ?? [];
  }

  const currentCompensation = new Map<string, (typeof compensation)[number]>();
  for (const row of compensation) {
    if (!currentCompensation.has(row.worker_id)) currentCompensation.set(row.worker_id, row);
  }

  const skillsByWorker = new Map<string, typeof skillsResult.data>();
  for (const skill of skillsResult.data ?? []) {
    const existing = skillsByWorker.get(skill.worker_id) ?? [];
    existing.push(skill);
    skillsByWorker.set(skill.worker_id, existing);
  }

  const certificatesByWorker = new Map<string, typeof certificatesResult.data>();
  for (const certificate of certificatesResult.data ?? []) {
    const existing = certificatesByWorker.get(certificate.worker_id) ?? [];
    existing.push(certificate);
    certificatesByWorker.set(certificate.worker_id, existing);
  }

  const people = (workersResult.data ?? []).map((worker) => ({
    ...worker,
    skills: skillsByWorker.get(worker.id) ?? [],
    certificates: certificatesByWorker.get(worker.id) ?? [],
    compensation: currentCompensation.get(worker.id) ?? null,
  }));

  return Response.json({
    people,
    permissions: {
      canManage: managementRoles.has(context.role),
      canManageQualifications: qualificationRoles.has(context.role),
      canSeeCompensation: compensationRoles.has(context.role),
    },
  });
}

export async function POST(request: Request) {
  const context = await peopleContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json({ error: "Du saknar behörighet att lägga till personal." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim() : "";
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  const employmentType = typeof body?.employmentType === "string" ? body.employmentType : "employee";

  if (fullName.length < 2 || fullName.length > 160) {
    return Response.json({ error: "Namn måste innehålla 2–160 tecken." }, { status: 400 });
  }
  if (!employmentTypes.has(employmentType)) {
    return Response.json({ error: "Anställningsformen är ogiltig." }, { status: 400 });
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return Response.json({ error: "E-postadressen är ogiltig." }, { status: 400 });
  }
  if (phone.length > 40 || jobTitle.length > 120 || companyName.length > 180) {
    return Response.json({ error: "En eller flera uppgifter är för långa." }, { status: 400 });
  }
  if (["contractor", "subcontractor"].includes(employmentType) && companyName.length < 2) {
    return Response.json({ error: "Företagsnamn krävs för UE och konsulter." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("workers")
    .insert({
      organization_id: context.organizationId,
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      employment_type: employmentType,
      company_name: companyName || null,
      job_title: jobTitle || null,
      active: true,
      gps_enabled: true,
    })
    .select("id,profile_id,full_name,email,phone,employment_type,company_name,job_title,active,gps_enabled,created_at,updated_at")
    .single();

  if (error || !data) {
    return Response.json(
      { error: "Personen kunde inte läggas till." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json(
    { person: { ...data, skills: [], certificates: [], compensation: null } },
    { status: 201 },
  );
}
