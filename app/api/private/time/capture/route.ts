import { createHash } from "node:crypto";

import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const managementRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);
const attachmentKinds = new Set([
  "delivery_note",
  "photo",
  "receipt",
  "other",
]);

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

type JsonObject = Record<string, unknown>;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function decimal(value: unknown, minimum = 0, maximum = 1_000_000_000) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? Math.round(parsed * 10_000) / 10_000
    : null;
}

function date(value: unknown) {
  const normalized = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 200) : [];
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

function normalizeKey(value: unknown) {
  return text(value, 300)
    .toLocaleLowerCase("sv-SE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function firstText(row: JsonObject, keys: string[], maximum: number) {
  for (const key of keys) {
    const value = text(row[key], maximum);
    if (value) return value;
  }
  return "";
}

function firstNumber(row: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = decimal(row[key], 0, 1_000_000_000);
    if (value !== null && row[key] !== null && row[key] !== undefined && row[key] !== "") {
      return value;
    }
  }
  return null;
}

function normalizedLineItems(value: unknown) {
  return array(value)
    .map((raw, index) => {
      const row = object(raw);
      const articleNumber =
        firstText(row, ["articleNumber", "article_number", "sku"], 160) || null;
      const description = firstText(
        row,
        ["description", "name", "articleName"],
        240,
      );
      const quantity = firstNumber(row, ["quantity", "qty"]);
      const unit = firstText(row, ["unit", "unitName"], 24) || "st";
      const unitPriceExVat = firstNumber(row, [
        "unitPriceExVat",
        "unit_price_ex_vat",
      ]);
      const lineTotalExVat = firstNumber(row, [
        "lineTotalExVat",
        "line_total_ex_vat",
      ]);
      const vatRate = firstNumber(row, ["vatRate", "vat_rate"]);
      const calculatedUnitPrice =
        unitPriceExVat ??
        (lineTotalExVat !== null && quantity !== null && quantity > 0
          ? Math.round((lineTotalExVat / quantity) * 10_000) / 10_000
          : 0);
      return {
        include: true,
        lineIndex: index,
        articleNumber,
        description,
        quantity,
        unit,
        unitPriceExVat: calculatedUnitPrice,
        lineTotalExVat,
        vatRate,
      };
    })
    .filter(
      (line) =>
        line.description.length > 0 &&
        line.quantity !== null &&
        line.quantity > 0,
    );
}

function deliveryFingerprint(input: {
  checksum: string;
  supplierName: string | null;
  documentNumber: string | null;
}) {
  const semanticNumber = normalizeKey(input.documentNumber);
  const supplier = normalizeKey(input.supplierName);
  const source = semanticNumber
    ? `delivery-note:${supplier}:${semanticNumber}`
    : `delivery-note-checksum:${input.checksum.toLowerCase()}`;
  return createHash("sha256").update(source, "utf8").digest("hex");
}

async function captureContext(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;

  const [{ data: membership }, { data: worker }] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.current_organization_id)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("workers")
      .select("id,full_name")
      .eq("organization_id", profile.current_organization_id)
      .eq("profile_id", profile.id)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!membership) return null;

  return {
    ...auth,
    organizationId: profile.current_organization_id as string,
    role: membership.role as string,
    worker: worker ?? null,
    canManageTeam: managementRoles.has(membership.role),
  };
}

export async function GET() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await captureContext(auth);
  if (!context) {
    return Response.json(
      { error: "Aktivt företag eller medlemskap saknas." },
      { status: 403 },
    );
  }

  let entriesQuery = context.supabase
    .from("time_entries")
    .select(
      "id,worker_id,project_id,work_type_id,clock_in,clock_out,status,note,source,approved_at,entry_mode,work_date,duration_minutes,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(context.canManageTeam ? 80 : 40);
  if (!context.canManageTeam) {
    if (!context.worker?.id) {
      return Response.json(
        { error: "Din personalprofil behöver kopplas innan tid kan registreras." },
        { status: 409 },
      );
    }
    entriesQuery = entriesQuery.eq("worker_id", context.worker.id);
  }

  const [organization, projects, workTypes, workers, entries, articles] =
    await Promise.all([
      context.supabase
        .from("organizations")
        .select("id,name,timezone")
        .eq("id", context.organizationId)
        .single(),
      context.supabase
        .from("projects")
        .select("id,project_number,name,status,active")
        .eq("organization_id", context.organizationId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(250),
      context.supabase
        .from("work_types")
        .select("id,name,billable,active")
        .eq("organization_id", context.organizationId)
        .eq("active", true)
        .order("name")
        .limit(250),
      context.canManageTeam
        ? context.supabase
            .from("workers")
            .select("id,full_name,job_title,employment_type")
            .eq("organization_id", context.organizationId)
            .eq("active", true)
            .order("full_name")
            .limit(1000)
        : Promise.resolve({
            data: context.worker
              ? [
                  {
                    id: context.worker.id,
                    full_name: context.worker.full_name,
                    job_title: null,
                    employment_type: null,
                  },
                ]
              : [],
            error: null,
          }),
      entriesQuery,
      context.supabase
        .from("organization_articles")
        .select(
          "id,catalog_product_id,supplier_id,supplier_name,article_number,name,unit,status,source_kind,approved_at,updated_at",
        )
        .eq("organization_id", context.organizationId)
        .in("status", ["suggested", "active"])
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

  const failure = [organization, projects, workTypes, workers, entries, articles].find(
    (result) => result.error,
  )?.error;
  if (failure) {
    return Response.json(
      {
        error: missingFeature(failure.code)
          ? "Den nya tidsregistreringen behöver installeras."
          : "Tid, artiklar och underlag kunde inte hämtas.",
        setupRequired: missingFeature(failure.code),
      },
      { status: missingFeature(failure.code) ? 503 : failure.code === "42501" ? 403 : 500 },
    );
  }

  const entryIds = (entries.data ?? []).map((entry) => entry.id);
  const [attachments, analyses, materialItems] = entryIds.length
    ? await Promise.all([
        context.supabase
          .from("time_entry_attachments")
          .select(
            "id,time_entry_id,project_id,document_id,attachment_kind,created_at",
          )
          .eq("organization_id", context.organizationId)
          .in("time_entry_id", entryIds)
          .order("created_at", { ascending: false })
          .limit(500),
        context.supabase
          .from("time_delivery_note_analyses")
          .select(
            "id,time_entry_id,project_id,document_id,supplier_name,document_number,document_date,total_amount,confidence,proposed_lines,reviewed_lines,missing_information,status,duplicate_of_analysis_id,applied_at,created_at,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .in("time_entry_id", entryIds)
          .order("created_at", { ascending: false })
          .limit(250),
        context.supabase
          .from("material_items")
          .select(
            "id,time_entry_id,organization_article_id,project_id,article_number,name,quantity,unit,unit_price,status,source_kind,reconciliation_status,preferred_supplier,created_at,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .in("time_entry_id", entryIds)
          .order("created_at", { ascending: false })
          .limit(750),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const detailFailure = [attachments, analyses, materialItems].find(
    (result) => result.error,
  )?.error;
  if (detailFailure) {
    return Response.json(
      { error: "Tidens artiklar och bilagor kunde inte hämtas." },
      { status: detailFailure.code === "42501" ? 403 : 500 },
    );
  }

  const documentIds = (attachments.data ?? []).map(
    (attachment) => attachment.document_id,
  );
  const documents = documentIds.length
    ? await context.supabase
        .from("bynex_documents")
        .select(
          "id,project_id,title,original_filename,category,mime_type,size_bytes,checksum_sha256,status,uploaded_at,created_at",
        )
        .eq("organization_id", context.organizationId)
        .in("id", documentIds)
    : { data: [], error: null };
  if (documents.error) {
    return Response.json(
      { error: "Bilagorna kunde inte hämtas." },
      { status: documents.error.code === "42501" ? 403 : 500 },
    );
  }

  return Response.json(
    {
      organization: organization.data,
      role: context.role,
      currentWorkerId: context.worker?.id ?? null,
      canManageTeam: context.canManageTeam,
      projects: projects.data ?? [],
      workTypes: workTypes.data ?? [],
      workers: workers.data ?? [],
      entries: entries.data ?? [],
      articles: articles.data ?? [],
      attachments: attachments.data ?? [],
      documents: documents.data ?? [],
      deliveryNoteAnalyses: analyses.data ?? [],
      materialItems: materialItems.data ?? [],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await captureContext(auth);
  if (!context) {
    return Response.json(
      { error: "Aktivt företag eller medlemskap saknas." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const action = text(body?.action, 60);

  if (action === "create_manual_time") {
    const workerId = optionalUuid(body?.workerId);
    const projectId = optionalUuid(body?.projectId);
    const workTypeId = optionalUuid(body?.workTypeId);
    const workDate = date(body?.workDate);
    const hours = integer(body?.hours, 0, 24);
    const minutes = integer(body?.minutes, 0, 59);
    const clientRequestId = body?.clientRequestId;
    if (
      workerId === undefined ||
      projectId === undefined ||
      workTypeId === undefined ||
      !workDate ||
      hours === null ||
      minutes === null ||
      hours * 60 + minutes < 1 ||
      hours * 60 + minutes > 1440 ||
      !isUuid(clientRequestId)
    ) {
      return Response.json(
        { error: "Kontrollera datum, timmar, minuter och valda kopplingar." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc(
      "create_manual_time_entry",
      {
        p_organization_id: context.organizationId,
        p_worker_id: workerId,
        p_project_id: projectId,
        p_work_type_id: workTypeId,
        p_work_date: workDate,
        p_duration_minutes: hours * 60 + minutes,
        p_note: text(body?.note, 2000) || null,
        p_client_request_id: clientRequestId,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Den manuella tiden kunde inte sparas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ timeEntryId: data }, { status: 201 });
  }

  const timeEntryId = body?.timeEntryId;
  if (!isUuid(timeEntryId)) {
    return Response.json(
      { error: "Tidsregistreringen är ogiltig." },
      { status: 400 },
    );
  }

  if (action === "add_article") {
    const quantity = decimal(body?.quantity, 0.001, 1_000_000);
    const unitPrice = decimal(body?.unitPriceExVat, 0, 1_000_000_000);
    const clientRequestId = body?.clientRequestId;
    const name = text(body?.name, 240);
    const unit = text(body?.unit, 24) || "st";
    if (
      !name ||
      quantity === null ||
      unitPrice === null ||
      !isUuid(clientRequestId)
    ) {
      return Response.json(
        { error: "Kontrollera artikel, mängd, enhet och pris." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc(
      "add_time_entry_article",
      {
        p_organization_id: context.organizationId,
        p_time_entry_id: timeEntryId,
        p_article_number: text(body?.articleNumber, 160) || null,
        p_name: name,
        p_quantity: quantity,
        p_unit: unit,
        p_unit_price_ex_vat: unitPrice,
        p_supplier_name: text(body?.supplierName, 240) || null,
        p_client_request_id: clientRequestId,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Artikeln kunde inte läggas till." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ materialItemId: data }, { status: 201 });
  }

  if (action === "link_attachment") {
    const documentId = body?.documentId;
    const attachmentKind = text(body?.attachmentKind, 30);
    if (!isUuid(documentId) || !attachmentKinds.has(attachmentKind)) {
      return Response.json(
        { error: "Bilagan eller bilagetypen är ogiltig." },
        { status: 400 },
      );
    }
    const { data, error } = await context.supabase.rpc(
      "link_time_entry_attachment",
      {
        p_organization_id: context.organizationId,
        p_time_entry_id: timeEntryId,
        p_document_id: documentId,
        p_attachment_kind: attachmentKind,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Bilagan kunde inte kopplas till tiden." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ attachmentId: data }, { status: 201 });
  }

  if (action === "prepare_delivery_note") {
    const documentId = body?.documentId;
    if (!isUuid(documentId)) {
      return Response.json({ error: "Följesedeln är ogiltig." }, { status: 400 });
    }

    const [{ data: attachment }, { data: document }, { data: analysis }] =
      await Promise.all([
        context.supabase
          .from("time_entry_attachments")
          .select("id,project_id,attachment_kind")
          .eq("organization_id", context.organizationId)
          .eq("time_entry_id", timeEntryId)
          .eq("document_id", documentId)
          .maybeSingle(),
        context.supabase
          .from("bynex_documents")
          .select(
            "id,category,project_id,checksum_sha256,status,original_filename",
          )
          .eq("organization_id", context.organizationId)
          .eq("id", documentId)
          .maybeSingle(),
        context.supabase
          .from("bynex_document_analyses")
          .select(
            "document_kind,counterparty_name,document_number,document_date,total_amount,confidence,line_items,missing_information,analysis_status",
          )
          .eq("organization_id", context.organizationId)
          .eq("document_id", documentId)
          .maybeSingle(),
      ]);
    if (
      !attachment ||
      attachment.attachment_kind !== "delivery_note" ||
      !document ||
      !analysis
    ) {
      return Response.json(
        {
          error:
            "Följesedeln behöver vara uppladdad, analyserad och kopplad till tiden.",
        },
        { status: 409 },
      );
    }

    const lines = normalizedLineItems(analysis.line_items);
    const fingerprint = deliveryFingerprint({
      checksum: document.checksum_sha256,
      supplierName: analysis.counterparty_name,
      documentNumber: analysis.document_number,
    });

    const { data, error } = await context.supabase.rpc(
      "register_time_delivery_note_analysis",
      {
        p_organization_id: context.organizationId,
        p_time_entry_id: timeEntryId,
        p_document_id: documentId,
        p_supplier_name: analysis.counterparty_name,
        p_document_number: analysis.document_number,
        p_document_date: analysis.document_date,
        p_total_amount: analysis.total_amount,
        p_confidence: Number(analysis.confidence) || 0,
        p_proposed_lines: lines,
        p_missing_information: array(analysis.missing_information),
        p_content_fingerprint: fingerprint,
      },
    );
    if (error || !data) {
      return Response.json(
        {
          error:
            error?.message || "Följesedelsförslaget kunde inte förberedas.",
        },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json(
      { deliveryNoteAnalysisId: data, proposedLines: lines },
      { status: 201 },
    );
  }

  if (action === "apply_delivery_note") {
    const analysisId = body?.analysisId;
    const reviewedLines = array(body?.reviewedLines);
    if (!isUuid(analysisId) || reviewedLines.length < 1) {
      return Response.json(
        { error: "Kontrollera minst en artikelrad." },
        { status: 400 },
      );
    }
    const { data, error } = await context.supabase.rpc(
      "apply_time_delivery_note_analysis",
      {
        p_organization_id: context.organizationId,
        p_analysis_id: analysisId,
        p_reviewed_lines: reviewedLines,
      },
    );
    if (error || !data) {
      return Response.json(
        {
          error:
            error?.message || "Följesedelns artiklar kunde inte registreras.",
        },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ result: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
