import { useState, useEffect } from "react";
import type { EngineMode } from "./AiAssistantPanel.types";

export function useAiAssistantSettings() {
  const [showSettings, setShowSettings] = useState(false);
  const [engineMode, setEngineMode] = useState<EngineMode>("dify");
  
  // Dify API Settings (Defaults pre-populated from environment variables or safe fallbacks)
  const [difyUrl, setDifyUrl] = useState(import.meta.env.VITE_DIFY_API_URL || "https://api.dify.ai/v1");
  const [difyKey, setDifyKey] = useState(import.meta.env.VITE_DIFY_API_KEY || "");
  const [conversationId, setConversationId] = useState("");
  
  // Iframe Integration Settings (Defaults pointing to http://localhost:3005)
  const [iframeUrl, setIframeUrl] = useState("http://localhost:3005");

  const syncAiConfigToDesktop = async (nextMode: EngineMode, nextUrl: string, nextKey: string) => {
    if (!window.opdf?.setAiConfig) return;
    try {
      await window.opdf.setAiConfig({ mode: nextMode, difyUrl: nextUrl, difyKey: nextKey });
    } catch (error) {
      console.warn("Failed to sync AI config to desktop main process:", error);
    }
  };

  // Load settings from localStorage on mount & Register postMessage bridge
  useEffect(() => {
    let savedMode = localStorage.getItem("opdf_ai_mode");
    let savedUrl = localStorage.getItem("opdf_dify_url") || "";
    let savedKey = localStorage.getItem("opdf_dify_key") || "";
    const savedConvId = localStorage.getItem("opdf_dify_conv_id");
    const savedIframeUrl = localStorage.getItem("opdf_iframe_url");

    // Resolve default environment variables or safe fallback values
    const defaultUrl = import.meta.env.VITE_DIFY_API_URL || "https://ong-ongai.duckdns.org/v1";
    const defaultKey = import.meta.env.VITE_DIFY_API_KEY || "REDACTED_DIFY_API_KEY";

    // Self-healing migration from public Dify to company's self-hosted Dify host
    if (!savedUrl || savedUrl === "https://api.dify.ai/v1") {
      savedUrl = defaultUrl;
      localStorage.setItem("opdf_dify_url", savedUrl);
    }
    if (!savedKey || savedKey === "REDACTED_DIFY_API_KEY") {
      savedKey = defaultKey;
      localStorage.setItem("opdf_dify_key", savedKey);
    }

    savedMode = "dify";
    localStorage.setItem("opdf_ai_mode", "dify");

    setEngineMode("dify");
    setDifyUrl(savedUrl);
    setDifyKey(savedKey);
    if (savedConvId) setConversationId(savedConvId);
    if (savedIframeUrl) setIframeUrl(savedIframeUrl);
    void syncAiConfigToDesktop("dify", savedUrl, savedKey);
  }, []);

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
  };
}
