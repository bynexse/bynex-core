"use client";

import { useEffect } from "react";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SELECTION_BYTES = 100 * 1024 * 1024;

function selectedFileReadError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  if (message.startsWith("Filen är för stor")) return message;
  if (message.startsWith("De valda filerna är för stora")) return message;
  if (message.startsWith("Filen kunde inte förberedas")) return message;
  return "Filen kunde inte läsas från enheten. Välj filen igen. Om den ligger i iCloud eller Google Drive behöver den först laddas ned lokalt.";
}

function asFileInput(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement)) return null;
  return target.type === "file" ? target : null;
}

function createTransfer() {
  if (typeof DataTransfer !== "function") return null;
  try {
    return new DataTransfer();
  } catch {
    return null;
  }
}

async function stageSelectedFiles(input: HTMLInputElement) {
  const selected = Array.from(input.files ?? []);
  if (!selected.length || input.hasAttribute("webkitdirectory")) return;

  input.dataset.bynexFileRead = "reading";
  input.setAttribute("aria-busy", "true");
  input.setCustomValidity("Filen förbereds för säker uppladdning…");

  try {
    const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_SELECTION_BYTES) {
      throw new Error("De valda filerna är för stora. Välj färre filer och försök igen.");
    }

    const staged: File[] = [];
    for (const file of selected) {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("Filen är för stor. Bynex stödjer högst 50 MB per fil.");
      }
      const buffer = await file.arrayBuffer();
      staged.push(
        new File([buffer], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        }),
      );
    }

    const transfer = createTransfer();
    if (!transfer) {
      throw new Error("Filen kunde inte förberedas i den här webbläsaren.");
    }
    for (const file of staged) transfer.items.add(file);
    input.files = transfer.files;
    input.dataset.bynexFileRead = "ready";
    input.setCustomValidity("");
  } catch (cause) {
    input.value = "";
    input.dataset.bynexFileRead = "failed";
    input.setCustomValidity(selectedFileReadError(cause));
    input.reportValidity();
  } finally {
    input.removeAttribute("aria-busy");
    if (input.isConnected) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

export default function SafeFileInputGuard() {
  useEffect(() => {
    const handleChange = (event: Event) => {
      if (!event.isTrusted) return;
      const input = asFileInput(event.target);
      if (!input?.files?.length) return;

      // Stop app-level handlers until the browser-backed file reference has
      // been copied into a memory-backed File that remains readable.
      event.stopImmediatePropagation();
      void stageSelectedFiles(input);
    };

    document.addEventListener("change", handleChange, true);
    return () => document.removeEventListener("change", handleChange, true);
  }, []);

  return null;
}
