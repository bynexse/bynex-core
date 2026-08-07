import { randomUUID } from "node:crypto";

import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

type ScopeType =
  | "general"
  | "project"
  | "quote"
  | "change_order"
  | "bookkeeping"
  | "invoice"
  | "asset"
  | "property";

type FileContext = Extract<Awaited<ReturnType<typeof fileContext>>, { ok: true }>;

const managementRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const publishingRoles = new Set(["owner", "admin", "office", "manager"]);
const scopeTypes = new Set<ScopeType>([
  "general",
  "project",
  "quote",
  "change_order",
  "bookkeeping",
  "invoice",
  "asset",
  "property",
]);
const categories = new Set([
  "photo",
  "drawing",
  "document",
  "receipt",
  "warranty",
  "protocol",
  "manual",
  "invoice",
  "video",
  "audio",
  "other",
]);
const customerVisibilities = new Set(["internal", "review", "published"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "text/plain",
  "text/csv",
  "application/xml",
  "text/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksumPattern = /^[a-f0-9]{64}$/;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function optionalText(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized ? normalized : null;
}

function uuid(value: unknown) {
  const candidate = text(value, 36);
  return uuidPattern.test(candidate) ? candidate : null;
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "fil";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function fileContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !managementRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Du saknar behörighet till Bynex Filer." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id as string,
    role: membership.role as string,
  };
}

async function resolveScope(
  context: FileContext,
  scopeType: ScopeType,
  requestedScopeId: string | null,
) {
  if (scopeType === "general") {
    return { ok: true as const, scopeId: null, projectId: null };
  }
  if (!requestedScopeId) {
    return {
      ok: false as const,
      response: Response.json({ error: "Välj vad filen ska kopplas till." }, { status: 400 }),
    };
  }

  if (scopeType === "project") {
    const { data } = await context.supabase
      .from("projects")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: data.id }
      : { ok: false as const, response: Response.json({ error: "Projektet hittades inte." }, { status: 404 }) };
  }

  if (scopeType === "quote") {
    const { data } = await context.supabase
      .from("quotes")
      .select("id,converted_project_id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: data.converted_project_id as string | null }
      : { ok: false as const, response: Response.json({ error: "Offerten hittades inte." }, { status: 404 }) };
  }

  if (scopeType === "change_order") {
    const { data } = await context.supabase
      .from("change_orders")
      .select("id,project_id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: data.project_id as string }
      : { ok: false as const, response: Response.json({ error: "ÄTA:n hittades inte." }, { status: 404 }) };
  }

  if (scopeType === "bookkeeping") {
    const { data } = await context.supabase
      .from("bookkeeping_documents")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: null }
      : { ok: false as const, response: Response.json({ error: "Bokföringsunderlaget hittades inte." }, { status: 404 }) };
  }

  if (scopeType === "invoice") {
    const { data } = await context.supabase
      .from("customer_invoices")
      .select("id,project_id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: data.project_id as string | null }
      : { ok: false as const, response: Response.json({ error: "Fakturan hittades inte." }, { status: 404 }) };
  }

  if (scopeType === "asset") {
    const { data } = await context.supabase
      .from("assets")
      .select("id,project_id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedScopeId)
      .eq("active", true)
      .maybeSingle();
    return data
      ? { ok: true as const, scopeId: data.id, projectId: data.project_id as string | null }
      : { ok: false as const, response: Response.json({ error: "Tillgången hittades inte." }, { status: 404 }) };
  }

  const { data: property } = await context.supabase
    .from("properties")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", requestedScopeId)
    .maybeSingle();
  if (!property) {
    return { ok: false as const, response: Response.json({ error: "Fastigheten hittades inte." }, { status: 404 }) };
  }
  const { data: propertyLink } = await context.supabase
    .from("project_property_links")
    .select("project_id")
    .eq("organization_id", context.organizationId)
    .eq("property_id", property.id)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();
  return {
    ok: true as const,
    scopeId: property.id,
    projectId: propertyLink?.project_id as string | null,
  };
}

export async function GET(request: Request) {
  const context = await fileContext();
  if (!context.ok) return context.response;

  const fileId = uuid(new URL(request.url).searchParams.get("fileId"));
  if (fileId) {
    const { data: file, error: fileError } = await context.supabase
      .from("bynex_files")
      .select("id,storage_bucket,storage_path,original_filename,status")
      .eq("organization_id", context.organizationId)
      .eq("id", fileId)
      .eq("status", "active")
      .maybeSingle();
    if (fileError || !file) {
      return Response.json({ error: "Filen hittades inte eller är arkiverad." }, { status: fileError ? databaseStatus(fileError.code) : 404 });
    }
    const { data: signed, error: signedError } = await context.supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 60 * 10);
    if (signedError || !signed?.signedUrl) {
      return Response.json({ error: "Filen kunde inte öppnas." }, { status: 500 });
    }
    return Response.json({
      url: signed.signedUrl,
      fileName: file.original_filename,
      expiresInSeconds: 600,
    });
  }

  const [files, links, projects, quotes, changeOrders, invoices, assets, properties, bookkeepingDocuments] = await Promise.all([
    context.supabase
      .from("bynex_files")
      .select("id,storage_bucket,original_filename,title,description,category,mime_type,size_bytes,checksum_sha256,status,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1000),
    context.supabase
      .from("bynex_file_links")
      .select("id,file_id,scope_type,scope_id,project_id,customer_visibility,customer_published_at,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(1500),
    context.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,status,active")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("quotes")
      .select("id,quote_number,title,customer_name,status,converted_project_id")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("change_orders")
      .select("id,change_order_number,title,project_id,status")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("customer_invoices")
      .select("id,invoice_number,status,project_id,customer_id,created_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("assets")
      .select("id,asset_number,name,project_id,status")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("properties")
      .select("id,property_number,name,status")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(500),
    context.supabase
      .from("bookkeeping_documents")
      .select("id,original_filename,document_type,counterparty_name,status,created_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const failure = [
    files,
    links,
    projects,
    quotes,
    changeOrders,
    invoices,
    assets,
    properties,
    bookkeepingDocuments,
  ].find((result) => result.error)?.error;
  if (failure) {
    return Response.json(
      { error: "Bynex Filer kunde inte hämtas." },
      { status: databaseStatus(failure.code) },
    );
  }

  return Response.json({
    files: files.data ?? [],
    links: links.data ?? [],
    targets: {
      projects: projects.data ?? [],
      quotes: quotes.data ?? [],
      changeOrders: changeOrders.data ?? [],
      invoices: invoices.data ?? [],
      assets: assets.data ?? [],
      properties: properties.data ?? [],
      bookkeepingDocuments: bookkeepingDocuments.data ?? [],
    },
    permissions: {
      canManage: true,
      canPublish: publishingRoles.has(context.role),
    },
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const context = await fileContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "prepare_upload") {
    const fileName = text(body?.fileName, 240);
    const title = text(body?.title, 240) || fileName.replace(/\.[^.]+$/, "");
    const description = optionalText(body?.description, 4000);
    const category = text(body?.category, 30);
    const mimeType = text(body?.mimeType, 160).toLowerCase();
    const sizeBytes = Number(body?.sizeBytes);
    const checksum = text(body?.checksumSha256, 64).toLowerCase();
    const scopeType = text(body?.scopeType, 40) as ScopeType;
    const scopeId = uuid(body?.scopeId);

    if (
      !fileName
      || fileName.length > 240
      || title.length < 1
      || title.length > 240
      || !categories.has(category)
      || !allowedMimeTypes.has(mimeType)
      || !Number.isInteger(sizeBytes)
      || sizeBytes < 1
      || sizeBytes > 50 * 1024 * 1024
      || !checksumPattern.test(checksum)
      || !scopeTypes.has(scopeType)
    ) {
      return Response.json(
        { error: "Kontrollera fil, kategori, storlek och koppling." },
        { status: 400 },
      );
    }

    const resolvedScope = await resolveScope(context, scopeType, scopeId);
    if (!resolvedScope.ok) return resolvedScope.response;

    const fileId = randomUUID();
    const storagePath = `${context.organizationId}/${fileId}/${randomUUID()}-${safeFileName(fileName)}`;
    const { data: file, error: fileError } = await context.supabase
      .from("bynex_files")
      .insert({
        id: fileId,
        organization_id: context.organizationId,
        storage_bucket: "bynex-files",
        storage_path: storagePath,
        original_filename: fileName,
        title,
        description,
        category,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        checksum_sha256: checksum,
        status: "uploading",
        uploaded_by_user_id: context.userId,
      })
      .select("id")
      .single();
    if (fileError || !file) {
      return Response.json(
        { error: "Filposten kunde inte förberedas." },
        { status: databaseStatus(fileError?.code) },
      );
    }

    const { data: link, error: linkError } = await context.supabase
      .from("bynex_file_links")
      .insert({
        organization_id: context.organizationId,
        file_id: file.id,
        scope_type: scopeType,
        scope_id: resolvedScope.scopeId,
        project_id: resolvedScope.projectId,
        customer_visibility: "internal",
        created_by_user_id: context.userId,
      })
      .select("id")
      .single();
    if (linkError || !link) {
      await context.supabase
        .from("bynex_files")
        .update({ status: "failed" })
        .eq("organization_id", context.organizationId)
        .eq("id", file.id);
      return Response.json(
        { error: "Filen kunde inte kopplas till vald post." },
        { status: databaseStatus(linkError?.code) },
      );
    }

    return Response.json(
      {
        fileId: file.id,
        linkId: link.id,
        bucket: "bynex-files",
        storagePath,
      },
      { status: 201 },
    );
  }

  if (action === "complete_upload") {
    const fileId = uuid(body?.fileId);
    if (!fileId) return Response.json({ error: "Filposten är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase
      .from("bynex_files")
      .update({ status: "active" })
      .eq("organization_id", context.organizationId)
      .eq("id", fileId)
      .eq("status", "uploading")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return Response.json(
        { error: "Uppladdningen kunde inte bekräftas." },
        { status: error ? databaseStatus(error.code) : 404 },
      );
    }
    return Response.json({ fileId: data.id });
  }

  if (action === "abort_upload") {
    const fileId = uuid(body?.fileId);
    if (!fileId) return Response.json({ error: "Filposten är ogiltig." }, { status: 400 });
    const { data: file } = await context.supabase
      .from("bynex_files")
      .select("id,storage_bucket,storage_path")
      .eq("organization_id", context.organizationId)
      .eq("id", fileId)
      .maybeSingle();
    if (!file) return Response.json({ error: "Filposten hittades inte." }, { status: 404 });
    await context.supabase.storage.from(file.storage_bucket).remove([file.storage_path]);
    const { error } = await context.supabase
      .from("bynex_files")
      .update({ status: "failed" })
      .eq("organization_id", context.organizationId)
      .eq("id", file.id);
    if (error) {
      return Response.json({ error: "Den ofullständiga filposten kunde inte stängas." }, { status: databaseStatus(error.code) });
    }
    return Response.json({ fileId: file.id });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const context = await fileContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "visibility") {
    const linkId = uuid(body?.linkId);
    const visibility = text(body?.visibility, 20);
    if (!linkId || !customerVisibilities.has(visibility)) {
      return Response.json({ error: "Delningsvalet är ogiltigt." }, { status: 400 });
    }
    if (visibility === "published" && !publishingRoles.has(context.role)) {
      return Response.json(
        { error: "Ägare, administratör, kontor eller projektledare måste publicera filen." },
        { status: 403 },
      );
    }

    const { data: link, error: linkError } = await context.supabase
      .from("bynex_file_links")
      .select("id,file_id,project_id")
      .eq("organization_id", context.organizationId)
      .eq("id", linkId)
      .maybeSingle();
    if (linkError || !link) {
      return Response.json({ error: "Filkopplingen hittades inte." }, { status: linkError ? databaseStatus(linkError.code) : 404 });
    }
    if (visibility !== "internal" && !link.project_id) {
      return Response.json(
        { error: "Filen behöver vara kopplad till ett projekt innan den kan delas med kund." },
        { status: 409 },
      );
    }

    const published = visibility === "published";
    const { data, error } = await context.supabase
      .from("bynex_file_links")
      .update({
        customer_visibility: visibility,
        customer_published_by_user_id: published ? context.userId : null,
        customer_published_at: published ? new Date().toISOString() : null,
      })
      .eq("organization_id", context.organizationId)
      .eq("id", link.id)
      .select("id,customer_visibility,customer_published_at")
      .maybeSingle();
    if (error || !data) {
      return Response.json({ error: "Filens kunddelning kunde inte uppdateras." }, { status: error ? databaseStatus(error.code) : 404 });
    }
    return Response.json({ link: data });
  }

  if (action === "archive" || action === "restore") {
    const fileId = uuid(body?.fileId);
    if (!fileId) return Response.json({ error: "Filen är ogiltig." }, { status: 400 });
    const nextStatus = action === "archive" ? "archived" : "active";
    const { data, error } = await context.supabase
      .from("bynex_files")
      .update({ status: nextStatus })
      .eq("organization_id", context.organizationId)
      .eq("id", fileId)
      .in("status", action === "archive" ? ["active", "uploading"] : ["archived"])
      .select("id,status")
      .maybeSingle();
    if (error || !data) {
      return Response.json({ error: "Filens status kunde inte uppdateras." }, { status: error ? databaseStatus(error.code) : 404 });
    }
    if (action === "archive") {
      await context.supabase
        .from("bynex_file_links")
        .update({
          customer_visibility: "internal",
          customer_published_by_user_id: null,
          customer_published_at: null,
        })
        .eq("organization_id", context.organizationId)
        .eq("file_id", fileId);
    }
    return Response.json({ file: data });
  }

  if (action === "metadata") {
    const fileId = uuid(body?.fileId);
    const title = text(body?.title, 240);
    const description = optionalText(body?.description, 4000);
    const category = text(body?.category, 30);
    if (!fileId || title.length < 1 || title.length > 240 || !categories.has(category)) {
      return Response.json({ error: "Kontrollera filens rubrik och kategori." }, { status: 400 });
    }
    const { data, error } = await context.supabase
      .from("bynex_files")
      .update({ title, description, category })
      .eq("organization_id", context.organizationId)
      .eq("id", fileId)
      .select("id,title,description,category")
      .maybeSingle();
    if (error || !data) {
      return Response.json({ error: "Filinformationen kunde inte sparas." }, { status: error ? databaseStatus(error.code) : 404 });
    }
    return Response.json({ file: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
