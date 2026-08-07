"use client";

import {
  BookOpenCheck,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  PackagePlus,
  Paperclip,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Panel = "time" | "diary" | "materials";
type AttachmentKind = "delivery_note" | "photo" | "receipt" | "other";

type Project = {
  id: string;
  project_number: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  status: string;
  active: boolean;
};

type Worker = {
  id: string;
  full_name: string;
  job_title: string | null;
  employment_type: string | null;
};

type WorkType = {
  id: string;
  name: string;
  billable: boolean;
  active: boolean;
};

type TimeEntry = {
  id: string;
  worker_id: string;
  project_id: string | null;
  work_type_id: string | null;
  clock_in: string;
  clock_out: string | null;
  status: string;
  note: string | null;
  source: string;
  approved_at: string | null;
  entry_mode: string;
  work_date: string;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

type Article = {
  id: string;
  supplier_name: string | null;
  article_number: string | null;
  name: string;
  unit: string;
  status: string;
};

type Attachment = {
  id: string;
  time_entry_id: string;
  project_id: string | null;
  document_id: string;
  attachment_kind: AttachmentKind;
  created_at: string;
};

type DocumentItem = {
  id: string;
  project_id: string | null;
  title: string;
  original_filename: string;
  category: string;
  mime_type: string;
  size_bytes: number | string;
  status: string;
  created_at: string;
};

type DeliveryNoteAnalysis = {
  id: string;
  time_entry_id: string;
  project_id: string;
  document_id: string;
  supplier_name: string | null;
  document_number: string | null;
  document_date: string | null;
  total_amount: number | string | null;
  confidence: number | string;
  proposed_lines: unknown[];
  reviewed_lines: unknown[] | null;
  missing_information: unknown[];
  status: string;
  duplicate_of_analysis_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialItem = {
  id: string;
  time_entry_id: string | null;
  project_id: string;
  article_number: string | null;
  name: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  status: string;
  source_kind: string;
  reconciliation_status: string;
  preferred_supplier: string | null;
};

type CapturePayload = {
  currentWorkerId: string | null;
  canManageTeam: boolean;
  projects: Array<Pick<Project, "id" | "project_number" | "name" | "status" | "active">>;
  workTypes: WorkType[];
  workers: Worker[];
  entries: TimeEntry[];
  articles: Article[];
  attachments: Attachment[];
  documents: DocumentItem[];
  deliveryNoteAnalyses: DeliveryNoteAnalysis[];
  materialItems: MaterialItem[];
  error?: string;
  setupRequired?: boolean;
};

type DailySettings = {
  manual_entry_policy: "manual_allowed" | "clock_required";
  gps_project_suggestion_enabled: boolean;
  daily_log_enabled: boolean;
  daily_log_required: boolean;
};

type DailyLog = {
  id: string;
  project_id: string;
  worker_id: string;
  time_entry_id: string | null;
  work_date: string;
  work_performed: string;
  blockers: string | null;
  next_steps: string | null;
  weather: string | null;
  crew_count: number | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  updated_at: string;
};

type DailyPayload = {
  currentWorkerId: string | null;
  canManageTeam: boolean;
  canChangePolicy: boolean;
  manualTimeAllowed: boolean;
  settings: DailySettings;
  projects: Project[];
  workers: Worker[];
  logs: DailyLog[];
  error?: string;
  setupRequired?: boolean;
};

type PreparedDocument = {
  duplicate?: boolean;
  document?: {
    id: string;
    storage_bucket?: string;
    storage_path?: string;
    status: string;
  };
  error?: string;
};

type DeliveryLine = {
  include: boolean;
  lineIndex: number;
  articleNumber: string;
  description: string;
  quantity: string;
  unit: string;
  unitPriceExVat: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
});

function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function numberText(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed).replace(".", ",") : "";
}

function durationLabel(entry: TimeEntry) {
  const minutes =
    entry.duration_minutes ??
    (entry.clock_out
      ? Math.max(
          0,
          Math.floor(
            (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) /
              60000,
          ),
        )
      : 0);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radius = 6_371_000;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fileMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return extension ? types[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function checksum(file: File) {
  return hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
}

function deliveryLine(raw: unknown, index: number): DeliveryLine {
  const row = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    include: row.include !== false,
    lineIndex: Number.isInteger(Number(row.lineIndex)) ? Number(row.lineIndex) : index,
    articleNumber: String(row.articleNumber ?? row.article_number ?? row.sku ?? ""),
    description: String(row.description ?? row.name ?? row.articleName ?? ""),
    quantity: numberText(row.quantity ?? row.qty),
    unit: String(row.unit ?? row.unitName ?? "st"),
    unitPriceExVat: numberText(
      row.unitPriceExVat ?? row.unit_price_ex_vat ?? row.lineUnitPrice ?? 0,
    ),
  };
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Utkast",
    submitted: "Skickad",
    reviewed: "Granskad",
    rejected: "Behöver rättas",
    proposed: "Smart-förslag",
    applied: "Registrerad",
    duplicate: "Redan registrerad",
    unmatched: "Väntar på faktura",
    matched_supplier_invoice: "Matchad mot faktura",
    suggested_match: "Kontrollera matchning",
  };
  return labels[value] ?? value;
}

export default function EmployeeFieldTimeDiary({
  initialName,
  initialCompanyName,
}: {
  initialName: string;
  initialCompanyName: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("time");
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [daily, setDaily] = useState<DailyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [workDate, setWorkDate] = useState(localDate());
  const [workerId, setWorkerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [hours, setHours] = useState("8");
  const [minutes, setMinutes] = useState("0");
  const [timeNote, setTimeNote] = useState("");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);

  const [diaryProjectId, setDiaryProjectId] = useState("");
  const [diaryWorkerId, setDiaryWorkerId] = useState("");
  const [diaryDate, setDiaryDate] = useState(localDate());
  const [workPerformed, setWorkPerformed] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [weather, setWeather] = useState("");
  const [crewCount, setCrewCount] = useState("");

  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [articleNumber, setArticleNumber] = useState("");
  const [articleName, setArticleName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("st");
  const [unitPrice, setUnitPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [attachmentKind, setAttachmentKind] =
    useState<AttachmentKind>("delivery_note");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reviewedLines, setReviewedLines] = useState<DeliveryLine[]>([]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [captureResponse, dailyResponse] = await Promise.all([
        fetch("/api/private/time/capture", { cache: "no-store" }),
        fetch("/api/private/time/daily", { cache: "no-store" }),
      ]);
      const [capturePayload, dailyPayload] = await Promise.all([
        captureResponse.json().catch(() => null) as Promise<CapturePayload | null>,
        dailyResponse.json().catch(() => null) as Promise<DailyPayload | null>,
      ]);
      if (!captureResponse.ok || !capturePayload) {
        throw new Error(capturePayload?.error ?? "Tid och artiklar kunde inte hämtas.");
      }
      if (!dailyResponse.ok || !dailyPayload) {
        throw new Error(dailyPayload?.error ?? "Projektdagboken kunde inte hämtas.");
      }
      setCapture(capturePayload);
      setDaily(dailyPayload);
      const currentWorker =
        dailyPayload.currentWorkerId ?? dailyPayload.workers[0]?.id ?? "";
      setWorkerId((current) => current || currentWorker);
      setDiaryWorkerId((current) => current || currentWorker);
      setProjectId((current) => current || dailyPayload.projects[0]?.id || "");
      setDiaryProjectId(
        (current) => current || dailyPayload.projects[0]?.id || "",
      );
      setWorkTypeId(
        (current) => current || capturePayload.workTypes[0]?.id || "",
      );
      const firstEntry = capturePayload.entries.find((entry) => entry.project_id);
      setSelectedEntryId((current) =>
        current && capturePayload.entries.some((entry) => entry.id === current)
          ? current
          : firstEntry?.id ?? capturePayload.entries[0]?.id ?? "",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Tid, dagbok och artiklar kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const projects = daily?.projects ?? [];
  const workers = daily?.workers ?? [];
  const entries = capture?.entries ?? [];
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedProject = projects.find(
    (project) => project.id === selectedEntry?.project_id,
  );
  const latestAnalysis = useMemo(
    () =>
      (capture?.deliveryNoteAnalyses ?? []).find(
        (analysis) => analysis.time_entry_id === selectedEntryId,
      ) ?? null,
    [capture?.deliveryNoteAnalyses, selectedEntryId],
  );

  useEffect(() => {
    if (!latestAnalysis) {
      setReviewedLines([]);
      return;
    }
    const source = latestAnalysis.reviewed_lines ?? latestAnalysis.proposed_lines;
    setReviewedLines(source.map(deliveryLine));
  }, [latestAnalysis]);

  useEffect(() => {
    if (!daily) return;
    const existing = daily.logs.find(
      (log) =>
        log.project_id === diaryProjectId &&
        log.worker_id === diaryWorkerId &&
        log.work_date === diaryDate,
    );
    setWorkPerformed(existing?.work_performed ?? "");
    setBlockers(existing?.blockers ?? "");
    setNextSteps(existing?.next_steps ?? "");
    setWeather(existing?.weather ?? "");
    setCrewCount(existing?.crew_count === null || existing?.crew_count === undefined
      ? ""
      : String(existing.crew_count));
  }, [daily, diaryDate, diaryProjectId, diaryWorkerId]);

  async function suggestProjectFromGps() {
    if (!daily?.settings.gps_project_suggestion_enabled) {
      setGpsMessage("Företaget har stängt av GPS-förslag.");
      return;
    }
    if (!navigator.geolocation) {
      setGpsMessage("Telefonen stödjer inte platsförslag.");
      return;
    }
    setBusy("gps");
    setGpsMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const candidates = projects
          .filter(
            (project) =>
              typeof project.latitude === "number" &&
              typeof project.longitude === "number",
          )
          .map((project) => ({
            project,
            distance: distanceMeters(current, {
              latitude: project.latitude as number,
              longitude: project.longitude as number,
            }),
          }))
          .sort((left, right) => left.distance - right.distance);
        const nearest = candidates[0];
        if (!nearest) {
          setGpsMessage("Inget aktivt projekt har en kartnål ännu.");
        } else {
          const radius = Math.max(nearest.project.geofence_radius_m || 250, 500);
          if (nearest.distance <= radius) {
            setProjectId(nearest.project.id);
            setDiaryProjectId(nearest.project.id);
            setGpsMessage(
              `Bynex Smart föreslår ${nearest.project.name} · ${Math.round(nearest.distance)} m bort.`,
            );
          } else {
            setGpsMessage(
              `Närmaste projekt är ${nearest.project.name}, ${Math.round(nearest.distance)} m bort. Välj det manuellt om det är rätt.`,
            );
          }
        }
        setBusy("");
      },
      () => {
        setGpsMessage(
          "Platsen kunde inte läsas. Tillåt plats för Bynex eller välj projekt manuellt.",
        );
        setBusy("");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  async function saveManualTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!daily?.manualTimeAllowed) return;
    setBusy("manual-time");
    setError(null);
    const response = await fetch("/api/private/time/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create_manual_time",
        workerId: workerId || null,
        projectId: projectId || null,
        workTypeId: workTypeId || null,
        workDate,
        hours: Number(hours),
        minutes: Number(minutes),
        note: timeNote,
        clientRequestId: crypto.randomUUID(),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { timeEntryId?: string; error?: string }
      | null;
    if (!response.ok || !payload?.timeEntryId) {
      setError(payload?.error ?? "Tiden kunde inte sparas.");
    } else {
      setSelectedEntryId(payload.timeEntryId);
      setDiaryProjectId(projectId);
      setDiaryWorkerId(workerId);
      setDiaryDate(workDate);
      setNotice("Tiden är sparad och kan nu kompletteras med dagbok, artiklar och bilagor.");
      setTimeNote("");
      await load(true);
    }
    setBusy("");
  }

  async function saveDiary(submit: boolean) {
    if (!diaryProjectId || !diaryWorkerId) {
      setError("Välj projekt och person för dagboken.");
      return;
    }
    setBusy(submit ? "submit-diary" : "save-diary");
    setError(null);
    const relatedEntry = entries.find(
      (entry) =>
        entry.project_id === diaryProjectId &&
        entry.worker_id === diaryWorkerId &&
        entry.work_date === diaryDate,
    );
    const response = await fetch("/api/private/time/daily", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_log",
        projectId: diaryProjectId,
        workerId: diaryWorkerId,
        timeEntryId: relatedEntry?.id ?? null,
        workDate: diaryDate,
        workPerformed,
        blockers,
        nextSteps,
        weather,
        crewCount,
        submit,
        clientRequestId: crypto.randomUUID(),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { dailyLogId?: string; error?: string }
      | null;
    if (!response.ok || !payload?.dailyLogId) {
      setError(payload?.error ?? "Dagboken kunde inte sparas.");
    } else {
      setNotice(
        submit
          ? "Dagboken är skickad och synlig för arbetsledningen dag för dag."
          : "Dagboksutkastet är sparat.",
      );
      await load(true);
    }
    setBusy("");
  }

  function articleSelected(value: string) {
    setArticleNumber(value);
    const match = (capture?.articles ?? []).find(
      (article) => article.article_number?.toLowerCase() === value.toLowerCase(),
    );
    if (!match) return;
    setArticleName(match.name);
    setUnit(match.unit);
    setSupplierName(match.supplier_name ?? "");
  }

  async function addArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEntryId) {
      setError("Välj en tidsregistrering först.");
      return;
    }
    setBusy("article");
    setError(null);
    const response = await fetch("/api/private/time/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add_article",
        timeEntryId: selectedEntryId,
        articleNumber,
        name: articleName,
        quantity,
        unit,
        unitPriceExVat: unitPrice,
        supplierName,
        clientRequestId: crypto.randomUUID(),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { materialItemId?: string; error?: string }
      | null;
    if (!response.ok || !payload?.materialItemId) {
      setError(payload?.error ?? "Artikeln kunde inte läggas till.");
    } else {
      setNotice(
        unitPrice
          ? "Artikeln är registrerad på projektet."
          : "Artikeln är registrerad och väntar på pris eller fakturamatchning.",
      );
      setArticleNumber("");
      setArticleName("");
      setQuantity("1");
      setUnit("st");
      setUnitPrice("");
      setSupplierName("");
      await load(true);
    }
    setBusy("");
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Filen får vara högst 25 MB.");
      return;
    }
    setSelectedFile(file);
    setError(null);
  }

  async function uploadAttachment() {
    if (!selectedEntry || !selectedFile) {
      setError("Välj tidsregistrering och fil först.");
      return;
    }
    if (!selectedEntry.project_id) {
      setError("Bilagor och följesedlar behöver vara kopplade till ett projekt.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Filuppladdningen är inte konfigurerad.");
      return;
    }
    const mimeType = fileMimeType(selectedFile);
    if (mimeType === "application/octet-stream") {
      setError("Filtypen stöds inte. Använd foto, PDF, PNG, WebP eller HEIC.");
      return;
    }

    setBusy("attachment");
    setError(null);
    try {
      const digest = await checksum(selectedFile);
      const category =
        attachmentKind === "delivery_note"
          ? "delivery_note"
          : attachmentKind === "photo"
            ? "photo"
            : attachmentKind === "receipt"
              ? "receipt"
              : "other";
      const preparedResponse = await fetch("/api/private/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare_upload",
          contextType: "project",
          category,
          title:
            attachmentKind === "delivery_note"
              ? `Följesedel ${selectedEntry.work_date}`
              : selectedFile.name.replace(/\.[^.]+$/, ""),
          fileName: selectedFile.name,
          mimeType,
          sizeBytes: selectedFile.size,
          checksumSha256: digest,
          projectId: selectedEntry.project_id,
          quoteId: null,
          changeOrderId: null,
          customerInvoiceId: null,
          propertyId: null,
          customerVisible: false,
          source: mimeType.startsWith("image/") ? "camera" : "upload",
        }),
      });
      const prepared = (await preparedResponse.json().catch(() => null)) as
        | PreparedDocument
        | null;
      if (!preparedResponse.ok || !prepared?.document) {
        throw new Error(prepared?.error ?? "Bilagan kunde inte förberedas.");
      }

      if (!prepared.duplicate) {
        if (!prepared.document.storage_bucket || !prepared.document.storage_path) {
          throw new Error("Lagringsplatsen saknas.");
        }
        const uploaded = await supabase.storage
          .from(prepared.document.storage_bucket)
          .upload(prepared.document.storage_path, selectedFile, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploaded.error) {
          throw new Error("Filen kunde inte laddas upp till den privata lagringen.");
        }
        const completedResponse = await fetch("/api/private/documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "complete_upload",
            documentId: prepared.document.id,
          }),
        });
        const completed = await completedResponse.json().catch(() => null);
        if (!completedResponse.ok) {
          throw new Error(
            completed?.error ?? "Filen sparades men kunde inte analyseras.",
          );
        }
      }

      const linkedResponse = await fetch("/api/private/time/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "link_attachment",
          timeEntryId: selectedEntry.id,
          documentId: prepared.document.id,
          attachmentKind,
        }),
      });
      const linked = await linkedResponse.json().catch(() => null);
      if (!linkedResponse.ok) {
        throw new Error(linked?.error ?? "Bilagan kunde inte kopplas till tiden.");
      }

      if (attachmentKind === "delivery_note") {
        const analysisResponse = await fetch("/api/private/time/capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "prepare_delivery_note",
            timeEntryId: selectedEntry.id,
            documentId: prepared.document.id,
          }),
        });
        const analysis = await analysisResponse.json().catch(() => null);
        if (!analysisResponse.ok) {
          throw new Error(
            analysis?.error ?? "Följesedeln kunde inte förberedas för kontroll.",
          );
        }
        setNotice(
          "Bynex Smart har läst följesedeln. Kontrollera artikelraderna innan de registreras.",
        );
      } else {
        setNotice("Bilagan är privat sparad och kopplad till tidsregistreringen.");
      }

      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bilagan kunde inte sparas.");
    } finally {
      setBusy("");
    }
  }

  function updateReviewedLine(index: number, patch: Partial<DeliveryLine>) {
    setReviewedLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  async function applyDeliveryNote() {
    if (!latestAnalysis) return;
    const included = reviewedLines.filter((line) => line.include);
    if (!included.length) {
      setError("Markera minst en artikelrad.");
      return;
    }
    setBusy("apply-delivery-note");
    setError(null);
    const response = await fetch("/api/private/time/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "apply_delivery_note",
        timeEntryId: latestAnalysis.time_entry_id,
        analysisId: latestAnalysis.id,
        reviewedLines: reviewedLines.map((line) => ({
          include: line.include,
          lineIndex: line.lineIndex,
          articleNumber: line.articleNumber || null,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceExVat: line.unitPriceExVat,
        })),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Följesedelns artiklar kunde inte registreras.");
    } else {
      setNotice(
        "Artikelraderna är registrerade en gång och väntar på säker matchning mot leverantörsfakturan.",
      );
      await load(true);
    }
    setBusy("");
  }

  const entryMaterials = (capture?.materialItems ?? []).filter(
    (item) => item.time_entry_id === selectedEntryId,
  );
  const entryAttachments = (capture?.attachments ?? []).filter(
    (attachment) => attachment.time_entry_id === selectedEntryId,
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed left-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#202522] px-4 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(27,31,29,.28)] bottom-[calc(6.1rem+env(safe-area-inset-bottom))] sm:left-6"
        >
          <BookOpenCheck className="h-4 w-4 text-[#93d6b5]" /> Tid & dagbok
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-sm">
          <section className="absolute inset-x-0 bottom-0 flex max-h-[96vh] min-h-[88vh] flex-col overflow-hidden rounded-t-[2.25rem] bg-[#f3f1eb] shadow-2xl sm:inset-y-4 sm:left-4 sm:right-auto sm:max-h-none sm:min-h-0 sm:w-[620px] sm:rounded-[2.25rem]">
            <header className="relative overflow-hidden bg-[#202522] px-5 pb-5 pt-[calc(1.1rem+env(safe-area-inset-top))] text-white sm:pt-6">
              <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[#84d1ad]/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9de0be]">
                    {initialCompanyName}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    Tid, dagbok & material
                  </h2>
                  <p className="mt-1 text-xs text-white/55">
                    {initialName} · ett enkelt fältflöde
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    disabled={loading}
                    className="rounded-xl p-3 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    aria-label="Uppdatera"
                  >
                    <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl p-3 text-white/70 hover:bg-white/10 hover:text-white"
                    aria-label="Stäng"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-white/7 p-1.5">
                {([
                  ["time", "Tid", Clock3],
                  ["diary", "Dagbok", BookOpenCheck],
                  ["materials", "Material", PackagePlus],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPanel(value)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition ${
                      panel === value
                        ? "bg-[#84d1ad] text-[#142019]"
                        : "text-white/65 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
              {loading && !capture ? (
                <div className="grid min-h-64 place-items-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#376e54]" />
                    <p className="mt-3 text-sm font-semibold text-zinc-600">
                      Hämtar dagens arbetsflöde…
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {notice && (
                    <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
                      {notice}
                    </p>
                  )}
                  {error && (
                    <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p>{error}</p>
                      <button type="button" onClick={() => setError(null)} aria-label="Stäng fel">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {panel === "time" && daily && capture && (
                    <div className="space-y-4">
                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5 shadow-[0_10px_28px_rgba(31,36,33,.06)]">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 h-5 w-5 text-[#376e54]" />
                          <div>
                            <p className="font-semibold">
                              {daily.settings.manual_entry_policy === "clock_required"
                                ? "Företaget kräver in- och utstämpling"
                                : "Manuell tid är tillåten"}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                              Arbetsledningen bestämmer tidsregeln. Projektdagboken kan användas oavsett metod.
                            </p>
                          </div>
                        </div>
                      </div>

                      {daily.manualTimeAllowed ? (
                        <form
                          onSubmit={saveManualTime}
                          className="rounded-[1.75rem] border border-black/7 bg-white p-5 shadow-[0_10px_28px_rgba(31,36,33,.06)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#376e54]">
                                Manuell tid
                              </p>
                              <h3 className="mt-1 text-xl font-semibold">Timmar och minuter</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => void suggestProjectFromGps()}
                              disabled={busy === "gps"}
                              className="inline-flex items-center gap-2 rounded-xl border border-[#cfe6d9] bg-[#edf7f1] px-3 py-2 text-xs font-semibold text-[#29543f] disabled:opacity-50"
                            >
                              {busy === "gps" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MapPin className="h-4 w-4" />
                              )}
                              Hitta projekt
                            </button>
                          </div>
                          {gpsMessage && (
                            <p className="mt-3 rounded-xl bg-[#edf7f1] p-3 text-xs leading-5 text-[#29543f]">
                              {gpsMessage}
                            </p>
                          )}

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <label className="text-xs font-semibold text-zinc-600">
                              Datum
                              <input
                                type="date"
                                value={workDate}
                                onChange={(event) => setWorkDate(event.target.value)}
                                className="input mt-2"
                                required
                              />
                            </label>
                            {daily.canManageTeam ? (
                              <label className="text-xs font-semibold text-zinc-600">
                                Person
                                <select
                                  value={workerId}
                                  onChange={(event) => setWorkerId(event.target.value)}
                                  className="input mt-2"
                                  required
                                >
                                  {workers.map((worker) => (
                                    <option key={worker.id} value={worker.id}>
                                      {worker.full_name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div />
                            )}
                            <label className="col-span-2 text-xs font-semibold text-zinc-600">
                              Projekt
                              <select
                                value={projectId}
                                onChange={(event) => setProjectId(event.target.value)}
                                className="input mt-2"
                              >
                                <option value="">Intern tid / inget projekt</option>
                                {projects.map((project) => (
                                  <option key={project.id} value={project.id}>
                                    {project.name} · {project.project_number}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="col-span-2 text-xs font-semibold text-zinc-600">
                              Arbetsmoment
                              <select
                                value={workTypeId}
                                onChange={(event) => setWorkTypeId(event.target.value)}
                                className="input mt-2"
                              >
                                <option value="">Ordinarie arbete</option>
                                {capture.workTypes.map((workType) => (
                                  <option key={workType.id} value={workType.id}>
                                    {workType.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs font-semibold text-zinc-600">
                              Timmar
                              <input
                                type="number"
                                min={0}
                                max={24}
                                value={hours}
                                onChange={(event) => setHours(event.target.value)}
                                className="input mt-2 text-center text-xl font-semibold"
                                required
                              />
                            </label>
                            <label className="text-xs font-semibold text-zinc-600">
                              Minuter
                              <input
                                type="number"
                                min={0}
                                max={59}
                                value={minutes}
                                onChange={(event) => setMinutes(event.target.value)}
                                className="input mt-2 text-center text-xl font-semibold"
                                required
                              />
                            </label>
                          </div>
                          <textarea
                            value={timeNote}
                            onChange={(event) => setTimeNote(event.target.value)}
                            maxLength={2000}
                            className="input mt-3 min-h-20"
                            placeholder="Kort anteckning, valfritt"
                          />
                          <button
                            disabled={busy === "manual-time"}
                            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy === "manual-time" ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Save className="h-5 w-5 text-[#9de0be]" />
                            )}
                            Spara tid
                          </button>
                        </form>
                      ) : (
                        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5">
                          <p className="font-semibold text-amber-950">Stämpla in och ut i Tid</p>
                          <p className="mt-2 text-sm leading-6 text-amber-900">
                            Manuell registrering är spärrad för anställda. Arbetsledningen kan fortfarande göra en tydligt loggad rättelse.
                          </p>
                        </div>
                      )}

                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5">
                        <h3 className="font-semibold">Senaste tid</h3>
                        <div className="mt-3 space-y-2">
                          {entries.slice(0, 8).map((entry) => {
                            const project = projects.find((item) => item.id === entry.project_id);
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEntryId(entry.id);
                                  setPanel("materials");
                                }}
                                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 text-left"
                              >
                                <span>
                                  <span className="block text-sm font-semibold">
                                    {project?.name ?? "Intern tid"}
                                  </span>
                                  <span className="mt-1 block text-xs text-zinc-500">
                                    {entry.work_date} · {entry.entry_mode === "manual" ? "Manuell" : "Stämplad"}
                                  </span>
                                </span>
                                <span className="font-mono text-xs font-semibold">
                                  {durationLabel(entry)}
                                </span>
                              </button>
                            );
                          })}
                          {!entries.length && (
                            <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                              Ingen tid registrerad ännu.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {panel === "diary" && daily && (
                    <div className="space-y-4">
                      <div className="rounded-[1.75rem] border border-[#cfe6d9] bg-[#edf7f1] p-5">
                        <div className="flex gap-3">
                          <BookOpenCheck className="mt-0.5 h-5 w-5 text-[#376e54]" />
                          <div>
                            <h3 className="font-semibold text-[#203c2e]">Projektets dagbok</h3>
                            <p className="mt-1 text-sm leading-6 text-[#426b55]">
                              Vad som gjordes, hinder och nästa steg följer projektet dag för dag och blir synligt för arbetsledningen.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5 shadow-[0_10px_28px_rgba(31,36,33,.06)]">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="col-span-2 text-xs font-semibold text-zinc-600">
                            Projekt
                            <select
                              value={diaryProjectId}
                              onChange={(event) => setDiaryProjectId(event.target.value)}
                              className="input mt-2"
                              required
                            >
                              <option value="">Välj projekt</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name} · {project.project_number}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-zinc-600">
                            Datum
                            <input
                              type="date"
                              value={diaryDate}
                              onChange={(event) => setDiaryDate(event.target.value)}
                              className="input mt-2"
                            />
                          </label>
                          {daily.canManageTeam ? (
                            <label className="text-xs font-semibold text-zinc-600">
                              Person
                              <select
                                value={diaryWorkerId}
                                onChange={(event) => setDiaryWorkerId(event.target.value)}
                                className="input mt-2"
                              >
                                {workers.map((worker) => (
                                  <option key={worker.id} value={worker.id}>
                                    {worker.full_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <div />
                          )}
                        </div>
                        <label className="mt-4 block text-xs font-semibold text-zinc-600">
                          Vad gjorde vi idag? *
                          <textarea
                            value={workPerformed}
                            onChange={(event) => setWorkPerformed(event.target.value)}
                            maxLength={5000}
                            className="input mt-2 min-h-32"
                            placeholder="Exempel: Regling plan 2, 34 löpmeter. Två fönster monterade."
                          />
                        </label>
                        <label className="mt-3 block text-xs font-semibold text-zinc-600">
                          Hinder eller avvikelse
                          <textarea
                            value={blockers}
                            onChange={(event) => setBlockers(event.target.value)}
                            maxLength={3000}
                            className="input mt-2 min-h-20"
                            placeholder="Leverans saknades, väntan på beslut, arbetsmiljörisk…"
                          />
                        </label>
                        <label className="mt-3 block text-xs font-semibold text-zinc-600">
                          Nästa steg
                          <textarea
                            value={nextSteps}
                            onChange={(event) => setNextSteps(event.target.value)}
                            maxLength={3000}
                            className="input mt-2 min-h-20"
                            placeholder="Det här gör vi nästa arbetsdag"
                          />
                        </label>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="text-xs font-semibold text-zinc-600">
                            Väder
                            <input
                              value={weather}
                              onChange={(event) => setWeather(event.target.value)}
                              maxLength={160}
                              className="input mt-2"
                              placeholder="Sol, 14 °C"
                            />
                          </label>
                          <label className="text-xs font-semibold text-zinc-600">
                            Bemanning
                            <input
                              type="number"
                              min={0}
                              max={10000}
                              value={crewCount}
                              onChange={(event) => setCrewCount(event.target.value)}
                              className="input mt-2"
                              placeholder="Antal"
                            />
                          </label>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void saveDiary(false)}
                            disabled={Boolean(busy)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-4 text-sm font-semibold disabled:opacity-50"
                          >
                            {busy === "save-diary" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Spara utkast
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveDiary(true)}
                            disabled={Boolean(busy)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#202522] px-4 py-4 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy === "submit-diary" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-[#9de0be]" />
                            )}
                            Skicka dagbok
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5">
                        <h3 className="font-semibold">Senaste dagböcker</h3>
                        <div className="mt-3 space-y-3">
                          {daily.logs.slice(0, 10).map((log) => {
                            const project = projects.find((item) => item.id === log.project_id);
                            const worker = workers.find((item) => item.id === log.worker_id);
                            return (
                              <article key={log.id} className="rounded-2xl border border-zinc-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{project?.name ?? "Projekt"}</p>
                                    <p className="mt-1 text-xs text-zinc-500">
                                      {log.work_date} · {worker?.full_name ?? "Medarbetare"}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                                    {statusLabel(log.status)}
                                  </span>
                                </div>
                                <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
                                  {log.work_performed || "Tomt utkast"}
                                </p>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {panel === "materials" && capture && (
                    <div className="space-y-4">
                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5">
                        <label className="text-xs font-semibold text-zinc-600">
                          Tidskort / arbetsdag
                          <select
                            value={selectedEntryId}
                            onChange={(event) => setSelectedEntryId(event.target.value)}
                            className="input mt-2"
                          >
                            <option value="">Välj registrering</option>
                            {entries.map((entry) => {
                              const project = projects.find((item) => item.id === entry.project_id);
                              return (
                                <option key={entry.id} value={entry.id}>
                                  {entry.work_date} · {project?.name ?? "Intern tid"} · {durationLabel(entry)}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        {selectedEntry && (
                          <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                            {selectedProject?.name ?? "Intern tid"} · {selectedEntry.work_date} · {durationLabel(selectedEntry)}
                          </p>
                        )}
                      </div>

                      <form
                        onSubmit={addArticle}
                        className="rounded-[1.75rem] border border-black/7 bg-white p-5 shadow-[0_10px_28px_rgba(31,36,33,.06)]"
                      >
                        <div className="flex items-center gap-3">
                          <PackagePlus className="h-5 w-5 text-[#376e54]" />
                          <div>
                            <p className="font-semibold">Lägg till artikel</p>
                            <p className="text-xs text-zinc-500">Bynex återanvänder artikelregistret när en träff finns.</p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <label className="text-xs font-semibold text-zinc-600">
                            Artikelnummer
                            <input
                              list="bynex-field-articles"
                              value={articleNumber}
                              onChange={(event) => articleSelected(event.target.value)}
                              className="input mt-2"
                              maxLength={160}
                            />
                            <datalist id="bynex-field-articles">
                              {capture.articles.map((article) => (
                                <option
                                  key={article.id}
                                  value={article.article_number ?? article.name}
                                >
                                  {article.name}
                                </option>
                              ))}
                            </datalist>
                          </label>
                          <label className="text-xs font-semibold text-zinc-600">
                            Leverantör
                            <input
                              value={supplierName}
                              onChange={(event) => setSupplierName(event.target.value)}
                              className="input mt-2"
                              maxLength={240}
                            />
                          </label>
                          <label className="col-span-2 text-xs font-semibold text-zinc-600">
                            Artikelnamn *
                            <input
                              value={articleName}
                              onChange={(event) => setArticleName(event.target.value)}
                              className="input mt-2"
                              maxLength={240}
                              required
                            />
                          </label>
                          <label className="text-xs font-semibold text-zinc-600">
                            Mängd *
                            <input
                              value={quantity}
                              onChange={(event) => setQuantity(event.target.value)}
                              inputMode="decimal"
                              className="input mt-2"
                              required
                            />
                          </label>
                          <label className="text-xs font-semibold text-zinc-600">
                            Enhet *
                            <input
                              value={unit}
                              onChange={(event) => setUnit(event.target.value)}
                              className="input mt-2"
                              maxLength={24}
                              required
                            />
                          </label>
                          <label className="col-span-2 text-xs font-semibold text-zinc-600">
                            Inköpspris exkl. moms, valfritt
                            <input
                              value={unitPrice}
                              onChange={(event) => setUnitPrice(event.target.value)}
                              inputMode="decimal"
                              className="input mt-2"
                              placeholder="Lämna tomt för fakturamatchning"
                            />
                          </label>
                        </div>
                        <button
                          disabled={!selectedEntryId || busy === "article"}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === "article" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <PackagePlus className="h-5 w-5 text-[#9de0be]" />
                          )}
                          Registrera artikel
                        </button>
                      </form>

                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5 shadow-[0_10px_28px_rgba(31,36,33,.06)]">
                        <div className="flex items-center gap-3">
                          <Camera className="h-5 w-5 text-[#376e54]" />
                          <div>
                            <p className="font-semibold">Foto eller bilaga</p>
                            <p className="text-xs text-zinc-500">Fota följesedeln direkt med telefonen.</p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <label className="text-xs font-semibold text-zinc-600">
                            Typ
                            <select
                              value={attachmentKind}
                              onChange={(event) =>
                                setAttachmentKind(event.target.value as AttachmentKind)
                              }
                              className="input mt-2"
                            >
                              <option value="delivery_note">Följesedel</option>
                              <option value="photo">Foto</option>
                              <option value="receipt">Kvitto</option>
                              <option value="other">Annan bilaga</option>
                            </select>
                          </label>
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#9fcbb3] bg-[#edf7f1] px-3 py-3 text-xs font-semibold text-[#29543f]">
                            <Paperclip className="h-4 w-4" />
                            {selectedFile ? selectedFile.name : "Välj / ta foto"}
                            <input
                              ref={fileInput}
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                              capture="environment"
                              onChange={fileChanged}
                              className="sr-only"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => void uploadAttachment()}
                          disabled={!selectedEntryId || !selectedFile || busy === "attachment"}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === "attachment" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <FileText className="h-5 w-5 text-[#9de0be]" />
                          )}
                          {attachmentKind === "delivery_note" ? "Läs följesedel" : "Spara bilaga"}
                        </button>
                      </div>

                      {latestAnalysis && (
                        <div className="rounded-[1.75rem] border border-[#cfe6d9] bg-[#edf7f1] p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex gap-3">
                              <Sparkles className="mt-0.5 h-5 w-5 text-[#376e54]" />
                              <div>
                                <p className="font-semibold text-[#203c2e]">Bynex Smart-förslag</p>
                                <p className="mt-1 text-xs text-[#426b55]">
                                  {latestAnalysis.supplier_name ?? "Leverantör ej säker"}
                                  {latestAnalysis.document_number
                                    ? ` · ${latestAnalysis.document_number}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#29543f]">
                              {statusLabel(latestAnalysis.status)}
                            </span>
                          </div>

                          {latestAnalysis.status === "duplicate" ? (
                            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                              Samma följesedel finns redan. Inga artikelrader skapas igen.
                            </p>
                          ) : latestAnalysis.status === "applied" ? (
                            <p className="mt-4 rounded-xl bg-white p-3 text-sm text-[#29543f]">
                              Artikelraderna är registrerade och skyddade mot dubbelregistrering.
                            </p>
                          ) : (
                            <>
                              <div className="mt-4 space-y-3">
                                {reviewedLines.map((line, index) => (
                                  <div key={`${line.lineIndex}-${index}`} className="rounded-2xl bg-white p-3">
                                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                                      <input
                                        type="checkbox"
                                        checked={line.include}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { include: event.target.checked })
                                        }
                                      />
                                      Ta med raden
                                    </label>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      <input
                                        value={line.articleNumber}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { articleNumber: event.target.value })
                                        }
                                        className="input"
                                        placeholder="Artikelnummer"
                                      />
                                      <input
                                        value={line.unit}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { unit: event.target.value })
                                        }
                                        className="input"
                                        placeholder="Enhet"
                                      />
                                      <input
                                        value={line.description}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { description: event.target.value })
                                        }
                                        className="input col-span-2"
                                        placeholder="Artikelnamn"
                                      />
                                      <input
                                        value={line.quantity}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { quantity: event.target.value })
                                        }
                                        inputMode="decimal"
                                        className="input"
                                        placeholder="Mängd"
                                      />
                                      <input
                                        value={line.unitPriceExVat}
                                        onChange={(event) =>
                                          updateReviewedLine(index, { unitPriceExVat: event.target.value })
                                        }
                                        inputMode="decimal"
                                        className="input"
                                        placeholder="Pris exkl. moms"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {!reviewedLines.length && (
                                <p className="mt-4 rounded-xl bg-white p-3 text-sm text-zinc-600">
                                  Inga säkra artikelrader kunde läsas. Lägg till artiklar manuellt ovan.
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => void applyDeliveryNote()}
                                disabled={!reviewedLines.length || busy === "apply-delivery-note"}
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {busy === "apply-delivery-note" ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-5 w-5 text-[#9de0be]" />
                                )}
                                Kontrollera och registrera
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="rounded-[1.75rem] border border-black/7 bg-white p-5">
                        <h3 className="font-semibold">Registrerat på arbetsdagen</h3>
                        <div className="mt-3 space-y-2">
                          {entryMaterials.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-zinc-200 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">{item.name}</p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {numberText(item.quantity)} {item.unit}
                                    {item.article_number ? ` · ${item.article_number}` : ""}
                                  </p>
                                </div>
                                <span className="text-xs font-semibold">
                                  {Number(item.unit_price) > 0
                                    ? money.format(Number(item.unit_price))
                                    : "Pris väntar"}
                                </span>
                              </div>
                              <p className="mt-2 text-[11px] font-semibold text-[#376e54]">
                                {statusLabel(item.reconciliation_status)}
                              </p>
                            </div>
                          ))}
                          {entryAttachments.map((attachment) => {
                            const document = capture.documents.find(
                              (item) => item.id === attachment.document_id,
                            );
                            return (
                              <div key={attachment.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
                                <Paperclip className="h-4 w-4 text-zinc-500" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {document?.title ?? "Bilaga"}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {attachment.attachment_kind.replace("_", " ")}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {!entryMaterials.length && !entryAttachments.length && (
                            <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                              Inga artiklar eller bilagor ännu.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
