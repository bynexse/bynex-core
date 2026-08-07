"use client";

import { Paperclip, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import BynexWorkspaceV2 from "@/components/BynexWorkspaceV2";
import BynexDocumentsDrawer, {
  documentContextFromModule,
  type DocumentContextType,
} from "@/components/documents/BynexDocumentsDrawer";
import type { CompanyContext } from "@/lib/company-context";

const documentContexts = new Set<DocumentContextType>([
  "general",
  "bookkeeping",
  "supplier_invoice",
  "customer_invoice",
  "quote",
  "change_order",
  "project",
  "customer_portal",
  "property",
]);

type DocumentOpenDetail = {
  context?: DocumentContextType;
  projectId?: string | null;
};

export default function BynexAppWithDocuments({
  enabledProductModules,
  company,
}: {
  enabledProductModules?: string[];
  company: CompanyContext;
}) {
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [initialContext, setInitialContext] =
    useState<DocumentContextType>("general");
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<DocumentOpenDetail>).detail ?? {};
      if (detail.context && documentContexts.has(detail.context)) {
        setInitialContext(detail.context);
      }
      setInitialProjectId(detail.projectId ?? null);
      setDocumentsOpen(true);
    };

    window.addEventListener("bynex:open-documents", handleOpen);
    return () => window.removeEventListener("bynex:open-documents", handleOpen);
  }, []);

  function openDocuments() {
    const activeModule = new URLSearchParams(window.location.search).get("module");
    setInitialContext(documentContextFromModule(activeModule));
    setInitialProjectId(null);
    setDocumentsOpen(true);
  }

  function documentsChanged() {
    window.dispatchEvent(new Event("bynex:documents-changed"));
  }

  return (
    <>
      <BynexWorkspaceV2
        enabledProductModules={enabledProductModules}
        company={company}
      />

      <button
        type="button"
        onClick={openDocuments}
        className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:bg-emerald-800 lg:bottom-6 lg:right-6"
        aria-label="Ladda upp dokument"
      >
        <UploadCloud className="h-5 w-5" />
        <span className="hidden sm:inline">Dokument</span>
        <Paperclip className="h-4 w-4 sm:hidden" />
      </button>

      <BynexDocumentsDrawer
        open={documentsOpen}
        onClose={() => setDocumentsOpen(false)}
        initialContext={initialContext}
        initialProjectId={initialProjectId}
        onChanged={documentsChanged}
      />
    </>
  );
}
