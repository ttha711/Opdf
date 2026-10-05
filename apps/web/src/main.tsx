import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "./styles.css";
import { warmAppAssetCache } from "./lib/appAssetCache";

declare const __OPDF_BUILD_SHA__: string;

document.documentElement.dataset.opdfBuildSha = __OPDF_BUILD_SHA__;

if (!document.documentElement.dataset.density) {
  document.documentElement.dataset.density = "comfortable";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
);

warmAppAssetCache();
