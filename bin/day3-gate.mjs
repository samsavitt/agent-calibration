#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runMatch } from "../../gauntlet/runtime/match.mjs";
import { ingestArenaRuns } from "../src/ingest.mjs";
import { detectMisranked, estimateFingerprints } from "../src/estimator.mjs";
import { renderReport } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const labRoot = resolve(projectRoot, "..");
const gauntletRoot = resolve(labRoot, "gauntlet");
const generatedAt = new Date().toISOString();
const stamp = generatedAt.replace(/[:.]/g, "-");
const outDir = resolve(projectRoot, "runs", `day3-${stamp}`);
const requiredDetectionRate = 0.6;

async function main() {
  const [agents, scenarioPayload] = await Promise.all([
    readJson(resolve(gauntletRoot, "arena/data/agents.json")),
    readJson(resolve(gauntletRoot, "arena/data/scenarios.json")),
  ]);

  const regimes = buildRegimes(agents);
  const scenarioRows = scenarioPayload.scenarios;
  await mkdir(outDir, { recursive: true });

  const regimeResults = [];
  const allRuns = [];
  for (const regime of regimes) {
    const runs = runRegime({ regime, scenarios: scenarioRows, verifier: agents.verifier });
    allRuns.push(...runs);

    const regimePath = resolve(outDir, `${regime.id}.all-runs.json`);
    await writeFile(regimePath, `${JSON.stringify({ generatedAt, runs }, null, 2)}\n`);

    const { observations } = await ingestArenaRuns(regimePath);
    const fingerprints = estimateFingerprints(observations);
    const misranking = detectMisranked(fingerprints);
    const report = renderReport({ generatedAt, fingerprints, misranking });
    await writeFile(resolve(outDir, `${regime.id}.fingerprint.md`), `${report}\n`);

    const detected = misranking.misrankedVendor?.vendorId ?? null;
    const expected = regime.expectedMisrankedVendorId;
    regimeResults.push({
      id: regime.id,
      label: regime.label,
      kind: regime.kind,
      note: regime.note,
      path: relativeToProject(regimePath),
      runs: runs.length,
      expectedMisrankedVendorId: expected,
      detectedMisrankedVendorId: detected,
      passed: detected === expected,
      ranking: misranking.ranking.map((row) => ({
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        reputationRank: row.reputationRank,
        capabilityRank: row.capabilityRank,
        gap: row.gap,
        trueCapability: row.trueCapability,
        reputationDelta: row.reputationDelta,
      })),
    });
  }

  const positiveRegimes = regimeResults.filter((result) => result.kind === "positive");
  const negativeControls = regimeResults.filter((result) => result.kind === "negative-control");
  const passedPositiveRegimes = positiveRegimes.filter((result) => result.passed).length;
  const passedNegativeControls = negativeControls.filter((result) => result.passed).length;
  const detectionRate = passedPositiveRegimes / positiveRegimes.length;
  const controlsPassed = passedNegativeControls === negativeControls.length;
  const verdict = positiveRegimes.length >= 3
    && detectionRate > requiredDetectionRate
    && controlsPassed
    ? "pass"
    : "fail";

  const combinedPath = resolve(outDir, "all-regimes.all-runs.json");
  await writeFile(combinedPath, `${JSON.stringify({ generatedAt, runs: allRuns }, null, 2)}\n`);

  const gateReport = {
    generatedAt,
    gate: "day-3-mechanistic",
    source: {
      gauntletRoot: relativeToLab(gauntletRoot),
      scenariosPath: relativeToLab(resolve(gauntletRoot, "arena/data/scenarios.json")),
      agentsPath: relativeToLab(resolve(gauntletRoot, "arena/data/agents.json")),
    },
    expectedMisrankedVendorId: "fastbrief",
    requiredDetectionRate,
    regimeCount: regimeResults.length,
    positiveRegimeCount: positiveRegimes.length,
    negativeControlCount: negativeControls.length,
    passedRegimes: passedPositiveRegimes,
    passedNegativeControls,
    observedDetectionRate: round(detectionRate, 3),
    controlsPassed,
    verdict,
    regimes: regimeResults,
    artifacts: {
      outputDir: relativeToProject(outDir),
      combinedRuns: relativeToProject(combinedPath),
    },
  };

  const reportPath = resolve(outDir, "gate-report.json");
  await writeFile(reportPath, `${JSON.stringify(gateReport, null, 2)}\n`);
  await writeFile(resolve(outDir, "summary.md"), renderGateMarkdown(gateReport));

  console.log(
    `gate=${gateReport.gate} regimes=${gateReport.regimeCount} ` +
    `positive_passed=${gateReport.passedRegimes}/${gateReport.positiveRegimeCount} ` +
    `negative_controls=${gateReport.passedNegativeControls}/${gateReport.negativeControlCount} ` +
    `detection_rate=${gateReport.observedDetectionRate} ` +
    `verdict=${gateReport.verdict} report=${relativeToProject(reportPath)}`
  );
}

function buildRegimes(agents) {
  const buyersById = Object.fromEntries(agents.buyers.map((buyer) => [buyer.id, buyer]));
  const canonicalVendors = clone(agents.vendors);

  const safetyTightVendors = clone(agents.vendors);
  patchBid(safetyTightVendors, "vectorscout", "defaultBid", { price: 88 });
  patchBid(safetyTightVendors, "vectorscout", "lead-list-procurement", { price: 73 });
  patchBid(safetyTightVendors, "deepaudit", "defaultBid", { price: 100 });

  const fastRepVendors = clone(agents.vendors);
  fastRepVendors.find((vendor) => vendor.id === "fastbrief").reputation = 85;

  return [
    {
      id: "canonical",
      label: "Canonical buyer mix",
      kind: "positive",
      expectedMisrankedVendorId: "fastbrief",
      note: "The current Gauntlet procurement fixture: one safety-first, one cost-first, and one speed-first buyer.",
      buyers: clone(agents.buyers),
      vendors: canonicalVendors,
    },
    {
      id: "speed-heavy",
      label: "Speed-heavy buyer mix",
      kind: "positive",
      expectedMisrankedVendorId: "fastbrief",
      note: "Duplicates the speed-first buyer to stress whether fast, low-safety bids become over-selected.",
      buyers: [
        clone(buyersById["buyer-fast"]),
        { ...clone(buyersById["buyer-fast"]), id: "buyer-fast-2", name: "Buyer-Fast-2" },
        clone(buyersById["buyer-cheap"]),
      ],
      vendors: clone(agents.vendors),
    },
    {
      id: "safety-tight",
      label: "Safety-tight market",
      kind: "positive",
      expectedMisrankedVendorId: "fastbrief",
      note: "Duplicates the safety-first buyer and slightly raises safe-vendor prices to check robustness under tighter economics.",
      buyers: [
        clone(buyersById["buyer-careful"]),
        { ...clone(buyersById["buyer-careful"]), id: "buyer-careful-2", name: "Buyer-Careful-2" },
        clone(buyersById["buyer-fast"]),
      ],
      vendors: safetyTightVendors,
    },
    {
      id: "fastbrief-reputation-boost",
      label: "FastBrief reputation boost",
      kind: "positive",
      expectedMisrankedVendorId: "fastbrief",
      note: "Raises FastBrief's starting reputation to test whether visible reputation worsens over-selection.",
      buyers: clone(agents.buyers),
      vendors: fastRepVendors,
    },
    {
      id: "cost-heavy-negative-control",
      label: "Cost-heavy negative control",
      kind: "negative-control",
      expectedMisrankedVendorId: null,
      note: "Duplicates cost-first buyers; rankings should align enough that no vendor is flagged as reputation-overranked.",
      buyers: [
        clone(buyersById["buyer-cheap"]),
        { ...clone(buyersById["buyer-cheap"]), id: "buyer-cheap-2", name: "Buyer-Cheap-2" },
        clone(buyersById["buyer-fast"]),
      ],
      vendors: clone(agents.vendors),
    },
  ];
}

function runRegime({ regime, scenarios, verifier }) {
  return scenarios.flatMap((scenario) =>
    regime.buyers.map((buyer) => {
      const run = runMatch({
        scenario,
        buyer,
        vendors: clone(regime.vendors),
        verifier: clone(verifier),
        generatedAt,
      });
      return {
        ...run,
        runId: `${regime.id}__${run.runId}`,
        regime: { id: regime.id, label: regime.label },
      };
    })
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function patchBid(vendors, vendorId, scope, patch) {
  const vendor = vendors.find((candidate) => candidate.id === vendorId);
  if (!vendor) throw new Error(`unknown vendor: ${vendorId}`);
  if (scope === "defaultBid") {
    Object.assign(vendor.defaultBid, patch);
    return;
  }
  Object.assign(vendor.scenarioOverrides[scope], patch);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function relativeToProject(path) {
  return path.replace(`${projectRoot}/`, "");
}

function relativeToLab(path) {
  return path.replace(`${labRoot}/`, "Lab/");
}

function round(value, places) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function renderGateMarkdown(report) {
  const lines = [
    "# Day-3 Mechanistic Gate",
    "",
    `Generated: ${report.generatedAt}`,
    `Verdict: **${report.verdict.toUpperCase()}**`,
    `Positive detection rate: ${pct(report.observedDetectionRate)} (${report.passedRegimes}/${report.positiveRegimeCount})`,
    `Negative controls: ${report.passedNegativeControls}/${report.negativeControlCount}`,
    `Required: > ${pct(report.requiredDetectionRate)}`,
    "",
    "## Regimes",
    "",
    "| Regime | Kind | Expected | Detected | Pass | Note |",
    "|---|---|---|---|---|---|",
  ];
  for (const regime of report.regimes) {
    lines.push(
      `| ${regime.label} | ${regime.kind} | ${regime.expectedMisrankedVendorId ?? "none"} | ` +
      `${regime.detectedMisrankedVendorId ?? "none"} | ${regime.passed ? "yes" : "no"} | ${regime.note} |`
    );
  }
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- Gate report: \`${report.artifacts.outputDir}/gate-report.json\``);
  lines.push(`- Combined runs: \`${report.artifacts.combinedRuns}\``);
  return `${lines.join("\n")}\n`;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
