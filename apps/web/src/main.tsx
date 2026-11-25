import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./App";
import { startSelfTracking } from "./lib/self-tracking";
import { startTheme } from "./lib/theme";
import { AppProviders } from "./providers";
import "./index.css";

// Before the first render, so the page doesn't flash in the wrong colours
startTheme();
startSelfTracking();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);
