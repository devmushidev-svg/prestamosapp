import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { BusinessConfigProvider } from "./business/BusinessConfigContext";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./theme/pfTheme";
import { ThemeProvider } from "./theme/ThemeProvider";
import { OfflineProvider } from "./offline/OfflineContext";
import { initializePwaInstallCapture } from "./hooks/usePwaInstall";
import { enableLocalOfflineTestMode } from "./lib/localOfflineTestMode";

enableLocalOfflineTestMode();
applyStoredTheme();
initializePwaInstallCapture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <OfflineProvider>
            <BusinessConfigProvider>
              <App />
            </BusinessConfigProvider>
          </OfflineProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
