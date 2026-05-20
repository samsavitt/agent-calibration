#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestArenaRuns } from "../src/ingest.mjs";
import { estimateFingerprints, detectMisranked } from "../src/estimator.mjs";
import { renderReport } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

if (!process.argv[2]) {
  console.error("Usage: node bin/fingerprint.mjs <path-to-runs.json>");
  console.error("  path-to-runs.json  JSON file of arena run logs (see README for schema)");
  process.exit(1);
}

const inputPath = resolve(process.argv[2]);

const { generatedAt, observations } = await ingestArenaRuns(inputPath);
const fingerprints = estimateFingerprints(observations);
const misranking = detectMisranked(fingerprints);
const report = renderReport({ generatedAt, fingerprints, misranking });

const outDir = resolve(projectRoot, "runs");
await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = resolve(outDir, `fingerprint-${stamp}.json`);
const mdPath = resolve(outDir, `fingerprint-${stamp}.md`);

await writeFile(
  jsonPath,
  JSON.stringify({ generatedAt, inputPath, fingerprints, misranking }, null, 2) + "\n"
);
await writeFile(mdPath, report + "\n");

console.log(report);
console.log("");
console.log(`# wrote ${jsonPath}`);
console.log(`# wrote ${mdPath}`);

const ok = misranking.misrankedVendor != null;
if (!ok) {
  console.error("\n[warn] no misranked vendor detected — ranks are aligned.");
}
