import { Router } from "express";
import { createReadStream, createWriteStream } from "fs";
import { access, mkdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

type JobStatus = "uploading" | "uploaded" | "processing" | "completed" | "failed";

type PdfJob = {
  id: string;
  fileName: string;
  operation: "optimize" | "linearize";
  status: JobStatus;
  inputPath: string;
  outputPath: string;
  bytesReceived: number;
  totalBytes?: number;
  error?: string;
  createdAt: number;
};

const router = Router();
const jobs = new Map<string, PdfJob>();
const JOB_ROOT = path.join(tmpdir(), "opdf-large-jobs");
const MAX_UPLOAD_BYTES = Number(process.env.OPDF_MAX_UPLOAD_BYTES || 1024 * 1024 * 1024);
const JOB_TTL_MS = Number(process.env.OPDF_JOB_TTL_MS || 60 * 60 * 1000);

function safeName(value: string | undefined) {
  const fallback = "document.pdf";
  if (!value) return fallback;
  const base = path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_");
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

async function hasCommand(command: string, args: string[] = ["--version"]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

async function cleanupExpiredJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt >= cutoff || job.status === "processing") continue;
    jobs.delete(id);
    await rm(path.dirname(job.inputPath), { recursive: true, force: true }).catch(() => undefined);
  }
}

router.get("/capabilities", async (_req, res) => {
  const qpdf = await hasCommand("qpdf");
  res.json({
    streamingUpload: true,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    qpdf,
    operations: qpdf ? ["optimize", "linearize"] : [],
  });
});

router.post("/", async (req, res, next) => {
  void cleanupExpiredJobs();
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    res.status(415).json({ error: "Upload a PDF body using application/pdf or application/octet-stream." });
    return;
  }

  const operation = req.query.operation === "linearize" ? "linearize" : "optimize";
  const id = randomUUID();
  const fileName = safeName(String(req.headers["x-file-name"] || "document.pdf"));
  const jobDir = path.join(JOB_ROOT, id);
  const inputPath = path.join(jobDir, "input.pdf");
  const outputPath = path.join(jobDir, "output.pdf");
  await mkdir(jobDir, { recursive: true });

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    await rm(jobDir, { recursive: true, force: true });
    res.status(413).json({ error: "PDF exceeds configured upload limit." });
    return;
  }

  const job: PdfJob = {
    id,
    fileName,
    operation,
    status: "uploading",
    inputPath,
    outputPath,
    bytesReceived: 0,
    totalBytes: declaredLength > 0 ? declaredLength : undefined,
    createdAt: Date.now(),
  };
  jobs.set(id, job);

  try {
    const output = createWriteStream(inputPath, { flags: "wx" });
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      job.bytesReceived += chunk.length;
      if (job.bytesReceived > MAX_UPLOAD_BYTES && !aborted) {
        aborted = true;
        req.destroy(new Error("Upload exceeds configured limit."));
      }
    });

    req.pipe(output);
    await new Promise<void>((resolve, reject) => {
      output.once("finish", resolve);
      output.once("error", reject);
      req.once("error", reject);
      req.once("aborted", () => reject(new Error("Upload aborted.")));
    });

    job.status = "uploaded";
    res.status(202).json({
      id: job.id,
      status: job.status,
      operation: job.operation,
      fileName: job.fileName,
      bytesReceived: job.bytesReceived,
    });
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    next(error);
  }
});

router.post("/:id/run", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (job.status === "processing") {
    res.status(409).json({ error: "Job is already processing." });
    return;
  }
  if (job.status !== "uploaded" && job.status !== "failed") {
    res.status(409).json({ error: `Job cannot run from status ${job.status}.` });
    return;
  }
  if (!(await hasCommand("qpdf"))) {
    res.status(501).json({ error: "qpdf is not installed on this server." });
    return;
  }

  job.status = "processing";
  job.error = undefined;

  const args =
    job.operation === "linearize"
      ? ["--linearize", job.inputPath, job.outputPath]
      : ["--object-streams=generate", "--stream-data=compress", "--recompress-flate", job.inputPath, job.outputPath];

  const child = spawn("qpdf", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk).slice(0, 4096);
  });
  child.once("error", (error) => {
    job.status = "failed";
    job.error = error.message;
  });
  child.once("exit", (code) => {
    if (code === 0) {
      job.status = "completed";
    } else {
      job.status = "failed";
      job.error = stderr || `qpdf exited with code ${code}`;
    }
  });

  res.status(202).json({ id: job.id, status: job.status, operation: job.operation });
});

router.get("/:id", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  let outputBytes: number | undefined;
  if (job.status === "completed") {
    outputBytes = (await stat(job.outputPath).catch(() => null))?.size;
  }

  res.json({
    id: job.id,
    status: job.status,
    operation: job.operation,
    fileName: job.fileName,
    bytesReceived: job.bytesReceived,
    totalBytes: job.totalBytes,
    outputBytes,
    error: job.error,
  });
});

router.get("/:id/result", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (job.status !== "completed") {
    res.status(409).json({ error: `Job is ${job.status}.` });
    return;
  }
  try {
    await access(job.outputPath);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `attachment; filename="${job.fileName.replace(/\.pdf$/i, "")}-${job.operation}.pdf"`);
    createReadStream(job.outputPath).pipe(res);
  } catch {
    res.status(410).json({ error: "Job result is no longer available." });
  }
});

router.delete("/:id", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(204).end();
    return;
  }
  jobs.delete(job.id);
  await rm(path.dirname(job.inputPath), { recursive: true, force: true });
  res.status(204).end();
});

export default router;
