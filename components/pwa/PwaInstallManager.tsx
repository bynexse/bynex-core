"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share2, WifiOff, X } from "lucide-react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

const DISMISS_KEY = "bynex:pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

function recentlyDismissed() {
  try {
    const value = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return value > 0 && Date.now() - value < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaInstallManager() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [online, setOnline] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true ||
      document.referrer.startsWith("android-app://");
    setInstalled(standalone);
    setOnline(navigator.onLine);
    setDismissed(recentlyDismissed());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const registerServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    };

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      if (!recentlyDismissed()) setDismissed(false);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setDismissed(true);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("load", registerServiceWorker, { once: true });
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (document.readyState === "complete") registerServiceWorker();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const canShowIosHelp = useMemo(
    () => ios && !installed && !dismissed && !installPrompt,
    [dismissed, installPrompt, installed, ios],
  );

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Installation remains optional even when local storage is unavailable.
    }
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setDismissed(true);
    } else {
      dismiss();
    }
    setInstallPrompt(null);
  }

  if (!online) {
    return (
      <div className="fixed bottom-4 left-1/2 z-[100] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl" role="status">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Du är offline. Bynex visar ingen gammal kunddata och försöker ansluta igen.</span>
      </div>
    );
  }

  if (installed || dismissed || (!installPrompt && !canShowIosHelp)) return null;

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl rounded-[1.6rem] border border-zinc-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-5 sm:max-w-md" aria-label="Installera Bynex">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-zinc-950 p-3 text-white">
          {canShowIosHelp ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Lägg Bynex på hemskärmen</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            {canShowIosHelp
              ? "Tryck på Dela i Safari och välj Lägg till på hemskärmen."
              : "Öppna Bynex som en app med snabbstart till Tid, Projekt och ÄTA."}
          </p>
          {!canShowIosHelp && (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-3 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
            >
              Installera Bynex
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Stäng installationsförslaget">
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
