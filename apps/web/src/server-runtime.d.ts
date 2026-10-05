export {};

declare global {
  interface Window {
    __OPDF_RUNTIME__?: "server" | "browser";
    __OPDF_SERVER_BASE__?: string;
    __OPDF_SERVER_CAPABILITIES__?: Record<string, boolean>;
  }
}
