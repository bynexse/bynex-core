import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const roles = new Set(["owner", "admin", "office", "manager"]);
const priceTypes = new Set(["fixed", "estimated", "running_account"]);

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function optionalAmount(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return amount(value);
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? undefined
    : normalized;
}

function textList(value: unknown, maximumItems = 30, maximumLength = 500) {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maximumItems)
    .map((item) => item.slice(0, maximumLength));
}

async function context() {
  const auth = await requireSupabaseUser("change_orders");
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

  const { data: member, error: memberError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (memberError || !member || !roles.has(member.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Behörighet saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
  };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;

  const body = await readJsonObject(request);
  if (body?.action !== "prepare_and_link") {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }

  const changeOrderId = body?.changeOrderId;
  if (!isUuid(changeOrderId)) {
    return Response.json({ error: "ÄTA:n är ogiltig." }, { status: 400 });
  }

  const { data: changeOrder, error: changeOrderError } = await ctx.supabase
    .from("change_orders")
    .select("id,title,description,status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", changeOrderId)
    .maybeSingle();
  if (changeOrderError) {
    return Response.json({ error: "ÄTA:n kunde inte verifieras." }, { status: 500 });
  }
  if (!changeOrder) {
    return Response.json({ error: "ÄTA:n finns inte i företaget." }, { status: 404 });
  }
  if (changeOrder.status !== "draft") {
    return Response.json({ error: "Nytt prisunderlag kan bara skapas för ett utkast." }, { status: 409 });
  }

  const customerDescription = text(body?.customerDescription, 4000) ?? changeOrder.description;
  const priceType = text(body?.priceType, 30);
  const laborHours = amount(body?.laborHours);
  const laborSell = amount(body?.laborSell);
  const materialSell = amount(body?.materialSell);
  const equipmentSell = amount(body?.equipmentSell);
  const subcontractorSell = amount(body?.subcontractorSell);
  const otherSell = amount(body?.otherSell);
  const vatPercent = amount(body?.vatPercent ?? 25);
  const estimatedWorkingDays = optionalAmount(body?.estimatedWorkingDays);
  const proposedStartDate = dateValue(body?.proposedStartDate);
  const proposedEndDate = dateValue(body?.proposedEndDate);
  const assumptions = textList(body?.assumptions);
  const exclusions = textList(body?.exclusions);
  const priceDisclaimer = text(body?.priceDisclaimer, 1000);
  const validDays = Math.trunc(Number(body?.validDays ?? 14));

  const requiredNumbers = [
    laborHours,
    laborSell,
    materialSell,
    equipmentSell,
    subcontractorSell,
    otherSell,
    vatPercent,
  ];
  if (
    !customerDescription
    || !priceType
    || !priceTypes.has(priceType)
    || requiredNumbers.some((value) => value === null)
    || Number(vatPercent) > 100
    || estimatedWorkingDays === null && typeof body?.estimatedWorkingDays === "string" && Boolean(body.estimatedWorkingDays.trim())
    || estimatedWorkingDays !== null && estimatedWorkingDays > 10_000
    || proposedStartDate === undefined
    || proposedEndDate === undefined
  ) {
    return Response.json({ error: "Prisunderlaget innehåller ogiltiga uppgifter." }, { status: 400 });
  }

  const total = Number(laborSell)
    + Number(materialSell)
    + Number(equipmentSell)
    + Number(subcontractorSell)
    + Number(otherSell);
  if (total <= 0) {
    return Response.json({ error: "Prisunderlaget måste ha ett belopp." }, { status: 400 });
  }
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
    return Response.json({ error: "Giltighetstiden måste vara 1–30 dagar." }, { status: 400 });
  }
  if (proposedStartDate && proposedEndDate && proposedEndDate < proposedStartDate) {
    return Response.json({ error: "Föreslaget slutdatum kan inte ligga före startdatum." }, { status: 400 });
  }
  if (priceType !== "fixed" && !priceDisclaimer) {
    return Response.json({ error: "Uppskattat pris och löpande räkning måste ha en tydlig prisinformation." }, { status: 400 });
  }

  const { data: latest, error: latestError } = await ctx.supabase
    .from("change_order_versions")
    .select("version_number")
    .eq("organization_id", ctx.organizationId)
    .eq("change_order_id", changeOrderId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    return Response.json({ error: "Senaste ÄTA-versionen kunde inte kontrolleras." }, { status: 500 });
  }

  const { data: version, error: versionError } = await ctx.supabase
    .from("change_order_versions")
    .insert({
      organization_id: ctx.organizationId,
      change_order_id: changeOrderId,
      version_number: (latest?.version_number ?? 0) + 1,
      status: "draft",
      title: changeOrder.title,
      customer_description: customerDescription,
      currency: "SEK",
      vat_percent: vatPercent,
      labor_hours: laborHours,
      labor_sell: laborSell,
      material_sell: materialSell,
      equipment_sell: equipmentSell,
      subcontractor_sell: subcontractorSell,
      other_sell: otherSell,
      estimated_working_days: estimatedWorkingDays,
      proposed_start_date: proposedStartDate,
      proposed_end_date: proposedEndDate,
      assumptions,
      exclusions,
      price_type: priceType,
      requires_human_review: true,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();
  if (versionError || !version) {
    return Response.json(
      { error: "Prisversionen kunde inte skapas." },
      { status: versionError?.code === "42501" ? 403 : 409 },
    );
  }

  const lines: Array<Record<string, unknown>> = [];
  let sortOrder = 10;
  const addLine = (
    category: "labor" | "material" | "equipment" | "subcontractor" | "other",
    description: string,
    sellAmount: number,
    quantity = 1,
    unit = "summa",
  ) => {
    if (sellAmount <= 0) return;
    const safeQuantity = quantity > 0 ? quantity : 1;
    lines.push({
      organization_id: ctx.organizationId,
      change_order_version_id: version.id,
      category,
      description,
      quantity: safeQuantity,
      unit,
      unit_cost: Math.round((sellAmount / safeQuantity) * 100) / 100,
      markup_percent: 0,
      source: "manual",
      source_reference: "Mänskligt granskad kalkyl i Bynex ÄTA",
      sort_order: sortOrder,
    });
    sortOrder += 10;
  };

  addLine(
    "labor",
    Number(laborHours) > 0 ? `Arbete, ${Number(laborHours)} timmar` : "Arbete",
    Number(laborSell),
    Number(laborHours) > 0 ? Number(laborHours) : 1,
    Number(laborHours) > 0 ? "tim" : "summa",
  );
  addLine("material", "Material", Number(materialSell));
  addLine("equipment", "Maskiner och utrustning", Number(equipmentSell));
  addLine("subcontractor", "Underentreprenör", Number(subcontractorSell));
  addLine("other", "Övrigt", Number(otherSell));

  if (lines.length > 0) {
    const { error: lineError } = await ctx.supabase.from("change_order_line_items").insert(lines);
    if (lineError) {
      await ctx.supabase
        .from("change_order_versions")
        .delete()
        .eq("organization_id", ctx.organizationId)
        .eq("id", version.id);
      return Response.json({ error: "Kalkylraderna kunde inte sparas." }, { status: 409 });
    }
  }

  const reviewed = await ctx.supabase.rpc("review_change_order_version", {
    p_organization_id: ctx.organizationId,
    p_version_id: version.id,
    p_price_type: priceType,
    p_price_disclaimer: priceType === "fixed" ? priceDisclaimer : priceDisclaimer,
  });
  if (reviewed.error) {
    await ctx.supabase
      .from("change_order_versions")
      .delete()
      .eq("organization_id", ctx.organizationId)
      .eq("id", version.id);
    return Response.json(
      { error: "Prisversionen kunde inte markeras som mänskligt granskad." },
      { status: reviewed.error.code === "42501" ? 403 : 409 },
    );
  }

  const { data, error } = await ctx.supabase.rpc("create_change_order_customer_link", {
    p_organization_id: ctx.organizationId,
    p_change_order_id: changeOrderId,
    p_version_id: version.id,
    p_valid_days: validDays,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.approval_url) {
    return Response.json(
      {
        error: "Underlaget är granskat men kundlänken kunde inte skapas. Försök igen från ÄTA:n.",
        versionId: version.id,
      },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json(
    {
      approvalUrl: row.approval_url,
      contentHash: row.content_hash,
      versionId: version.id,
    },
    { status: 201 },
  );
}
