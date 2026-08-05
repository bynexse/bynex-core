import { requireSupabaseUser } from "@/lib/supabase/require-user";

const platformRoles = new Set([
  "platform_owner",
  "platform_admin",
  "support",
  "finance",
  "read_only",
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is JsonRecord => item !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: staff, error: staffError } = await auth.supabase
    .from("platform_staff")
    .select("role,active,granted_at,last_reviewed_at")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (staffError || !staff || !platformRoles.has(staff.role)) {
    return Response.json(
      { error: "Bynex internbehörighet krävs." },
      { status: 403 },
    );
  }

  // The RPC performs its own platform-role check and records this read in
  // platform_admin_audit_events. Tenant tables are never queried directly here.
  const canReadDetailedSupport = staff.role !== "finance";
  const [overviewResult, supportResult] = await Promise.all([
    auth.supabase.rpc("get_platform_admin_overview"),
    canReadDetailedSupport
      ? auth.supabase.rpc("get_platform_support_cases")
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data, error } = overviewResult;
  const overview = asRecord(data);
  const metrics = asRecord(overview?.metrics);

  if (error || !overview || !metrics) {
    return Response.json(
      { error: "HQ:s driftunderlag kunde inte hämtas." },
      { status: 500 },
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const trialCutoff = new Date(now);
  trialCutoff.setUTCDate(trialCutoff.getUTCDate() + 30);

  const hasDetailedSupport = !supportResult.error && supportResult.data !== null;
  const supportSource = asRecords(
    hasDetailedSupport ? supportResult.data : overview.support_cases,
  );
  const supportBreaches = supportSource
    .filter((supportCase) => {
      const status = text(supportCase.status);
      if (status === "resolved" || status === "closed") return false;
      const firstResponseDue = validDate(supportCase.first_response_due_at);
      const resolutionDue = validDate(supportCase.resolution_due_at);
      return Boolean(
        (hasDetailedSupport &&
          firstResponseDue &&
          !text(supportCase.first_responded_at) &&
          firstResponseDue < now) ||
          (resolutionDue && resolutionDue < now),
      );
    })
    .slice(0, 20)
    .map((supportCase) => ({
      id: text(supportCase.id),
      organizationName: text(supportCase.organization_name) ?? "Okänt företag",
      subject: text(supportCase.subject) ?? "Ärende utan rubrik",
      priority: text(supportCase.priority) ?? "normal",
      status: text(supportCase.status) ?? "new",
      firstResponseDueAt: text(supportCase.first_response_due_at),
      resolutionDueAt: text(supportCase.resolution_due_at),
    }));

  const overdueInvoices = asRecords(overview.subscription_invoices)
    .filter((invoice) => {
      const dueDate = text(invoice.due_date);
      const status = text(invoice.status);
      return Boolean(
        dueDate &&
          dueDate < today &&
          number(invoice.amount_paid) < number(invoice.amount_inc_vat) &&
          status !== "paid" &&
          status !== "void" &&
          status !== "cancelled",
      );
    })
    .slice(0, 20)
    .map((invoice) => ({
      id: text(invoice.id),
      organizationName: text(invoice.organization_name) ?? "Okänt företag",
      invoiceNumber: text(invoice.invoice_number) ?? "Nummer saknas",
      dueDate: text(invoice.due_date),
      currency: text(invoice.currency) ?? "SEK",
      outstanding: Math.max(
        number(invoice.amount_inc_vat) - number(invoice.amount_paid),
        0,
      ),
    }));

  const expiringTrials = asRecords(overview.organizations)
    .filter((organization) => {
      if (text(organization.subscription_status) !== "trialing") return false;
      const trialEndsAt = validDate(organization.trial_ends_at);
      return Boolean(trialEndsAt && trialEndsAt >= now && trialEndsAt <= trialCutoff);
    })
    .slice(0, 20)
    .map((organization) => ({
      id: text(organization.id),
      name: text(organization.name) ?? "Namnlöst företag",
      planName: text(organization.plan_name),
      trialEndsAt: text(organization.trial_ends_at),
      memberCount: number(organization.member_count),
    }));

  const onboardingGaps = asRecords(overview.organizations)
    .filter(
      (organization) =>
        text(organization.status) === "active" &&
        (!text(organization.organization_number) ||
          !text(organization.subscription_status) ||
          number(organization.member_count) === 0),
    )
    .slice(0, 20)
    .map((organization) => ({
      id: text(organization.id),
      name: text(organization.name) ?? "Namnlöst företag",
      missingOrganizationNumber: !text(organization.organization_number),
      missingSubscription: !text(organization.subscription_status),
      missingMembers: number(organization.member_count) === 0,
    }));

  return Response.json(
    {
      role: staff.role,
      generatedAt: now.toISOString(),
      access: {
        grantedAt: staff.granted_at,
        lastReviewedAt: staff.last_reviewed_at,
      },
      metrics: {
        overdueSubscriptionInvoices: number(
          metrics.overdue_subscription_invoices,
        ),
        subscriptionOutstanding: number(metrics.subscription_outstanding),
        openSupportCases: number(metrics.open_support_cases),
        urgentSupportCases: number(metrics.urgent_support_cases),
      },
      attention: {
        supportBreaches,
        overdueInvoices,
        expiringTrials,
        onboardingGaps,
      },
      coverage: {
        organizations: "latest_100",
        subscriptionInvoices: "latest_200",
        supportCases: "latest_200",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
