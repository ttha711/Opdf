import { resolve } from "node:path";
import {
  DEFAULT_OCR_TTL_MS,
  DEFAULT_UPLOAD_TTL_MS,
  pruneLocalDataTree,
} from "../server/opdf-maintenance.mjs";

const dataDir = resolve(process.env.OPDF_DATA_DIR || ".opdf-data");
const uploadMaxAgeMs = Number(process.env.OPDF_UPLOAD_TTL_MS || DEFAULT_UPLOAD_TTL_MS);
const ocrMaxAgeMs = Number(process.env.OPDF_OCR_ARTIFACT_TTL_MS || DEFAULT_OCR_TTL_MS);

const result = await pruneLocalDataTree(dataDir, { uploadMaxAgeMs, ocrMaxAgeMs });
console.log(JSON.stringify({ dataDir, ...result }, null, 2));
