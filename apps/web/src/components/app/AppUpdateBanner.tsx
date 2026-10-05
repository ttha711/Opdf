type AppUpdateBannerProps = {
  updateInfo: { version: string; description?: string } | null;
};

export function AppUpdateBanner({ updateInfo }: AppUpdateBannerProps) {
  if (!updateInfo) return null;

  return (
    <div
      className="opdf-update-banner"
      style={{
        backgroundColor: "#10b981",
        color: "white",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "13px",
        fontWeight: "500",
        zIndex: "var(--z-panel)",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px" }}>🎉</span>
        <span>
          Version <strong>v{updateInfo.version}</strong> is ready. (
          {updateInfo.description || "Bug fixes and performance improvements"})
        </span>
      </div>
      <button
        type="button"
        onClick={() => { void window.opdfUpdate?.restartApp(); }}
        style={{
          backgroundColor: "white",
          color: "#10b981",
          border: "none",
          padding: "4px 12px",
          borderRadius: "4px",
          fontWeight: "bold",
          cursor: "pointer",
          transition: "opacity 0.2s",
        }}
        onMouseOver={(event) => { event.currentTarget.style.opacity = "0.9"; }}
        onMouseOut={(event) => { event.currentTarget.style.opacity = "1"; }}
      >
        Restart to Update
      </button>
    </div>
  );
}
