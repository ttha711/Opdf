export {};

declare global {
  interface Window {
    __OPDF_RUNTIME__?: "server" | "browser";
    __OPDF_SERVER_BASE__?: string;
  }
}
