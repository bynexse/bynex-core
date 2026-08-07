import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const operationsRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const reportKinds = new Set([
  "asset_issue",
  "project_blocker",
  "material_need",
  "safety_observation",
  "other",
]);
const reportPriorities = new Set(["normal", "high", "stop_work"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "");
}

function dateIsCurrent(value: { starts_on: string | null; ends_on: string | null }, today: string) {
  return (!value.starts_on || value.starts_on <= today) && (!value.ends_on || value.ends_on >= today);
}

async function fieldContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,full_name,email,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const [membershipResult, organizationResult, entitlementResult] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.current_organization_id)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("organizations")
      .select("id,name")
      .eq("id", profile.current_organization_id)
      .maybeSingle(),
    auth.supabase
      .from("active_organization_module_entitlements")
      .select("module_slug")
      .eq("organization_id", profile.current_organization_id)
      .in("module_slug", ["time_payroll", "projects", "assets"]),
  ]);

  if (membershipResult.error || !membershipResult.data) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    };
  }
  if (organizationResult.error || !organizationResult.data || entitlementResult.error) {
    return {
      ok: false as const,
      response: Response.json({ error: "Arbetsläget kunde inte förberedas." }, { status: 500 }),
    };
  }

  let { data: worker, error: workerError } = await auth.supabase
    .from("workers")
    .select("id,full_name,email,phone,job_title,employment_type,gps_enabled")
    .eq("organization_id", profile.current_organization_id)
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();

  if (!worker && !workerError) {
    const created = await auth.supabase
      .from("workers")
      .insert({
        organization_id: profile.current_organization_id,
        profile_id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        employment_type: membershipResult.data.role === "contractor" ? "subcontractor" : "employee",
        gps_enabled: true,
      })
      .select("id,full_name,email,phone,job_title,employment_type,gps_enabled")
      .single();
    worker = created.data;
    workerError = created.error;
  }

  if (workerError || !worker) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Din personalprofil behöver kopplas till kontot innan arbetsläget kan öppnas." },
        { status: 409 },
      ),
    };
  }

  return {
    ok: true as const,
    ...auth,
    profile,
    worker,
    organizationId: profile.current_organization_id,
    organization: organizationResult.data,
    role: membershipResult.data.role as string,
    modules: new Set((entitlementResult.data ?? []).map((row) => row.module_slug)),
  };
}

type FieldContext = Extract<Awaited<ReturnType<typeof fieldContext>>, { ok: true }>;

export async function GET() {
  const context = await fieldContext();
  if (!context.ok) return context.response;

  const today = new Date().toISOString().slice(0, 10);
  const hasTime = context.modules.has("time_payroll");
  const hasProjects = context.modules.has("projects");
  const hasAssets = context.modules.has("assets");

  const [projectsResult, workTypesResult, entriesResult, assignmentsResult] = await Promise.all([
    hasProjects || hasTime
      ? context.supabase
          .from("projects")
          .select(
            "id,project_number,name,customer_name,address,postal_code,city,status,start_date,end_date,responsible_worker_id,active,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .eq("active", true)
          .in("status", ["planned", "active", "paused"])
          .order("updated_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    hasTime
      ? context.supabase
          .from("work_types")
          .select("id,name,billable")
          .eq("organization_id", context.organizationId)
          .eq("active", true)
          .order("name")
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    hasTime
      ? context.supabase
          .from("time_entries")
          .select("id,project_id,work_type_id,clock_in,clock_out,status,note,approved_at")
          .eq("organization_id", context.organizationId)
          .eq("worker_id", context.worker.id)
          .order("clock_in", { ascending: false })
          .limit(14)
      : Promise.resolve({ data: [], error: null }),
    hasProjects
      ? context.supabase
          .from("project_assignments")
          .select("id,project_id,worker_id,starts_on,ends_on,active")
          .eq("organization_id", context.organizationId)
          .eq("worker_id", context.worker.id)
          .eq("active", true)
          .order("starts_on", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const requiredFailure = [projectsResult, workTypesResult, entriesResult].find((result) => result.error)?.error;
  if (requiredFailure) {
    return Response.json(
      { error: "Tid eller projekt kunde inte hämtas till arbetsläget." },
      { status: requiredFailure.code === "42501" ? 403 : 500 },
    );
  }

  const projects = projectsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const assignments = assignmentsResult.error && missingFeature(assignmentsResult.error.code)
    ? []
    : (assignmentsResult.data ?? []).filter((assignment) => dateIsCurrent(assignment, today));
  const activeEntry = entries.find((entry) => !entry.clock_out) ?? null;

  const { data: activeBreak, error: activeBreakError } = activeEntry
    ? await context.supabase
        .from("time_breaks")
        .select("id,started_at")
        .eq("organization_id", context.organizationId)
        .eq("time_entry_id", activeEntry.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (activeBreakError) {
    return Response.json({ error: "Pågående rast kunde inte kontrolleras." }, { status: 500 });
  }

  const primaryProjectId = activeEntry?.project_id
    ?? assignments[0]?.project_id
    ?? entries.find((entry) => entry.project_id)?.project_id
    ?? projects[0]?.id
    ?? null;
  const primaryProject = projects.find((project) => project.id === primaryProjectId) ?? null;

  const { data: responsibleWorker } = primaryProject?.responsible_worker_id
    ? await context.supabase
        .from("workers")
        .select("id,full_name,phone,job_title")
        .eq("organization_id", context.organizationId)
        .eq("id", primaryProject.responsible_worker_id)
        .maybeSingle()
    : { data: null };

  let machineItems: Array<Record<string, unknown>> = [];
  let machineLocations: Array<Record<string, unknown>> = [];
  let openReports: Array<Record<string, unknown>> = [];
  let reportsSetupRequired = false;

  if (hasAssets) {
    const [loansResult, responsibleAssetsResult, reportsResult] = await Promise.all([
      context.supabase
        .from("asset_loans")
        .select(
          "id,asset_id,project_id,status,checked_out_at,due_at,returned_at,deployed_location_id,expected_return_location_id,checkout_note",
        )
        .eq("organization_id", context.organizationId)
        .eq("borrower_worker_id", context.worker.id)
        .in("status", ["active", "overdue"])
        .order("checked_out_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("assets")
        .select(
          "id,asset_number,name,asset_type,status,manufacturer,model,registration_number,project_id,responsible_worker_id,location_text,current_location_id,current_meter,meter_unit,next_service_date,inspection_due_date,updated_at",
        )
        .eq("organization_id", context.organizationId)
        .eq("responsible_worker_id", context.worker.id)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("field_reports")
        .select("id,project_id,asset_id,report_kind,priority,title,description,status,created_at")
        .eq("organization_id", context.organizationId)
        .eq("worker_id", context.worker.id)
        .in("status", ["open", "acknowledged"])
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const assetFailure = loansResult.error ?? responsibleAssetsResult.error;
    if (assetFailure) {
      return Response.json(
        { error: "Dina tilldelade maskiner kunde inte hämtas." },
        { status: assetFailure.code === "42501" ? 403 : 500 },
      );
    }

    reportsSetupRequired = Boolean(reportsResult.error && missingFeature(reportsResult.error.code));
    if (reportsResult.error && !reportsSetupRequired) {
      return Response.json({ error: "Rapporter från arbetsplatsen kunde inte hämtas." }, { status: 500 });
    }
    openReports = reportsResult.data ?? [];

    const loans = loansResult.data ?? [];
    const responsibleAssets = responsibleAssetsResult.data ?? [];
    const knownAssetIds = new Set(responsibleAssets.map((asset) => asset.id));
    const borrowedAssetIds = Array.from(
      new Set(loans.map((loan) => loan.asset_id).filter((assetId) => !knownAssetIds.has(assetId))),
    );

    const borrowedAssetsResult = borrowedAssetIds.length
      ? await context.supabase
          .from("assets")
          .select(
            "id,asset_number,name,asset_type,status,manufacturer,model,registration_number,project_id,responsible_worker_id,location_text,current_location_id,current_meter,meter_unit,next_service_date,inspection_due_date,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .in("id", borrowedAssetIds)
          .eq("active", true)
      : { data: [], error: null };
    if (borrowedAssetsResult.error) {
      return Response.json({ error: "Lånade maskiner kunde inte hämtas." }, { status: 500 });
    }

    const allAssets = [...responsibleAssets, ...(borrowedAssetsResult.data ?? [])];
    const assetIds = allAssets.map((asset) => asset.id);
    const locationIds = Array.from(
      new Set([
        ...allAssets.map((asset) => asset.current_location_id),
        ...loans.flatMap((loan) => [loan.deployed_location_id, loan.expected_return_location_id]),
      ].filter((value): value is string => Boolean(value))),
    );

    const [locationsResult, qrResult] = await Promise.all([
      locationIds.length
        ? context.supabase
            .from("asset_locations")
            .select("id,project_id,location_code,name,location_type")
            .eq("organization_id", context.organizationId)
            .in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      assetIds.length
        ? context.supabase
            .from("asset_qr_codes")
            .select("asset_id,human_code,status,expires_at")
            .eq("organization_id", context.organizationId)
            .in("asset_id", assetIds)
            .eq("status", "active")
            .order("issued_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (locationsResult.error || qrResult.error) {
      return Response.json({ error: "Maskinernas plats- eller QR-information kunde inte hämtas." }, { status: 500 });
    }

    machineLocations = locationsResult.data ?? [];
    const locationById = new Map(machineLocations.map((location) => [String(location.id), location]));
    const loanByAsset = new Map(loans.map((loan) => [loan.asset_id, loan]));
    const qrByAsset = new Map<string, { human_code: string; expires_at: string | null }>();
    for (const qr of qrResult.data ?? []) {
      if (!qrByAsset.has(qr.asset_id)) {
        qrByAsset.set(qr.asset_id, { human_code: qr.human_code, expires_at: qr.expires_at });
      }
    }

    machineItems = allAssets.map((asset) => {
      const loan = loanByAsset.get(asset.id) ?? null;
      const currentLocation = asset.current_location_id
        ? locationById.get(asset.current_location_id) ?? null
        : null;
      const expectedReturnLocation = loan?.expected_return_location_id
        ? locationById.get(loan.expected_return_location_id) ?? null
        : null;
      return {
        ...asset,
        loan,
        currentLocation,
        expectedReturnLocation,
        qr: qrByAsset.get(asset.id) ?? null,
        assignedByResponsibility: asset.responsible_worker_id === context.worker.id,
      };
    });
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const alerts: Array<{ kind: string; title: string; detail: string; tab: "time" | "project" | "machine" }> = [];
  const now = Date.now();

  if (hasTime && primaryProject && !activeEntry) {
    alerts.push({
      kind: "time_missing",
      title: "Du är inte instämplad",
      detail: `${primaryProject.project_number} · ${primaryProject.name}`,
      tab: "time",
    });
  }
  if (activeEntry && now - new Date(activeEntry.clock_in).getTime() > 11 * 60 * 60 * 1000) {
    alerts.push({
      kind: "long_shift",
      title: "Kontrollera pågående arbetspass",
      detail: "Tiden har varit aktiv i mer än elva timmar.",
      tab: "time",
    });
  }
  if (activeBreak && now - new Date(activeBreak.started_at).getTime() > 90 * 60 * 1000) {
    alerts.push({
      kind: "long_break",
      title: "Rasten är fortfarande aktiv",
      detail: "Kontrollera om rasten ska avslutas.",
      tab: "time",
    });
  }

  for (const machine of machineItems) {
    const status = String(machine.status ?? "");
    const name = String(machine.name ?? "Maskin");
    if (["out_of_service", "lost"].includes(status)) {
      alerts.push({
        kind: "machine_blocked",
        title: `${name} får inte användas`,
        detail: status === "lost" ? "Maskinen är markerad som saknad." : "Maskinen är ur drift.",
        tab: "machine",
      });
      continue;
    }
    const inspectionDue = typeof machine.inspection_due_date === "string"
      ? new Date(`${machine.inspection_due_date}T00:00:00`).getTime()
      : null;
    if (inspectionDue && inspectionDue < now) {
      alerts.push({
        kind: "inspection_overdue",
        title: `${name} behöver kontroll`,
        detail: "Besiktningsdatumet har passerat.",
        tab: "machine",
      });
      continue;
    }
    const serviceDue = typeof machine.next_service_date === "string"
      ? new Date(`${machine.next_service_date}T00:00:00`).getTime()
      : null;
    if (serviceDue && serviceDue - now <= 14 * 24 * 60 * 60 * 1000) {
      alerts.push({
        kind: "service_due",
        title: `Service närmar sig för ${name}`,
        detail: `Nästa service ${machine.next_service_date}.`,
        tab: "machine",
      });
    }
  }

  const stopWorkReport = openReports.find((report) => report.priority === "stop_work");
  if (stopWorkReport) {
    alerts.unshift({
      kind: "stop_work_report",
      title: "En arbetsplatsrapport stoppar arbete",
      detail: String(stopWorkReport.title),
      tab: stopWorkReport.asset_id ? "machine" : "project",
    });
  }

  return Response.json(
    {
      user: {
        fullName: context.profile.full_name,
        role: context.role,
      },
      company: context.organization,
      worker: context.worker,
      modules: {
        time: hasTime,
        projects: hasProjects,
        machines: hasAssets,
      },
      time: {
        activeEntry,
        activeBreak,
        entries,
        workTypes: workTypesResult.data ?? [],
        serverNow: new Date().toISOString(),
      },
      projects: {
        primary: primaryProject
          ? { ...primaryProject, responsibleWorker: responsibleWorker ?? null }
          : null,
        assignments: assignments.map((assignment) => ({
          ...assignment,
          project: projectById.get(assignment.project_id) ?? null,
        })),
        available: projects,
      },
      machines: {
        items: machineItems,
        locations: machineLocations,
        openReports,
        reportsSetupRequired,
      },
      alerts: alerts.slice(0, 6),
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await fieldContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "return_asset") {
    if (!context.modules.has("assets")) {
      return Response.json({ error: "Bynex Maskiner ingår inte i företagets aktiva paket." }, { status: 403 });
    }
    const loanId = typeof body?.loanId === "string" ? body.loanId : "";
    const requestedLocationId = typeof body?.locationId === "string" ? body.locationId : "";
    const note = text(body?.note, 500);
    if (!isUuid(loanId) || (requestedLocationId && !isUuid(requestedLocationId))) {
      return Response.json({ error: "Maskinreturen är ogiltig." }, { status: 400 });
    }

    const { data: loan, error: loanError } = await context.supabase
      .from("asset_loans")
      .select("id,borrower_worker_id,status,expected_return_location_id")
      .eq("organization_id", context.organizationId)
      .eq("id", loanId)
      .eq("borrower_worker_id", context.worker.id)
      .in("status", ["active", "overdue"])
      .maybeSingle();
    if (loanError || !loan) {
      return Response.json({ error: "Den aktiva maskinutlåningen hittades inte." }, { status: 404 });
    }

    const locationId = requestedLocationId || loan.expected_return_location_id || "";
    if (!isUuid(locationId)) {
      return Response.json({ error: "Välj var maskinen lämnas tillbaka." }, { status: 400 });
    }
    const { data: location } = await context.supabase
      .from("asset_locations")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", locationId)
      .eq("active", true)
      .maybeSingle();
    if (!location) {
      return Response.json({ error: "Returplatsen finns inte i företaget." }, { status: 404 });
    }

    const { data: returned, error } = await context.supabase
      .from("asset_loans")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        returned_location_id: locationId,
        return_note: note || "Återlämnad från Bynex arbetsapp.",
        returned_by_user_id: context.userId,
      })
      .eq("organization_id", context.organizationId)
      .eq("id", loan.id)
      .eq("borrower_worker_id", context.worker.id)
      .in("status", ["active", "overdue"])
      .select("id,status,returned_at")
      .maybeSingle();

    if (error || !returned) {
      return Response.json(
        { error: "Maskinen kunde inte återlämnas. Kontrollera returplats och behörighet." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ loan: returned });
  }

  if (action !== "report") {
    return Response.json({ error: "Åtgärden stöds inte i arbetsläget." }, { status: 400 });
  }

  const reportKind = text(body?.reportKind, 40);
  const priority = text(body?.priority, 20);
  const title = text(body?.title, 160);
  const description = text(body?.description, 2000);
  const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : null;
  const assetId = typeof body?.assetId === "string" && body.assetId ? body.assetId : null;

  if (
    !reportKinds.has(reportKind)
    || !reportPriorities.has(priority)
    || title.length < 2
    || title.length > 160
    || description.length < 2
    || description.length > 2000
    || (projectId !== null && !isUuid(projectId))
    || (assetId !== null && !isUuid(assetId))
    || (reportKind === "asset_issue" && !assetId)
    || (["project_blocker", "material_need", "safety_observation"].includes(reportKind) && !projectId)
  ) {
    return Response.json({ error: "Kontrollera rapportens typ, rubrik och beskrivning." }, { status: 400 });
  }

  if (projectId) {
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", projectId)
      .eq("active", true)
      .maybeSingle();
    if (!project) return Response.json({ error: "Projektet finns inte i företaget." }, { status: 404 });
  }

  if (assetId) {
    const [{ data: asset }, { data: loan }] = await Promise.all([
      context.supabase
        .from("assets")
        .select("id,responsible_worker_id")
        .eq("organization_id", context.organizationId)
        .eq("id", assetId)
        .eq("active", true)
        .maybeSingle(),
      context.supabase
        .from("asset_loans")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("asset_id", assetId)
        .eq("borrower_worker_id", context.worker.id)
        .in("status", ["active", "overdue"])
        .limit(1)
        .maybeSingle(),
    ]);
    if (!asset) return Response.json({ error: "Maskinen finns inte i företaget." }, { status: 404 });
    if (
      !operationsRoles.has(context.role)
      && asset.responsible_worker_id !== context.worker.id
      && !loan
    ) {
      return Response.json({ error: "Du kan bara rapportera på en maskin som är tilldelad eller utlånad till dig." }, { status: 403 });
    }
  }

  const { data, error } = await context.supabase
    .from("field_reports")
    .insert({
      organization_id: context.organizationId,
      worker_id: context.worker.id,
      project_id: projectId,
      asset_id: assetId,
      report_kind: reportKind,
      priority,
      title,
      description,
      status: "open",
      reported_by_user_id: context.userId,
    })
    .select("id,status,created_at")
    .single();

  if (error || !data) {
    if (missingFeature(error?.code)) {
      return Response.json(
        { error: "Rapporter från arbetsplatsen behöver installeras innan de kan sparas.", setupRequired: true },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Rapporten kunde inte sparas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json({ report: data }, { status: 201 });
}
