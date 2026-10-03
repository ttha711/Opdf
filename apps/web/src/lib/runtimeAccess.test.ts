import { describe, expect, it } from "vitest";
import { hasFullWebAccess, isDevelopmentHostname } from "./runtimeAccess";

describe("runtime access", () => {
  it("keeps OPDF Server fully enabled behind a public domain", () => {
    expect(hasFullWebAccess({
      hasDesktopBridge: false,
      isServerRuntime: true,
      hostname: "pdf.example.com",
    })).toBe(true);
  });

  it("allows desktop and local development runtimes", () => {
    expect(hasFullWebAccess({
      hasDesktopBridge: true,
      isServerRuntime: false,
      hostname: "pdf.example.com",
    })).toBe(true);
    expect(isDevelopmentHostname("localhost")).toBe(true);
    expect(isDevelopmentHostname("192.168.1.20")).toBe(true);
    expect(isDevelopmentHostname("172.16.4.5")).toBe(true);
    expect(isDevelopmentHostname("172.31.4.5")).toBe(true);
  });

  it("does not treat arbitrary public hosts as local", () => {
    expect(hasFullWebAccess({
      hasDesktopBridge: false,
      isServerRuntime: false,
      hostname: "pdf.example.com",
    })).toBe(false);
    expect(isDevelopmentHostname("172.15.4.5")).toBe(false);
    expect(isDevelopmentHostname("172.32.4.5")).toBe(false);
  });
});
