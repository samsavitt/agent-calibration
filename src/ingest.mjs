import { readFile } from "node:fs/promises";

/**
 * Load an arena `all-runs.json` payload and normalize it into per-(vendor, run)
 * observation rows. Each row carries every signal the estimator needs, so the
 * estimator does not have to re-walk events.
 */
export async function ingestArenaRuns(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw.runs)) {
    throw new Error(`expected { runs: [...] } at ${path}`);
  }

  const observations = [];
  for (const run of raw.runs) {
    const shortlistedVendorName = firstShortlistedVendor(run.events);
    for (const [vendorId, scores] of Object.entries(run.finalScores)) {
      const bid = bidFromEvents(run.events, vendorIdToName(run, vendorId));
      const rep = run.reputation?.[vendorId];
      observations.push({
        runId: run.runId,
        arenaId: run.arenaId,
        buyerId: run.buyer.id,
        buyerStrategy: run.buyer.strategy,
        vendorId,
        vendorName: vendorIdToName(run, vendorId),
        bidPrice: bid?.price ?? null,
        bidDeliveryMinutes: bid?.deliveryMinutes ?? null,
        bidLinkedSources: bid?.linkedSources ?? null,
        bidCounterEvidence: bid?.counterEvidence ?? null,
        bidRefundPolicy: bid?.refundPolicy ?? null,
        trueScore: scores.total,
        evidenceScore: scores.evidence,
        safetyScore: scores.safety,
        costScore: scores.cost,
        reputationScore: scores.reputation,
        hiddenFailures: scores.hiddenFailures?.length ?? 0,
        policyFailures: scores.policyFailures?.length ?? 0,
        shortlisted: shortlistedVendorName != null
          && shortlistedVendorName === vendorIdToName(run, vendorId),
        selected: run.selectedVendor === vendorIdToName(run, vendorId),
        accepted: run.selectedVendor === vendorIdToName(run, vendorId)
          && run.status === "accepted",
        flagged: run.selectedVendor === vendorIdToName(run, vendorId)
          && run.status === "flagged",
        reputationDelta: rep?.delta ?? 0
      });
    }
  }
  return { generatedAt: raw.generatedAt, observations };
}

function vendorIdToName(run, vendorId) {
  return run.reputation?.[vendorId]?.name ?? vendorId;
}

function bidFromEvents(events, vendorName) {
  for (const event of events) {
    if (event.action === "propose_bid" && event.actor === vendorName) {
      return event.detail;
    }
  }
  return null;
}

function firstShortlistedVendor(events) {
  for (const event of events) {
    if (event.action === "shortlist_vendor") return event.detail.vendor;
  }
  return null;
}
