import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const platformRoles = new Set([
  "platform_owner",
  "platform_admin",
  "sales",
  "finance",
  "support",
  "read_only",
]);

const managementRoles = new Set([
  "platform_owner",
  "platform_admin",
  "sales",
  "support",
]);

const pricingManagementRoles = new Set([
  "platform_owner",
  "platform_admin",
  "finance",
]);

const employmentTypes = new Set([
  "employee",
  "contractor",
  "subcontractor",
  "temporary",
]);

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  if (code === "23505") return 409;
  return 409;
}

function stringValue(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function requiredNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function requirePlatformContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth;

  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (error || !staff || !platformRoles.has(staff.role)) {
    return {
      response: Response.json(
        { error: "Bynex internbehörighet krävs." },
        { status: 403 },
      ),
    } as const;
  }

  return { ...auth, staff } as const;
}

export async function GET(request: Request) {
  const auth = await requirePlatformContext();
  if ("response" in auth) return auth.response;

  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  if (!isUuid(organizationId)) {
    return Response.json({ error: "Välj ett giltigt kundföretag." }, { status: 400 });
  }

  const [assistanceResult, laborPricingResult] = await Promise.all([
    auth.supabase.rpc("get_platform_customer_assistance", {
      p_organization_id: organizationId,
    }),
    auth.supabase.rpc("get_platform_customer_labor_profitability", {
      p_organization_id: organizationId,
    }),
  ]);

  const error = assistanceResult.error ?? laborPricingResult.error;
  if (error) {
    return Response.json(
      { error: error.message || "Kundkortet kunde inte hämtas." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({
    data: {
      ...objectValue(assistanceResult.data),
      labor_pricing: objectValue(laborPricingResult.data),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformContext();
  if ("response" in auth) return auth.response;
  if (!managementRoles.has(auth.staff.role)) {
    return Response.json(
      { error: "Din HQ-roll får inte ändra kundens personalregister." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  if (!body || body.action !== "create_worker") {
    return Response.json({ error: "Ogiltig kundåtgärd." }, { status: 400 });
  }

  const organizationId = stringValue(body.organizationId, 36);
  const fullName = stringValue(body.fullName, 160);
  const email = stringValue(body.email, 254);
  const phone = stringValue(body.phone, 40);
  const jobTitle = stringValue(body.jobTitle, 120);
  const employmentType = stringValue(body.employmentType, 40) || "employee";
  const companyName = stringValue(body.companyName, 180);
  const authorizationReference = stringValue(body.authorizationReference, 500);

  if (
    !isUuid(organizationId) ||
    fullName.length < 2 ||
    !employmentTypes.has(employmentType) ||
    authorizationReference.length < 5
  ) {
    return Response.json(
      { error: "Kontrollera kund, namn, anställningsform och beställningsreferens." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_add_customer_worker",
    {
      p_organization_id: organizationId,
      p_full_name: fullName,
      p_email: email || null,
      p_phone: phone || null,
      p_job_title: jobTitle || null,
      p_employment_type: employmentType,
      p_company_name: companyName || null,
      p_customer_authorization_reference: authorizationReference,
    },
  );

  if (error) {
    return Response.json(
      { error: error.message || "Personen kunde inte läggas till hos kunden." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformContext();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Ogiltig kundåtgärd." }, { status: 400 });
  }

  if (body.action === "update_labor_pricing") {
    if (!pricingManagementRoles.has(auth.staff.role)) {
      return Response.json(
        {
          error:
            "Ägare, administration eller ekonomi krävs för att registrera företagets timpris.",
        },
        { status: 403 },
      );
    }

    const organizationId = stringValue(body.organizationId, 36);
    const pricingMode = stringValue(body.pricingMode, 40) || "company_standard";
    const authorizationReference = stringValue(body.authorizationReference, 500);
    if (!isUuid(organizationId) || authorizationReference.length < 5) {
      return Response.json(
        { error: "Kontrollera kund och kundens beställningsreferens." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "platform_set_customer_labor_pricing",
      {
        p_organization_id: organizationId,
        p_pricing_mode: pricingMode,
        p_company_hourly_rate_ex_vat: optionalNumber(body.companyHourlyRateExVat),
        p_target_margin_percent: requiredNumber(body.targetMarginPercent, 12.5),
        p_billable_utilization_percent: requiredNumber(
          body.billableUtilizationPercent,
          75,
        ),
        p_employer_cost_percent: optionalNumber(body.employerCostPercent),
        p_vacation_supplement_percent: requiredNumber(
          body.vacationSupplementPercent,
          0,
        ),
        p_annual_overhead_per_worker: requiredNumber(
          body.annualOverheadPerWorker,
          0,
        ),
        p_rounding_step: requiredNumber(body.roundingStep, 10),
        p_customer_authorization_reference: authorizationReference,
      },
    );

    if (error) {
      return Response.json(
        { error: error.message || "Företagets timpris kunde inte sparas." },
        { status: statusFor(error.code) },
      );
    }

    return Response.json({ data });
  }

  if (body.action !== "update_worker") {
    return Response.json({ error: "Ogiltig kundåtgärd." }, { status: 400 });
  }
  if (!managementRoles.has(auth.staff.role)) {
    return Response.json(
      { error: "Din HQ-roll får inte ändra kundens personalregister." },
      { status: 403 },
    );
  }

  const organizationId = stringValue(body.organizationId, 36);
  const workerId = stringValue(body.workerId, 36);
  const fullName = stringValue(body.fullName, 160);
  const email = stringValue(body.email, 254);
  const phone = stringValue(body.phone, 40);
  const jobTitle = stringValue(body.jobTitle, 120);
  const employmentType = stringValue(body.employmentType, 40) || "employee";
  const companyName = stringValue(body.companyName, 180);
  const authorizationReference = stringValue(body.authorizationReference, 500);
  const active = body.active !== false;

  if (
    !isUuid(organizationId) ||
    !isUuid(workerId) ||
    fullName.length < 2 ||
    !employmentTypes.has(employmentType) ||
    authorizationReference.length < 5
  ) {
    return Response.json(
      { error: "Kontrollera personuppgifter och beställningsreferens." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_update_customer_worker",
    {
      p_organization_id: organizationId,
      p_worker_id: workerId,
      p_full_name: fullName,
      p_email: email || null,
      p_phone: phone || null,
      p_job_title: jobTitle || null,
      p_employment_type: employmentType,
      p_company_name: companyName || null,
      p_active: active,
      p_customer_authorization_reference: authorizationReference,
    },
  );

  if (error) {
    return Response.json(
      { error: error.message || "Personen kunde inte uppdateras." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({ data });
}
