import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { BusinessConfigProvider } from "./business/BusinessConfigContext";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./theme/pfTheme";
import { ThemeProvider } from "./theme/ThemeProvider";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <BusinessConfigProvider>
            <App />
          </BusinessConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
