export {};

declare global {
  interface Window {
    __TPDF_RUNTIME__?: "server" | "browser";
    __TPDF_SERVER_BASE__?: string;
  }
}
