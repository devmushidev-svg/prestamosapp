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
let state: InstallState | null = null;
const listeners = new Set<(next: InstallState) => void>();

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
  };
  return state;
}

function publish(patch: Partial<InstallState>) {
  state = { ...currentState(), ...patch };
  listeners.forEach((listener) => listener(state!));
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

  const publishControlState = () => {
    if (hasServiceWorkerControl()) publish({ appShellReady: true, registrationError: "" });
  };
  navigator.serviceWorker.addEventListener("controllerchange", publishControlState);

  applyServiceWorkerUpdate = registerSW({
    immediate: true,
    onRegisteredSW: publishControlState,
    // Una actualización no debe recargar un formulario de préstamo o pago sin
    // permiso. Queda lista y se aplica cuando el usuario lo decide o reabre la app.
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
    .then(publishControlState)
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
    publish({ updateAvailable: false });
    await applyServiceWorkerUpdate();
  }, []);
  return {
    ...snapshot,
    applyUpdate,
    canInstall: Boolean(installPrompt) && !snapshot.standalone,
    install,
  };
}
