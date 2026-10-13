import { resolve } from "node:path";
import {
  DEFAULT_OCR_TTL_MS,
  DEFAULT_UPLOAD_TTL_MS,
  pruneLocalDataTree,
} from "../server/tpdf-maintenance.mjs";

const dataDir = resolve(process.env.TPDF_DATA_DIR || ".tpdf-data");
const uploadMaxAgeMs = Number(process.env.TPDF_UPLOAD_TTL_MS || DEFAULT_UPLOAD_TTL_MS);
const ocrMaxAgeMs = Number(process.env.TPDF_OCR_ARTIFACT_TTL_MS || DEFAULT_OCR_TTL_MS);

const result = await pruneLocalDataTree(dataDir, { uploadMaxAgeMs, ocrMaxAgeMs });
console.log(JSON.stringify({ dataDir, ...result }, null, 2));
