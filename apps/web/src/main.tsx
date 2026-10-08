import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "./styles.css";
import { registerOfflineAppCache, warmAppAssetCache } from "./lib/appAssetCache";
import { ServerAuthGate } from "./components/ServerAuthGate";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installGlobalErrorReporting } from "./lib/clientDiagnostics";

declare const __OPDF_BUILD_SHA__: string;

// Read server-injected metadata before mounting React; no blocking JS request.
if (document.querySelector<HTMLMetaElement>('meta[name="opdf-runtime"]')?.content === "server") {
  window.__OPDF_RUNTIME__ = "server";
  window.__OPDF_SERVER_BASE__ =
    document.querySelector<HTMLMetaElement>('meta[name="opdf-server-base"]')?.content || "/api/opdf";
}
document.documentElement.dataset.opdfBuildSha = __OPDF_BUILD_SHA__;
installGlobalErrorReporting(__OPDF_BUILD_SHA__);

if (!document.documentElement.dataset.density) {
  document.documentElement.dataset.density = "comfortable";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary buildSha={__OPDF_BUILD_SHA__}>
      <ToastProvider>
        <ConfirmProvider>
          <ServerAuthGate>
            <App />
          </ServerAuthGate>
        </ConfirmProvider>
      </ToastProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);

registerOfflineAppCache(__OPDF_BUILD_SHA__);
warmAppAssetCache();
