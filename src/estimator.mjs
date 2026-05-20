/**
 * Per-agent behavioral parameter estimation.
 *
 * Three signals, each derived from observation rows produced by ingest.mjs:
 *
 *   1. costBidAccuracy — does bid price track delivered true quality?
 *      We compare each vendor's mean (bidPrice / 100) ratio against its mean
 *      (trueScore / 100) ratio. A vendor that consistently underprices
 *      low-quality output is miscalibrated downward (the classic "confident
 *      underbidder" pattern MarketBench documents).
 *
 *   2. confidenceDirection — does the vendor get shortlisted more often than
 *      its work is accepted? Wide shortlist / accept gap means the visible
 *      bid is over-selling what the verifier will eventually approve.
 *
 *   3. strategicSignature — win rate decomposed by buyer strategy. Wins
 *      concentrated in one regime indicate matchup-exploitation, not general
 *      capability.
 */
export function estimateFingerprints(observations) {
  const byVendor = groupBy(observations, (o) => o.vendorId);
  const fingerprints = {};

  for (const [vendorId, rows] of Object.entries(byVendor)) {
    const meanPrice = mean(rows.map((r) => r.bidPrice ?? 0));
    const meanTrueScore = mean(rows.map((r) => r.trueScore ?? 0));
    const shortlistRate = rate(rows, (r) => r.shortlisted);
    const selectRate = rate(rows, (r) => r.selected);
    const acceptRate = rate(rows, (r) => r.accepted);

    const winRateByStrategy = {};
    for (const [strategy, subset] of Object.entries(
      groupBy(rows, (r) => r.buyerStrategy)
    )) {
      winRateByStrategy[strategy] = rate(subset, (r) => r.selected);
    }
    const stratValues = Object.values(winRateByStrategy);
    const strategicConcentration = stratValues.length > 0
      ? Math.max(...stratValues) - Math.min(...stratValues)
      : 0;

    const priceRatio = meanPrice / 100;
    const qualityRatio = meanTrueScore / 100;
    const costBidGap = priceRatio - qualityRatio;
    const confidenceGap = shortlistRate - acceptRate;

    fingerprints[vendorId] = {
      vendorName: rows[0].vendorName,
      observations: rows.length,
      meanBidPrice: round(meanPrice, 1),
      meanTrueScore: round(meanTrueScore, 1),
      costBidAccuracy: {
        priceRatio: round(priceRatio, 3),
        qualityRatio: round(qualityRatio, 3),
        gap: round(costBidGap, 3),
        direction: directionLabel(costBidGap, 0.05, "overpriced", "underpriced")
      },
      confidenceDirection: {
        shortlistRate: round(shortlistRate, 3),
        selectRate: round(selectRate, 3),
        acceptRate: round(acceptRate, 3),
        gap: round(confidenceGap, 3),
        label: directionLabel(confidenceGap, 0.15, "overconfident", "underconfident")
      },
      strategicSignature: {
        winRateByStrategy: mapValues(winRateByStrategy, (v) => round(v, 3)),
        concentration: round(strategicConcentration, 3),
        label: strategicConcentration > 0.5
          ? "matchup-exploiting"
          : strategicConcentration > 0.25
            ? "matchup-leaning"
            : "balanced"
      },
      trueCapability: round(meanTrueScore, 1),
      reputationDelta: sum(rows.map((r) => r.reputationDelta ?? 0))
    };
  }
  return fingerprints;
}

/**
 * Identify the agent the reputation system would misrank.
 *
 * - reputationRank: vendors sorted by total reputation delta (best first)
 * - capabilityRank: vendors sorted by mean true score (best first)
 *
 * A vendor whose reputation rank is materially better than its capability rank
 * is the candidate misranked agent. We flag the vendor with the largest
 * positive (reputation_rank_better_than_capability_rank) gap.
 */
export function detectMisranked(fingerprints) {
  const entries = Object.entries(fingerprints).map(([id, f]) => ({
    vendorId: id,
    vendorName: f.vendorName,
    trueCapability: f.trueCapability,
    reputationDelta: f.reputationDelta,
    fingerprint: f
  }));

  const repRanked = [...entries].sort((a, b) => b.reputationDelta - a.reputationDelta);
  const capRanked = [...entries].sort((a, b) => b.trueCapability - a.trueCapability);

  const repRankById = Object.fromEntries(repRanked.map((e, i) => [e.vendorId, i + 1]));
  const capRankById = Object.fromEntries(capRanked.map((e, i) => [e.vendorId, i + 1]));

  const gaps = entries.map((e) => ({
    vendorId: e.vendorId,
    vendorName: e.vendorName,
    reputationRank: repRankById[e.vendorId],
    capabilityRank: capRankById[e.vendorId],
    gap: capRankById[e.vendorId] - repRankById[e.vendorId],
    trueCapability: e.trueCapability,
    reputationDelta: e.reputationDelta,
    fingerprint: e.fingerprint
  }));

  gaps.sort((a, b) => b.gap - a.gap);
  return {
    ranking: gaps,
    misrankedVendor: gaps[0].gap > 0 ? gaps[0] : null
  };
}

function groupBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const k = keyFn(row);
    out[k] ||= [];
    out[k].push(row);
  }
  return out;
}

function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

function rate(rows, predicate) {
  if (rows.length === 0) return 0;
  return rows.filter(predicate).length / rows.length;
}

function round(x, places) {
  const m = Math.pow(10, places);
  return Math.round(x * m) / m;
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

function directionLabel(value, threshold, positive, negative) {
  if (Math.abs(value) <= threshold) return "calibrated";
  return value > 0 ? positive : negative;
}
