import { useCallback, useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

type InstallState = {
  installing: boolean;
  isIos: boolean;
  outcome: InstallOutcome | null;
  standalone: boolean;
};

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice() {
  const touchEnabledMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || touchEnabledMac;
}

let initialized = false;
let installPrompt: BeforeInstallPromptEvent | null = null;
let state: InstallState | null = null;
const listeners = new Set<(next: InstallState) => void>();

function currentState(): InstallState {
  state ??= {
    installing: false,
    isIos: isIosDevice(),
    outcome: null,
    standalone: isStandaloneMode(),
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
  return {
    ...snapshot,
    canInstall: Boolean(installPrompt) && !snapshot.standalone,
    install,
  };
}
