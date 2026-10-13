import { useState, useEffect } from "react";
import type { EngineMode } from "./AiAssistantPanel.types";

export function useAiAssistantSettings() {
  const [showSettings, setShowSettings] = useState(false);
  const isServerRuntime = typeof window !== "undefined" && window.__TPDF_RUNTIME__ === "server";
  const isDesktopRuntime = typeof window !== "undefined" && Boolean(window.tpdf?.setAiConfig);
  const [engineMode, setEngineMode] = useState<EngineMode>(isServerRuntime ? "agent" : "local");

  // VITE_* values are browser-development fallbacks. Desktop secrets live in the main process.
  const [difyUrl, setDifyUrl] = useState(import.meta.env.VITE_DIFY_API_URL || "https://api.dify.ai/v1");
  const [difyKey, setDifyKey] = useState(isDesktopRuntime || isServerRuntime ? "" : (import.meta.env.VITE_DIFY_API_KEY || ""));
  const [conversationId, setConversationId] = useState("");
  
  // Iframe Integration Settings (Defaults pointing to http://localhost:3005)
  const [iframeUrl, setIframeUrl] = useState("http://localhost:3005");

  const syncAiConfigToDesktop = async (nextMode: EngineMode, nextUrl: string, nextKey: string) => {
    if (nextMode === "agent" || !window.tpdf?.setAiConfig) return;
    try {
      await window.tpdf.setAiConfig({ mode: nextMode, difyUrl: nextUrl, difyKey: nextKey });
    } catch (error) {
      console.warn("Failed to sync AI config to desktop main process:", error);
    }
  };

  // Desktop keeps API secrets in the main process for the current app session.
  // Browser development keeps the legacy localStorage fallback.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let savedMode = localStorage.getItem("tpdf_ai_mode");
      let savedUrl = localStorage.getItem("tpdf_dify_url") || "";
      let savedKey = isDesktopRuntime || isServerRuntime ? "" : (localStorage.getItem("tpdf_dify_key") || "");
      const savedConvId = localStorage.getItem("tpdf_dify_conv_id");
      const savedIframeUrl = localStorage.getItem("tpdf_iframe_url");

      const defaultUrl = import.meta.env.VITE_DIFY_API_URL || "https://api.dify.ai/v1";
      const defaultKey = isDesktopRuntime || isServerRuntime ? "" : (import.meta.env.VITE_DIFY_API_KEY || "");

      if (isDesktopRuntime) {
        localStorage.removeItem("tpdf_dify_key");
        try {
          const desktopConfig = await window.tpdf?.getAiConfig?.();
          if (desktopConfig) {
            savedMode = desktopConfig.mode;
            savedUrl = desktopConfig.difyUrl || savedUrl;
            savedKey = desktopConfig.difyKey || "";
          }
        } catch (error) {
          console.warn("Failed to load AI config from desktop main process:", error);
        }
      }

      if (!savedUrl || savedUrl === "https://api.dify.ai/v1") {
        savedUrl = defaultUrl;
        localStorage.setItem("tpdf_dify_url", savedUrl);
      }
      if (!savedKey && defaultKey) {
        savedKey = defaultKey;
        if (!isDesktopRuntime && !isServerRuntime) localStorage.setItem("tpdf_dify_key", savedKey);
      }

      if (isServerRuntime) {
        savedMode = "agent";
        savedKey = "";
        localStorage.removeItem("tpdf_dify_key");
      } else {
        savedMode = savedMode || "local";
      }
      localStorage.setItem("tpdf_ai_mode", savedMode);

      if (cancelled) return;
      setEngineMode(savedMode as EngineMode);
      setDifyUrl(savedUrl);
      setDifyKey(savedKey);
      if (savedConvId) setConversationId(savedConvId);
      if (savedIframeUrl) setIframeUrl(savedIframeUrl);

      if (isDesktopRuntime && savedKey) {
        void syncAiConfigToDesktop(savedMode as EngineMode, savedUrl, savedKey);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime, isServerRuntime]);


  return {
    showSettings,
    setShowSettings,
    engineMode,
    setEngineMode,
    difyUrl,
    setDifyUrl,
    difyKey,
    setDifyKey,
    conversationId,
    setConversationId,
    iframeUrl,
    setIframeUrl,
    syncAiConfigToDesktop,
    isServerRuntime,
  };
}
