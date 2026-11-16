"use client";

import { useEffect, useRef, useState } from "react";
import ShareAppButton from "@/components/share-app-button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaRuntime() {
  const [updateReady, setUpdateReady] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [iosInstallHelp, setIosInstallHelp] = useState(false);
  const installPrompt = useRef<InstallPromptEvent | null>(null);
  const applyUpdate = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;

    const onControllerChange = () => {
      if (applyUpdate.current) window.location.reload();
    };

    const onUpdateFound = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          Boolean(navigator.serviceWorker.controller) &&
          registration?.waiting
        ) {
          setUpdateReady(true);
        }
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => {
        if (disposed) return;
        registration = value;
        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }
        registration.addEventListener("updatefound", onUpdateFound);
        void registration.update().catch(() => undefined);
      })
      .catch(() => {
        // PWA registration is an enhancement; the web application remains usable.
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event as InstallPromptEvent;
      setInstallAvailable(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

    if (isIos && !isStandalone) setInstallAvailable(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function installApp() {
    if (!installPrompt.current) {
      setIosInstallHelp(true);
      return;
    }
    await installPrompt.current.prompt();
    const choice = await installPrompt.current.userChoice;
    if (choice.outcome === "accepted") setInstallAvailable(false);
    installPrompt.current = null;
  }

  function refreshForUpdate() {
    navigator.serviceWorker.getRegistration("/").then((registration) => {
      if (!registration?.waiting) return;
      applyUpdate.current = true;
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }

  return (
    <>
      {installAvailable && (
        <aside className="pwa-action" aria-label="Install Digi Biashara">
          <span className="pwa-action-copy">
            <strong>Install Digi Biashara</strong>
            <small>Open your business workspace directly from your device.</small>
          </span>
          <button type="button" className="pwa-action-button" onClick={installApp}>
            Install
          </button>
          <button type="button" className="pwa-action-close" aria-label="Dismiss install prompt" onClick={() => setInstallAvailable(false)}>
            ×
          </button>
        </aside>
      )}

      {iosInstallHelp && (
        <div className="pwa-modal-backdrop" role="presentation" onClick={() => setIosInstallHelp(false)}>
          <section className="pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pwa-action-close" aria-label="Close" onClick={() => setIosInstallHelp(false)}>×</button>
            <strong id="pwa-ios-title">Add Digi Biashara to your Home Screen</strong>
            <p>In Safari, tap the Share button, choose “Add to Home Screen”, then tap “Add”.</p>
            <button type="button" className="pwa-action-button" onClick={() => setIosInstallHelp(false)}>Got it</button>
          </section>
        </div>
      )}

      {updateReady && (
        <aside className="pwa-action pwa-update" role="status">
          <span className="pwa-action-copy">
            <strong>A Digi Biashara update is ready</strong>
            <small>Refresh when you are ready. Unsaved work will be interrupted by a reload.</small>
          </span>
          <button type="button" className="pwa-action-button" onClick={refreshForUpdate}>
            Refresh
          </button>
          <button type="button" className="pwa-action-close" aria-label="Dismiss update notice" onClick={() => setUpdateReady(false)}>
            ×
          </button>
        </aside>
      )}
    </>
  );
}
