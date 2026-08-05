import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const connectionAdminRoles = new Set(["owner", "admin"]);

async function accountingContext() {
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

  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (!membership || !financeRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Ekonomibehörighet krävs för bokföringskopplingar." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

function databaseErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "23505") return 409;
  return 500;
}

export async function GET() {
  const context = await accountingContext();
  if (!context.ok) return context.response;

  const [
    connectors,
    connections,
    jobs,
    conflicts,
    inboxes,
    supplierInvoices,
    suppliers,
    projects,
  ] = await Promise.all([
    context.supabase
      .from("accounting_connectors")
      .select("id,slug,name,vendor_name,transport,auth_mode,implementation_status,capabilities,official_docs_url,requires_partner_agreement,fallback_connector,sort_order")
      .eq("active", true)
      .order("sort_order")
      .limit(100),
    context.supabase
      .from("organization_accounting_connections")
      .select("id,connector_id,display_name,status,external_company_id,granted_scopes,default_connection,import_supplier_invoices,export_customer_invoices,export_vouchers,sync_projects,auto_export_customer_invoices,auto_export_approved_supplier_invoices,require_supplier_invoice_approval,last_health_status,last_health_checked_at,last_successful_sync_at,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("default_connection", { ascending: false })
      .order("created_at")
      .limit(50),
    context.supabase
      .from("accounting_sync_jobs")
      .select("id,connection_id,direction,resource_type,resource_id,operation,resource_version,approval_status,status,provider_record_id,attempt_count,next_attempt_at,last_error_code,last_error_message,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("accounting_sync_conflicts")
      .select("id,sync_job_id,conflict_type,safe_summary,status,resolution,resolved_at,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("invoice_inboxes")
      .select("id,email_address,provider,is_primary,status,last_received_at,created_at")
      .eq("organization_id", context.organizationId)
      .order("is_primary", { ascending: false })
      .limit(10),
    context.supabase
      .from("supplier_invoices")
      .select("id,supplier_id,project_id,inbox_id,source,invoice_kind,invoice_number,invoice_date,due_date,currency,net_amount,vat_amount,total_amount,amount_due,ocr_reference,duplicate_of_invoice_id,status,parsing_error_code,approved_at,exported_at,accounting_export_reference,received_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("received_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("suppliers")
      .select("id,name,organization_number")
      .eq("organization_id", context.organizationId)
      .limit(500),
    context.supabase
      .from("projects")
      .select("id,project_number,name")
      .eq("organization_id", context.organizationId)
      .limit(500),
  ]);

  const error =
    connectors.error ??
    connections.error ??
    jobs.error ??
    conflicts.error ??
    inboxes.error ??
    supplierInvoices.error ??
    suppliers.error ??
    projects.error;

  if (error) {
    return Response.json(
      { error: "Bokföringskopplingarna kunde inte hämtas." },
      { status: databaseErrorStatus(error.code) },
    );
  }

  const invoiceIds = (supplierInvoices.data ?? []).map((invoice) => invoice.id);
  const [invoiceLines, suggestions] = invoiceIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }]
    : await Promise.all([
        context.supabase
          .from("supplier_invoice_lines")
          .select("id,supplier_invoice_id,line_number,description,article_number,quantity,unit,unit_price,net_amount,vat_rate,vat_amount,account_code,cost_center,price_observation_status")
          .eq("organization_id", context.organizationId)
          .in("supplier_invoice_id", invoiceIds)
          .order("line_number")
          .limit(5000),
        context.supabase
          .from("supplier_invoice_suggestions")
          .select("id,supplier_invoice_id,suggestion_type,suggested_supplier_id,suggested_project_id,suggested_value,confidence,rationale,method,status,created_at")
          .eq("organization_id", context.organizationId)
          .in("supplier_invoice_id", invoiceIds)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

  const invoiceDetailError = invoiceLines.error ?? suggestions.error;
  if (invoiceDetailError) {
    return Response.json(
      { error: "Leverantörsfakturornas detaljer kunde inte hämtas." },
      { status: databaseErrorStatus(invoiceDetailError.code) },
    );
  }

  return Response.json({
    connectors: connectors.data ?? [],
    connections: connections.data ?? [],
    jobs: jobs.data ?? [],
    conflicts: conflicts.data ?? [],
    inboxes: inboxes.data ?? [],
    supplierInvoices: supplierInvoices.data ?? [],
    suppliers: suppliers.data ?? [],
    projects: projects.data ?? [],
    invoiceLines: invoiceLines.data ?? [],
    suggestions: suggestions.data ?? [],
    permissions: {
      canManageConnections: connectionAdminRoles.has(context.role),
      canResolveConflicts: financeRoles.has(context.role),
      canQueueApprovedInvoices: financeRoles.has(context.role),
    },
  });
}

export async function POST(request: Request) {
  const context = await accountingContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "Begäran är ogiltig." }, { status: 400 });
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "update_connection") {
    if (!connectionAdminRoles.has(context.role)) {
      return Response.json(
        { error: "Endast ägare och administratörer kan ändra kopplingar." },
        { status: 403 },
      );
    }

    const connectionId = body?.connectionId;
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!isUuid(connectionId) || displayName.length < 2 || displayName.length > 100) {
      return Response.json({ error: "Kopplingen är ogiltig." }, { status: 400 });
    }

    const booleanKeys = [
      "importSupplierInvoices",
      "exportCustomerInvoices",
      "exportVouchers",
      "syncProjects",
      "autoExportCustomerInvoices",
      "autoExportApprovedSupplierInvoices",
    ] as const;
    if (booleanKeys.some((key) => typeof body?.[key] !== "boolean")) {
      return Response.json({ error: "Alla kopplingsval måste anges." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("organization_accounting_connections")
      .update({
        display_name: displayName,
        import_supplier_invoices: body.importSupplierInvoices,
        export_customer_invoices: body.exportCustomerInvoices,
        export_vouchers: body.exportVouchers,
        sync_projects: body.syncProjects,
        auto_export_customer_invoices:
          body.exportCustomerInvoices && body.autoExportCustomerInvoices,
        auto_export_approved_supplier_invoices:
          body.exportVouchers && body.autoExportApprovedSupplierInvoices,
        require_supplier_invoice_approval: true,
      })
      .eq("organization_id", context.organizationId)
      .eq("id", connectionId)
      .neq("status", "disabled")
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return Response.json(
        { error: "Kopplingen kunde inte uppdateras." },
        { status: error ? databaseErrorStatus(error.code) : 404 },
      );
    }
    return Response.json({ updated: true });
  }

  if (action === "disable_connection") {
    if (!connectionAdminRoles.has(context.role) || !isUuid(body?.connectionId)) {
      return Response.json({ error: "Du kan inte inaktivera kopplingen." }, { status: 403 });
    }
    const { data, error } = await context.supabase
      .from("organization_accounting_connections")
      .update({ status: "disabled" })
      .eq("organization_id", context.organizationId)
      .eq("id", body.connectionId)
      .neq("status", "disabled")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return Response.json(
        { error: "Kopplingen kunde inte inaktiveras." },
        { status: error ? databaseErrorStatus(error.code) : 404 },
      );
    }
    return Response.json({ disabled: true });
  }

  if (action === "resolve_conflict") {
    const conflictId = body?.conflictId;
    const status = body?.status;
    const resolution = typeof body?.resolution === "string" ? body.resolution.trim() : "";
    if (
      !isUuid(conflictId) ||
      (status !== "resolved" && status !== "ignored") ||
      resolution.length < 2 ||
      resolution.length > 2000
    ) {
      return Response.json({ error: "Kontrollera konfliktens beslut och motivering." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("accounting_sync_conflicts")
      .update({
        status,
        resolution,
        resolved_by_user_id: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("id", conflictId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return Response.json(
        { error: "Konflikten kunde inte avslutas." },
        { status: error ? databaseErrorStatus(error.code) : 404 },
      );
    }
    return Response.json({ resolved: true });
  }

  if (action === "queue_supplier_invoice_export") {
    const invoiceId = body?.invoiceId;
    const connectionId = body?.connectionId;
    if (!isUuid(invoiceId) || !isUuid(connectionId)) {
      return Response.json({ error: "Faktura och bokföringskoppling krävs." }, { status: 400 });
    }

    const [{ data: invoice }, { data: connection }] = await Promise.all([
      context.supabase
        .from("supplier_invoices")
        .select("id,status,approved_at")
        .eq("organization_id", context.organizationId)
        .eq("id", invoiceId)
        .maybeSingle(),
      context.supabase
        .from("organization_accounting_connections")
        .select("id,status,export_vouchers")
        .eq("organization_id", context.organizationId)
        .eq("id", connectionId)
        .maybeSingle(),
    ]);
    if (!invoice || invoice.status !== "approved" || !invoice.approved_at) {
      return Response.json({ error: "Leverantörsfakturan måste vara attesterad före export." }, { status: 409 });
    }
    if (!connection || connection.status !== "active" || !connection.export_vouchers) {
      return Response.json({ error: "En aktiv koppling med verifikationsexport krävs." }, { status: 409 });
    }

    const { data, error } = await context.supabase.rpc(
      "queue_supplier_invoice_accounting_export",
      {
        p_organization_id: context.organizationId,
        p_supplier_invoice_id: invoiceId,
        p_connection_id: connectionId,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: "Exportjobbet kunde inte köas." },
        { status: databaseErrorStatus(error?.code) },
      );
    }
    return Response.json({ jobId: data }, { status: 201 });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
