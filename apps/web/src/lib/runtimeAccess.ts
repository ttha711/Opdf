export type WebAccessContext = {
  hasDesktopBridge: boolean;
  isServerRuntime: boolean;
  hostname: string;
};

function isPrivate172Host(hostname: string) {
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

export function isDevelopmentHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "[::1]"
    || normalized === "::1"
    || normalized.endsWith(".trycloudflare.com")
    || normalized.startsWith("192.168.")
    || normalized.startsWith("10.")
    || isPrivate172Host(normalized);
}

export function hasFullWebAccess({
  hasDesktopBridge,
  isServerRuntime,
  hostname,
}: WebAccessContext) {
  // Runtime capability wins over deployment hostname. In particular, OPDF
  // Server remains the full web application when published behind a real
  // domain or authenticated reverse proxy.
  return hasDesktopBridge || isServerRuntime || isDevelopmentHostname(hostname);
}
