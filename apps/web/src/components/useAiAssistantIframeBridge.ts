import { useEffect } from "react";

export function useAiAssistantIframeBridge() {
  useEffect(() => {
    // postMessage bidirectional bridge listener
    const handleIframeMessage = async (event: MessageEvent) => {
      // Validate that the message is meant for TPDF Agent execution
      if (event.data && event.data.type === "TPDF_AGENT_COMMAND") {
        const { command, callbackId } = event.data;
        console.log("[AiAssistantPanel] Received iframe command:", command);

        if (window.tpdfAgent) {
          try {
            // Execute command locally
            const result = await window.tpdfAgent.execute(command);
            
            // Post result back to the iframe source window
            if (event.source) {
              (event.source as WindowProxy).postMessage({
                type: "TPDF_AGENT_RESULT",
                callbackId,
                result
              }, event.origin || "*");
            }
          } catch (err) {
            if (event.source) {
              (event.source as WindowProxy).postMessage({
                type: "TPDF_AGENT_RESULT",
                callbackId,
                result: {
                  status: "failed",
                  message: err instanceof Error ? err.message : String(err)
                }
              }, event.origin || "*");
            }
          }
        }
      }
    };

    window.addEventListener("message", handleIframeMessage);
    return () => {
      window.removeEventListener("message", handleIframeMessage);
    };
  }, []);
}
