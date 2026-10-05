import { useEffect, useMemo, useState } from "react";

type TenantInfo = {
  mode: string;
  userId: string;
  displayName: string;
  email?: string | null;
  projectId: string;
  quotaBytes: number;
  usageBytes: number;
};

type Project = { id: string; active: boolean };

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function ServerTenantMenu() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.__OPDF_RUNTIME__ !== "server") return;
    let active = true;
    Promise.all([
      fetch("/api/opdf/auth/me", { cache: "no-store" }),
      fetch("/api/opdf/projects", { cache: "no-store" }),
    ]).then(async ([meResponse, projectsResponse]) => {
      if (!active || !meResponse.ok) return;
      const nextInfo = await meResponse.json() as TenantInfo;
      const nextProjects = projectsResponse.ok
        ? await projectsResponse.json() as Project[]
        : [];
      if (!active) return;
      setInfo(nextInfo);
      setProjects(nextProjects);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const usage = useMemo(() => {
    if (!info || info.quotaBytes <= 0) return "";
    const percent = Math.min(100, Math.round((info.usageBytes / info.quotaBytes) * 100));
    return `${formatBytes(info.usageBytes)} / ${formatBytes(info.quotaBytes)} (${percent}%)`;
  }, [info]);

  if (!info || info.mode === "disabled") return null;

  const selectProject = async (id: string) => {
    if (id === info.projectId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/opdf/projects/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Project switch failed.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    if (busy) return;
    const raw = window.prompt("New project id");
    const id = raw?.trim();
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch("/api/opdf/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        window.alert(body.error || "Could not create project.");
        return;
      }
      const next = await response.json() as Project;
      setProjects((current) => current.some((item) => item.id === next.id)
        ? current
        : [...current, next].sort((a, b) => a.id.localeCompare(b.id)));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (info.mode !== "token") return;
    await fetch("/api/opdf/auth/session", { method: "DELETE" }).catch(() => {});
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="top-menu-btn max-w-[180px] truncate"
        onClick={() => setOpen((value) => !value)}
        title={`${info.displayName} · ${info.projectId}`}
      >
        {info.projectId}
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1 w-72 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-3 text-xs shadow-xl">
          <div className="font-bold text-[var(--text-primary)]">{info.displayName}</div>
          <div className="mt-1 text-[var(--text-secondary)]">Project: {info.projectId}</div>
          <div className="text-[var(--text-secondary)]">Storage: {usage}</div>

          <div className="mt-3 border-t border-[var(--border-color)] pt-2">
            <div className="mb-1 font-semibold text-[var(--text-secondary)]">Projects</div>
            <div className="max-h-40 space-y-1 overflow-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  disabled={busy || project.id === info.projectId}
                  onClick={() => void selectProject(project.id)}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-[var(--ui-hover-bg)] disabled:font-bold"
                >
                  {project.id}{project.id === info.projectId ? " · active" : ""}
                </button>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={() => void createProject()} className="mt-2 rounded border border-[var(--border-color)] px-2 py-1">
              New project
            </button>
          </div>

          {info.mode === "token" ? (
            <button type="button" onClick={() => void logout()} className="mt-3 block text-red-600">
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
