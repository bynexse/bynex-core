"use client";

import { useEffect } from "react";

const customerWorkspaceLabels = [
  "Kund 360",
  "Smart Price",
  "Avtal",
  "Ekonomi",
  "Support",
];

function normalizeLabel(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function enhanceHq(root: HTMLElement) {
  const sidebar = root.querySelector("aside");
  if (sidebar instanceof HTMLElement) {
    sidebar.style.maxHeight = "100dvh";
    sidebar.style.overflowY = "auto";
    sidebar.style.overscrollBehavior = "contain";
    sidebar.style.scrollbarGutter = "stable";
  }

  root.querySelectorAll<HTMLButtonElement>("button[disabled]").forEach((button) => {
    const label = normalizeLabel(button.textContent);
    const isCustomerWorkspace = customerWorkspaceLabels.some((item) =>
      label.startsWith(item),
    );
    if (!isCustomerWorkspace) return;

    button.disabled = false;
    button.removeAttribute("disabled");
    button.setAttribute(
      "title",
      "Öppna arbetsytan. Välj en kund i CRM när kundspecifika uppgifter behövs.",
    );
  });

  root.querySelectorAll<HTMLElement>("p").forEach((element) => {
    if (normalizeLabel(element.textContent) === "Beräknad MRR") {
      element.textContent = "Abonnemang per månad";
    }
  });
}

export default function HqUsabilityEnhancer() {
  useEffect(() => {
    const root = document.getElementById("bynex-hq-root");
    if (!root) return;

    enhanceHq(root);
    const observer = new MutationObserver(() => enhanceHq(root));
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
