import { isUuid, readJsonObject } from "@/lib/http/validation";
import {
  buildPropertyMaintenanceSuggestions,
  type BinderPropertyType,
  type MaintenanceSuggestion,
} from "@/lib/ai/property-maintenance-plan";
import { analyzePropertyMaintenanceImages } from "@/lib/ai/property-maintenance-image";
import {
  personalBinderContext,
  type PersonalBinderContext,
} from "@/lib/personal-binder/context";

const documentCategories = new Set([
  "purchase_contract",
  "deed",
  "association_document",
  "inspection",
  "drawing",
  "permit",
  "energy_declaration",
  "insurance",
  "warranty",
  "manual",
  "receipt",
  "expense",
  "craftsman_document",
  "maintenance",
  "property_photo",
  "inventory",
  "tax_document",
  "other",
]);
const documentSources = new Set([
  "owner",
  "craftsman",
  "project_handover",
  "bynex_smart",
  "import",
]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maintenanceCategories = new Set([
  "roof",
  "facade",
  "windows",
  "foundation",
  "drainage",
  "ground",
  "heating",
  "ventilation",
  "electrical",
  "plumbing",
  "bathroom",
  "kitchen",
  "interior",
  "fire_safety",
  "appliance",
  "association",
  "documentation",
  "other",
]);
const priorities = new Set(["low", "normal", "high", "critical"]);
const propertyTypes = new Set<BinderPropertyType>([
  "single_family",
  "condominium",
  "holiday_home",
  "land",
]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum: number) {
  const result = text(value, maximum);
  return result || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function dateOrNull(value: unknown) {
  const result = text(value, 10);
  if (!result) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : undefined;
}

function safeFilename(value: unknown) {
  const original = text(value, 300).normalize("NFC");
  if (!original) return "";
  const normalized = original
    .replace(/[\\/\0\r\n\t]/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return normalized && normalized !== "." && normalized !== ".."
    ? normalized
    : "dokument";
}

function addMonths(months: number) {
  const result = new Date();
  result.setUTCHours(12, 0, 0, 0);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString().slice(0, 10);
}

async function loadWorkspace(context: PersonalBinderContext) {
  const [documents, maintenance] = await Promise.all([
    context.supabase
      .from("property_binder_documents")
      .select(
        "id,title,category,source_type,status,original_filename,mime_type,file_size_bytes,document_date,vendor_name,amount_inc_vat,warranty_expires_on,notes,checksum_sha256,created_at,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("property_id", context.propertyId)
      .neq("status", "archived")
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    context.supabase
      .from("property_maintenance_items")
      .select(
        "id,title,category,description,status,priority,due_on,recurrence_months,estimated_cost_low,estimated_cost_high,source_type,source_document_id,smart_reason,requires_review,reviewed_at,completed_at,created_at,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("property_id", context.propertyId)
      .order("status")
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .limit(1000),
  ]);

  const failure = documents.error ?? maintenance.error;
  if (failure) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Pärmens dokument och underhåll kunde inte hämtas." },
        { status: failure.code === "42501" ? 403 : 500 },
      ),
    };
  }

  const includedUntil = context.subscription.included_access_until;
  const daysRemaining = includedUntil
    ? Math.max(
        0,
        Math.ceil(
          (new Date(includedUntil).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : null;

  return {
    ok: true as const,
    payload: {
      organization: {
        id: context.organization.id,
        name: context.organization.name,
      },
      property: context.property,
      subscription: {
        ...context.subscription,
        daysRemaining,
        trial:
          context.subscription.status === "pending_activation" &&
          includedUntil !== null,
      },
      documents: documents.data ?? [],
      maintenance: maintenance.data ?? [],
      capabilities: {
        smartImageAnalysis: Boolean(process.env.OPENAI_API_KEY?.trim()),
        maximumUploadBytes: 26_214_400,
      },
      serverNow: new Date().toISOString(),
    },
  };
}

export async function GET() {
  const context = await personalBinderContext();
  if (!context.ok) return context.response;
  const workspace = await loadWorkspace(context);
  return workspace.ok ? Response.json(workspace.payload) : workspace.response;
}

async function prepareUpload(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const title = text(body.title, 240);
  const category = text(body.category, 60);
  const sourceType = text(body.sourceType, 40) || "owner";
  const filename = safeFilename(body.fileName);
  const mimeType = text(body.mimeType, 160).toLowerCase();
  const fileSize = Math.trunc(Number(body.fileSize));
  const documentDate = dateOrNull(body.documentDate);
  const warrantyExpiresOn = dateOrNull(body.warrantyExpiresOn);
  const amountIncVat = numberOrNull(body.amountIncVat);

  if (
    title.length < 2 ||
    !documentCategories.has(category) ||
    !documentSources.has(sourceType) ||
    !filename ||
    !allowedMimeTypes.has(mimeType) ||
    !Number.isInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > 26_214_400 ||
    documentDate === undefined ||
    warrantyExpiresOn === undefined ||
    Number.isNaN(amountIncVat) ||
    (amountIncVat !== null && amountIncVat < 0)
  ) {
    return Response.json(
      {
        error:
          "Kontrollera dokumentnamn, kategori, datum, filtyp och att filen är högst 25 MB.",
      },
      { status: 400 },
    );
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${context.organizationId}/${context.propertyId}/${documentId}/${filename}`;
  const { error: rowError } = await context.supabase
    .from("property_binder_documents")
    .insert({
      id: documentId,
      organization_id: context.organizationId,
      property_id: context.propertyId,
      title,
      category,
      source_type: sourceType,
      status: "pending_upload",
      original_filename: filename,
      storage_bucket: "property-binder-documents",
      storage_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      document_date: documentDate,
      vendor_name: optionalText(body.vendorName, 200),
      amount_inc_vat: amountIncVat,
      warranty_expires_on: warrantyExpiresOn,
      notes: optionalText(body.notes, 4000),
      uploaded_by_user_id: context.userId,
    });

  if (rowError) {
    return Response.json(
      { error: "Dokumentposten kunde inte förberedas." },
      { status: rowError.code === "42501" ? 403 : 409 },
    );
  }

  const { data: signedUpload, error: uploadError } = await context.supabase.storage
    .from("property-binder-documents")
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (uploadError || !signedUpload?.token) {
    await context.supabase
      .from("property_binder_documents")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("id", documentId)
      .eq("status", "pending_upload");
    return Response.json(
      { error: "Den säkra uppladdningen kunde inte startas." },
      { status: uploadError?.message.includes("row-level") ? 403 : 409 },
    );
  }

  return Response.json(
    {
      documentId,
      bucket: "property-binder-documents",
      path: signedUpload.path ?? storagePath,
      token: signedUpload.token,
      filename,
    },
    { status: 201 },
  );
}

async function confirmUpload(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const documentId = body.documentId;
  const checksum = text(body.checksumSha256, 64).toLowerCase();
  if (!isUuid(documentId) || (checksum && !/^[0-9a-f]{64}$/.test(checksum))) {
    return Response.json({ error: "Dokumentbekräftelsen är ogiltig." }, { status: 400 });
  }

  const { data: document, error: documentError } = await context.supabase
    .from("property_binder_documents")
    .select("id,storage_path,status")
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .eq("id", documentId)
    .maybeSingle();

  if (documentError || !document || document.status !== "pending_upload") {
    return Response.json(
      { error: "Den förberedda dokumentposten hittades inte." },
      { status: documentError ? 409 : 404 },
    );
  }

  const verified = await context.supabase.storage
    .from("property-binder-documents")
    .createSignedUrl(document.storage_path, 60);
  if (verified.error || !verified.data?.signedUrl) {
    return Response.json(
      { error: "Filen hittades inte i den säkra lagringen. Ladda upp den igen." },
      { status: 409 },
    );
  }

  const { data, error } = await context.supabase
    .from("property_binder_documents")
    .update({
      status: "active",
      checksum_sha256: checksum || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .eq("id", documentId)
    .eq("status", "pending_upload")
    .select("id,status")
    .maybeSingle();

  if (error || !data) {
    return Response.json(
      { error: "Dokumentet laddades upp men kunde inte aktiveras." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json({ document: data });
}

async function downloadDocument(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const documentId = body.documentId;
  if (!isUuid(documentId)) {
    return Response.json({ error: "Dokumentet är ogiltigt." }, { status: 400 });
  }

  const { data: document, error } = await context.supabase
    .from("property_binder_documents")
    .select("storage_path,original_filename")
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .eq("id", documentId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !document) {
    return Response.json(
      { error: "Dokumentet kunde inte hittas." },
      { status: error?.code === "42501" ? 403 : 404 },
    );
  }

  const signed = await context.supabase.storage
    .from("property-binder-documents")
    .createSignedUrl(document.storage_path, 300, {
      download: document.original_filename,
    });
  if (signed.error || !signed.data?.signedUrl) {
    return Response.json(
      { error: "Dokumentet kunde inte öppnas med din behörighet." },
      { status: 403 },
    );
  }

  return Response.json({ url: signed.data.signedUrl, expiresInSeconds: 300 });
}

async function archiveDocument(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const documentId = body.documentId;
  if (!isUuid(documentId)) {
    return Response.json({ error: "Dokumentet är ogiltigt." }, { status: 400 });
  }
  const { data, error } = await context.supabase
    .from("property_binder_documents")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .eq("id", documentId)
    .neq("status", "archived")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return Response.json(
      { error: "Dokumentet kunde inte arkiveras." },
      { status: error?.code === "42501" ? 403 : 404 },
    );
  }
  return Response.json({ archivedId: data.id });
}

async function createMaintenance(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const title = text(body.title, 240);
  const category = text(body.category, 40);
  const priority = text(body.priority, 20) || "normal";
  const dueOn = dateOrNull(body.dueOn);
  const recurrenceMonths = numberOrNull(body.recurrenceMonths);
  const costLow = numberOrNull(body.estimatedCostLow);
  const costHigh = numberOrNull(body.estimatedCostHigh);

  if (
    title.length < 2 ||
    !maintenanceCategories.has(category) ||
    !priorities.has(priority) ||
    dueOn === undefined ||
    Number.isNaN(recurrenceMonths) ||
    Number.isNaN(costLow) ||
    Number.isNaN(costHigh) ||
    (recurrenceMonths !== null &&
      (!Number.isInteger(recurrenceMonths) || recurrenceMonths < 1 || recurrenceMonths > 1200)) ||
    (costLow !== null && costLow < 0) ||
    (costHigh !== null && (costHigh < 0 || costHigh < (costLow ?? 0)))
  ) {
    return Response.json(
      { error: "Kontrollera underhållspostens rubrik, kategori, datum och kostnad." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("property_maintenance_items")
    .insert({
      organization_id: context.organizationId,
      property_id: context.propertyId,
      title,
      category,
      description: optionalText(body.description, 6000),
      status: dueOn && dueOn <= new Date().toISOString().slice(0, 10) ? "due" : "planned",
      priority,
      due_on: dueOn,
      recurrence_months: recurrenceMonths,
      estimated_cost_low: costLow,
      estimated_cost_high: costHigh,
      source_type: "manual",
      requires_review: false,
      created_by_user_id: context.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return Response.json(
      { error: "Underhållsposten kunde inte sparas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json({ maintenanceId: data.id }, { status: 201 });
}

type StoredSuggestion = MaintenanceSuggestion & {
  sourceDocumentId: string | null;
  imageBased: boolean;
};

async function createSmartPlan(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const propertyType = context.property.property_type as BinderPropertyType;
  if (!propertyTypes.has(propertyType)) {
    return Response.json(
      { error: "Fastighetstypen stöds inte av Pärmens Smart-plan ännu." },
      { status: 409 },
    );
  }

  const propertyNotes = text(body.propertyNotes, 4000);
  const measurements = text(body.measurements, 2000);
  const baseSuggestions = buildPropertyMaintenanceSuggestions({
    propertyType,
    constructionYear: context.property.construction_year,
    livingAreaSqm:
      context.property.living_area_sqm === null
        ? null
        : Number(context.property.living_area_sqm),
    plotAreaSqm:
      context.property.plot_area_sqm === null
        ? null
        : Number(context.property.plot_area_sqm),
    notes: propertyNotes,
  }).map<StoredSuggestion>((suggestion) => ({
    ...suggestion,
    sourceDocumentId: null,
    imageBased: false,
  }));

  let imageSuggestions: StoredSuggestion[] = [];
  const requestedPhotoIds = Array.isArray(body.photoDocumentIds)
    ? body.photoDocumentIds
        .filter((value): value is string => typeof value === "string" && isUuid(value))
        .slice(0, 3)
    : [];

  if (requestedPhotoIds.length > 0 && body.consentToAnalyzeImages === true) {
    const { data: photos, error: photoError } = await context.supabase
      .from("property_binder_documents")
      .select("id,storage_path,mime_type")
      .eq("organization_id", context.organizationId)
      .eq("property_id", context.propertyId)
      .eq("status", "active")
      .in("id", requestedPhotoIds);

    if (photoError) {
      return Response.json(
        { error: "De valda bilderna kunde inte kontrolleras." },
        { status: photoError.code === "42501" ? 403 : 409 },
      );
    }

    const validPhotos = (photos ?? []).filter((photo) =>
      imageMimeTypes.has(photo.mime_type),
    );
    const signedUrls: Array<{ id: string; url: string }> = [];
    for (const photo of validPhotos) {
      const signed = await context.supabase.storage
        .from("property-binder-documents")
        .createSignedUrl(photo.storage_path, 300);
      if (signed.data?.signedUrl) {
        signedUrls.push({ id: photo.id, url: signed.data.signedUrl });
      }
    }

    const analyzed = await analyzePropertyMaintenanceImages({
      propertyType,
      constructionYear: context.property.construction_year,
      livingAreaSqm:
        context.property.living_area_sqm === null
          ? null
          : Number(context.property.living_area_sqm),
      plotAreaSqm:
        context.property.plot_area_sqm === null
          ? null
          : Number(context.property.plot_area_sqm),
      propertyNotes,
      measurements,
      imageUrls: signedUrls.map((item) => item.url),
    });

    imageSuggestions = analyzed.map((suggestion) => ({
      ...suggestion,
      sourceDocumentId: signedUrls[0]?.id ?? null,
      imageBased: true,
    }));
  }

  const combined = [...imageSuggestions, ...baseSuggestions];
  const { data: existing, error: existingError } = await context.supabase
    .from("property_maintenance_items")
    .select("title")
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .neq("status", "dismissed");
  if (existingError) {
    return Response.json(
      { error: "Befintlig underhållsplan kunde inte kontrolleras." },
      { status: existingError.code === "42501" ? 403 : 409 },
    );
  }

  const existingTitles = new Set(
    (existing ?? []).map((item) => item.title.trim().toLocaleLowerCase("sv-SE")),
  );
  const unique = combined.filter((suggestion, index, rows) => {
    const key = suggestion.title.trim().toLocaleLowerCase("sv-SE");
    return (
      !existingTitles.has(key) &&
      rows.findIndex(
        (item) => item.title.trim().toLocaleLowerCase("sv-SE") === key,
      ) === index
    );
  });

  if (unique.length === 0) {
    return Response.json({ created: 0, imageSuggestions: imageSuggestions.length });
  }

  const { data, error } = await context.supabase
    .from("property_maintenance_items")
    .insert(
      unique.map((suggestion) => ({
        organization_id: context.organizationId,
        property_id: context.propertyId,
        title: suggestion.title,
        category: suggestion.category,
        description: suggestion.description,
        status: "planned",
        priority: suggestion.priority,
        due_on: addMonths(suggestion.dueInMonths),
        recurrence_months: suggestion.recurrenceMonths,
        source_type: "bynex_smart",
        source_document_id: suggestion.sourceDocumentId,
        smart_reason: suggestion.imageBased
          ? `Bildbaserat förslag. ${suggestion.smartReason}`
          : suggestion.smartReason,
        requires_review: true,
        created_by_user_id: context.userId,
      })),
    )
    .select("id");

  if (error || !data) {
    return Response.json(
      { error: "Smart-förslagen kunde inte sparas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json(
    {
      created: data.length,
      imageSuggestions: imageSuggestions.length,
      requiresReview: true,
    },
    { status: 201 },
  );
}

async function maintenanceDecision(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
  action: "review" | "dismiss" | "complete",
) {
  const maintenanceId = body.maintenanceId;
  if (!isUuid(maintenanceId)) {
    return Response.json({ error: "Underhållsposten är ogiltig." }, { status: 400 });
  }

  const now = new Date().toISOString();
  let update: Record<string, unknown>;
  if (action === "review") {
    update = {
      requires_review: false,
      reviewed_by_user_id: context.userId,
      reviewed_at: now,
      status: "planned",
      updated_at: now,
    };
  } else if (action === "dismiss") {
    update = {
      requires_review: false,
      reviewed_by_user_id: context.userId,
      reviewed_at: now,
      status: "dismissed",
      updated_at: now,
    };
  } else {
    update = {
      status: "completed",
      completed_by_user_id: context.userId,
      completed_at: now,
      updated_at: now,
    };
  }

  let query = context.supabase
    .from("property_maintenance_items")
    .update(update)
    .eq("organization_id", context.organizationId)
    .eq("property_id", context.propertyId)
    .eq("id", maintenanceId);
  query = action === "complete"
    ? query.eq("requires_review", false).neq("status", "completed")
    : query.eq("requires_review", true);

  const { data, error } = await query.select("id,status,requires_review").maybeSingle();
  if (error || !data) {
    return Response.json(
      {
        error:
          action === "complete"
            ? "Smart-förslag måste godkännas innan det kan markeras som utfört."
            : "Smart-förslaget kunde inte behandlas.",
      },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json({ maintenance: data });
}

async function updateProperty(
  context: PersonalBinderContext,
  body: Record<string, unknown>,
) {
  const propertyType = text(body.propertyType, 40) as BinderPropertyType;
  const propertyDesignation = text(body.propertyDesignation, 160).toUpperCase();
  const name = text(body.name, 160);
  const address = text(body.address, 200);
  const postalCode = text(body.postalCode, 20);
  const city = text(body.city, 120);
  const constructionYear = numberOrNull(body.constructionYear);
  const livingAreaSqm = numberOrNull(body.livingAreaSqm);
  const plotAreaSqm = numberOrNull(body.plotAreaSqm);

  if (
    !propertyTypes.has(propertyType) ||
    propertyDesignation.length < 2 ||
    name.length < 2 ||
    address.length < 2 ||
    postalCode.length < 3 ||
    city.length < 2 ||
    Number.isNaN(constructionYear) ||
    Number.isNaN(livingAreaSqm) ||
    Number.isNaN(plotAreaSqm)
  ) {
    return Response.json(
      { error: "Kontrollera fastighetsuppgifterna." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("properties")
    .update({
      name,
      property_type: propertyType,
      property_designation: propertyDesignation,
      address,
      postal_code: postalCode,
      city,
      construction_year:
        constructionYear === null ? null : Math.trunc(constructionYear),
      living_area_sqm: livingAreaSqm,
      plot_area_sqm: plotAreaSqm,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("id", context.propertyId)
    .select("id,updated_at")
    .maybeSingle();
  if (error || !data) {
    return Response.json(
      { error: "Fastighetsuppgifterna kunde inte sparas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json({ property: data });
}

export async function POST(request: Request) {
  const context = await personalBinderContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Begäran är tom." }, { status: 400 });
  }

  const action = text(body.action, 60);
  if (action === "prepare_upload") return prepareUpload(context, body);
  if (action === "confirm_upload") return confirmUpload(context, body);
  if (action === "download_document") return downloadDocument(context, body);
  if (action === "archive_document") return archiveDocument(context, body);
  if (action === "create_maintenance") return createMaintenance(context, body);
  if (action === "create_smart_plan") return createSmartPlan(context, body);
  if (action === "review_maintenance") return maintenanceDecision(context, body, "review");
  if (action === "dismiss_maintenance") return maintenanceDecision(context, body, "dismiss");
  if (action === "complete_maintenance") return maintenanceDecision(context, body, "complete");
  if (action === "update_property") return updateProperty(context, body);

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
