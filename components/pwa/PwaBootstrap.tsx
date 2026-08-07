"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const dismissKey = "bynex:pwa-install-dismissed";

function runsStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function installRelevant(pathname: string) {
  return (
    pathname.startsWith("/app") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/parmen")
  );
}

export default function PwaBootstrap() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installVisible, setInstallVisible] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    setOffline(!window.navigator.onLine);

    const online = () => setOffline(false);
    const offlineListener = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineListener);

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      const prompt = event as InstallPromptEvent;
      setInstallPrompt(prompt);
      if (
        !runsStandalone() &&
        installRelevant(pathname) &&
        window.sessionStorage.getItem(dismissKey) !== "1"
      ) {
        window.setTimeout(() => setInstallVisible(true), 1200);
      }
    };

    const installed = () => {
      setInstallPrompt(null);
      setInstallVisible(false);
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);

    let registration: ServiceWorkerRegistration | null = null;
    let updateTimer: number | null = null;

    async function register() {
      if (
        process.env.NODE_ENV !== "production" ||
        !("serviceWorker" in window.navigator)
      ) {
        return;
      }

      try {
        registration = await window.navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (registration.waiting) {
          waitingWorker.current = registration.waiting;
          setUpdateReady(true);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              window.navigator.serviceWorker.controller
            ) {
              waitingWorker.current = registration?.waiting ?? installing;
              setUpdateReady(true);
            }
          });
        });

        await registration.update().catch(() => undefined);
        updateTimer = window.setInterval(
          () => void registration?.update().catch(() => undefined),
          60 * 60 * 1000,
        );
      } catch (reason) {
        console.warn("Bynex PWA kunde inte registreras:", reason);
      }
    }

    void register();

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineListener);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      if (updateTimer !== null) window.clearInterval(updateTimer);
    };
  }, [pathname]);

  useEffect(() => {
    if (
      installPrompt &&
      !runsStandalone() &&
      installRelevant(pathname) &&
      window.sessionStorage.getItem(dismissKey) !== "1"
    ) {
      setInstallVisible(true);
    }
  }, [installPrompt, pathname]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setInstallVisible(false);
  }

  function dismissInstall() {
    window.sessionStorage.setItem(dismissKey, "1");
    setInstallVisible(false);
  }

  function applyUpdate() {
    const worker = waitingWorker.current;
    if (!worker) {
      window.location.reload();
      return;
    }

    setUpdating(true);
    window.navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <>
      {offline && (
        <div className="fixed inset-x-3 top-3 z-[120] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-xl">
          <WifiOff className="h-4 w-4 shrink-0" />
          <p>
            Du är offline. Sparade företagsuppgifter visas inte ur cache; anslut igen
            innan du registrerar tid, faktura, lön eller dokument.
          </p>
        </div>
      )}

      {updateReady && (
        <div className="fixed bottom-24 left-3 right-3 z-[115] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-2xl bg-zinc-950 p-4 text-sm text-white shadow-2xl md:bottom-5">
          <div>
            <p className="font-semibold">En ny Bynex-version är klar</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">
              Uppdatera när du har sparat det du arbetar med.
            </p>
          </div>
          <button
            type="button"
            disabled={updating}
            onClick={applyUpdate}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-zinc-950 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            {updating ? "Uppdaterar" : "Uppdatera"}
          </button>
        </div>
      )}

      {installVisible && installPrompt && !updateReady && (
        <div className="fixed bottom-24 left-3 right-3 z-[110] mx-auto max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl md:bottom-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Bynex PWA</p>
              <h2 className="mt-1 text-xl font-semibold">Installera Bynex på enheten</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Öppna Bynex som en app från hemskärmen. Företags- och personuppgifter
                cachas inte av offlinefunktionen.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissInstall}
              aria-label="Stäng installationsförslag"
              className="rounded-xl bg-zinc-100 p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void install()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3.5 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" /> Installera Bynex
          </button>
        </div>
      )}
    </>
  );
}
