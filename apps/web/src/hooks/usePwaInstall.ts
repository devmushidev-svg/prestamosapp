import { useCallback, useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

type InstallState = {
  appShellReady: boolean;
  installing: boolean;
  isEmbeddedBrowser: boolean;
  isIos: boolean;
  outcome: InstallOutcome | null;
  registrationError: string;
  secureContext: boolean;
  serviceWorkerSupported: boolean;
  standalone: boolean;
  updateAvailable: boolean;
  updating: boolean;
};

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice() {
  const touchEnabledMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || touchEnabledMac;
}

function isEmbeddedBrowser() {
  return /; wv\)|\bwv\b|FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\//i.test(navigator.userAgent);
}

function hasServiceWorkerControl() {
  return "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);
}

let initialized = false;
let installPrompt: BeforeInstallPromptEvent | null = null;
let applyServiceWorkerUpdate: (() => Promise<void>) | null = null;
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let lastUpdateCheck = 0;
let reloadingForUpdate = false;
let updateActivationTimeoutId: number | null = null;
let state: InstallState | null = null;
const listeners = new Set<(next: InstallState) => void>();

const UPDATE_CHECK_THROTTLE_MS = 60_000;

function currentState(): InstallState {
  state ??= {
    appShellReady: hasServiceWorkerControl(),
    installing: false,
    isEmbeddedBrowser: isEmbeddedBrowser(),
    isIos: isIosDevice(),
    outcome: null,
    registrationError: "",
    secureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    standalone: isStandaloneMode(),
    updateAvailable: false,
    updating: false,
  };
  return state;
}

function publish(patch: Partial<InstallState>) {
  state = { ...currentState(), ...patch };
  listeners.forEach((listener) => listener(state!));
}

function detectWaitingUpdate(registration?: ServiceWorkerRegistration | null) {
  if (registration?.waiting) publish({ updateAvailable: true });
}

async function checkForServiceWorkerUpdate(force = false) {
  const registration = serviceWorkerRegistration;
  if (!registration || !navigator.onLine) return;

  detectWaitingUpdate(registration);
  const now = Date.now();
  if (!force && now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
  lastUpdateCheck = now;

  try {
    await registration.update();
    detectWaitingUpdate(registration);
  } catch {
    // La comprobación se repetirá al recuperar conexión o visibilidad.
  }
}

function reloadForServiceWorkerUpdate() {
  if (reloadingForUpdate) return;
  reloadingForUpdate = true;
  if (updateActivationTimeoutId !== null) {
    window.clearTimeout(updateActivationTimeoutId);
    updateActivationTimeoutId = null;
  }
  window.location.reload();
}

/**
 * Se ejecuta desde main.tsx para no perder el evento beforeinstallprompt antes
 * de que la página de Ajustes (que es lazy) llegue a montarse.
 */
export function initializePwaInstallCapture() {
  if (initialized) return;
  initialized = true;
  currentState();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    publish({ outcome: null });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ standalone: true, installing: false, outcome: "accepted" });
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
    publish({ standalone: isStandaloneMode() });
  });

  if (!window.isSecureContext) {
    publish({ registrationError: "La aplicación necesita abrirse desde una dirección HTTPS segura." });
    return;
  }
  if (!("serviceWorker" in navigator)) {
    publish({ registrationError: "Este navegador no permite guardar la aplicación para usarla sin Internet." });
    return;
  }

  let hadServiceWorkerControl = hasServiceWorkerControl();
  const publishControlState = () => {
    if (hasServiceWorkerControl()) publish({ appShellReady: true, registrationError: "" });
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const hasControl = hasServiceWorkerControl();
    publishControlState();
    if (hadServiceWorkerControl && hasControl) reloadForServiceWorkerUpdate();
    hadServiceWorkerControl = hasControl;
  });

  const registerUpdateChecks = (registration?: ServiceWorkerRegistration) => {
    publishControlState();
    if (!registration) return;
    serviceWorkerRegistration = registration;
    detectWaitingUpdate(registration);
    void checkForServiceWorkerUpdate();
  };

  window.addEventListener("online", () => void checkForServiceWorkerUpdate(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForServiceWorkerUpdate();
  });

  applyServiceWorkerUpdate = registerSW({
    immediate: true,
    onRegisteredSW: (_scriptUrl, registration) => registerUpdateChecks(registration),
    onNeedReload: reloadForServiceWorkerUpdate,
    // Una actualización no debe recargar un formulario de préstamo o pago sin
    // permiso. Queda lista, se anuncia globalmente y el usuario decide aplicarla.
    onNeedRefresh: () => publish({ updateAvailable: true }),
    onOfflineReady: publishControlState,
    onRegisterError: (cause) => {
      const detail = cause instanceof Error ? cause.message : String(cause ?? "");
      publish({
        appShellReady: hasServiceWorkerControl(),
        registrationError: hasServiceWorkerControl()
          ? ""
          : detail
            ? `No se pudo guardar la aplicación en este navegador: ${detail}`
            : "No se pudo guardar la aplicación en este navegador.",
      });
    },
  });

  void navigator.serviceWorker.ready
    .then(registerUpdateChecks)
    .catch(() => undefined);
}

export async function waitForPwaOfflineReady(timeoutMs = 15_000): Promise<void> {
  if (import.meta.env.DEV) {
    throw new Error("El modo de desarrollo no se puede instalar. Use la aplicación publicada o ejecute la compilación con Vista previa.");
  }
  const snapshot = currentState();
  if (!snapshot.secureContext) {
    throw new Error("Abra MultiPréstamos desde su dirección HTTPS para preparar el modo sin Internet.");
  }
  if (!snapshot.serviceWorkerSupported) {
    throw new Error("Este navegador no permite guardar la aplicación para trabajar sin Internet.");
  }

  await new Promise<void>((resolve, reject) => {
    const finishIfReady = (registration?: ServiceWorkerRegistration) => {
      if (!registration?.active || !hasServiceWorkerControl()) return;
      cleanup();
      publish({ appShellReady: true, registrationError: "" });
      resolve();
    };
    const handleControllerChange = () => {
      void navigator.serviceWorker.ready.then(finishIfReady).catch(() => undefined);
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("El navegador no terminó de guardar la aplicación. Recargue la página e inténtelo de nuevo."));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void navigator.serviceWorker.ready
      .then(finishIfReady)
      .catch(() => {
        cleanup();
        reject(new Error("No se pudo activar la copia offline de la aplicación."));
      });
  });
}

async function requestInstallation() {
  if (!installPrompt || currentState().installing) return;
  const prompt = installPrompt;
  publish({ installing: true, outcome: null });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    installPrompt = null;
    publish({ installing: false, outcome: choice.outcome });
  } catch {
    installPrompt = null;
    publish({ installing: false, outcome: "dismissed" });
  }
}

export function usePwaInstall() {
  const [snapshot, setSnapshot] = useState<InstallState>(() => currentState());

  useEffect(() => {
    initializePwaInstallCapture();
    listeners.add(setSnapshot);
    setSnapshot(currentState());
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  const install = useCallback(() => requestInstallation(), []);
  const applyUpdate = useCallback(async () => {
    if (!applyServiceWorkerUpdate) {
      window.location.reload();
      return;
    }
    publish({ updating: true });
    if (updateActivationTimeoutId !== null) window.clearTimeout(updateActivationTimeoutId);
    updateActivationTimeoutId = window.setTimeout(() => {
      updateActivationTimeoutId = null;
      if (!reloadingForUpdate && currentState().updating) {
        publish({
          registrationError: "La actualización no terminó de activarse. Inténtelo de nuevo.",
          updateAvailable: true,
          updating: false,
        });
      }
    }, 15_000);
    try {
      await applyServiceWorkerUpdate();
      // updateAvailable se conserva hasta que controllerchange confirme que
      // el worker nuevo tomó control y la página se recargue completa.
    } catch (cause) {
      if (updateActivationTimeoutId !== null) {
        window.clearTimeout(updateActivationTimeoutId);
        updateActivationTimeoutId = null;
      }
      const detail = cause instanceof Error ? cause.message : String(cause ?? "");
      publish({
        registrationError: detail || "No se pudo aplicar la actualización.",
        updateAvailable: true,
        updating: false,
      });
    }
  }, []);
  return {
    ...snapshot,
    applyUpdate,
    canInstall: Boolean(installPrompt) && !snapshot.standalone,
    install,
  };
}
