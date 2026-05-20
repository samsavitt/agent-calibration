/**
 * Render a human-readable report from estimator output. The format is the
 * artifact we show to external practitioners for the commercial gate, so it
 * must be self-explanatory without surrounding code.
 */
export function renderReport({ generatedAt, fingerprints, misranking }) {
  const lines = [];
  lines.push("# Agent Behavioral Fingerprint Report");
  lines.push("");
  lines.push(`Generated: ${generatedAt ?? "unknown"}`);
  lines.push(`Vendors: ${Object.keys(fingerprints).length}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  if (misranking.misrankedVendor) {
    const m = misranking.misrankedVendor;
    lines.push(
      `**Misranked agent flagged: ${m.vendorName}** — reputation rank ${m.reputationRank} ` +
      `but true-capability rank ${m.capabilityRank} (gap = ${m.gap}).`
    );
    lines.push("");
    lines.push(misrankExplanation(m));
  } else {
    lines.push("No misranked agent detected — reputation rank matches capability rank for every vendor.");
  }
  lines.push("");

  lines.push("## Ranking table");
  lines.push("");
  lines.push("| Vendor | Reputation Δ | Reputation rank | True capability | Capability rank | Gap |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const row of misranking.ranking) {
    lines.push(
      `| ${row.vendorName} | ${row.reputationDelta} | ${row.reputationRank} | ` +
      `${row.trueCapability} | ${row.capabilityRank} | ${row.gap} |`
    );
  }
  lines.push("");

  lines.push("## Per-agent fingerprints");
  lines.push("");
  for (const [id, f] of Object.entries(fingerprints)) {
    lines.push(`### ${f.vendorName}`);
    lines.push("");
    lines.push(`- observations: ${f.observations}`);
    lines.push(`- mean bid price: ${f.meanBidPrice}  |  mean true score: ${f.meanTrueScore}`);
    lines.push(
      `- cost-bid accuracy: ${f.costBidAccuracy.direction} ` +
      `(price ratio ${f.costBidAccuracy.priceRatio}, quality ratio ${f.costBidAccuracy.qualityRatio}, ` +
      `gap ${f.costBidAccuracy.gap})`
    );
    lines.push(
      `- confidence direction: ${f.confidenceDirection.label} ` +
      `(shortlist ${pct(f.confidenceDirection.shortlistRate)}, ` +
      `select ${pct(f.confidenceDirection.selectRate)}, ` +
      `accept ${pct(f.confidenceDirection.acceptRate)})`
    );
    const stratLine = Object.entries(f.strategicSignature.winRateByStrategy)
      .map(([k, v]) => `${k}=${pct(v)}`)
      .join(", ");
    lines.push(
      `- strategic signature: ${f.strategicSignature.label} ` +
      `(${stratLine}; concentration ${f.strategicSignature.concentration})`
    );
    lines.push(`- reputation Δ accumulated: ${f.reputationDelta}`);
    lines.push("");
  }

  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "Each agent is summarized along three behavioral dimensions extracted from the interaction log alone — no model internals, no provider metadata."
  );
  lines.push("");
  lines.push(
    "- **cost-bid accuracy** compares the price the agent bids against the true quality delivered. Underpriced + low quality = the canonical overconfident-underbidder pattern."
  );
  lines.push(
    "- **confidence direction** compares how often the agent is the buyer's top visible pick (shortlist rate) with how often the resulting work passes verification (accept rate). A wide gap is overconfidence visible in the bid presentation."
  );
  lines.push(
    "- **strategic signature** decomposes win rate by buyer strategy. Wins concentrated under one regime indicate the agent is exploiting that regime's blind spots, not demonstrating capability."
  );
  lines.push("");
  lines.push(
    "Reputation rank is computed from the arena's own reputation deltas. Capability rank is the mean true score across all bids. When the gap is positive, the reputation system would route work to the flagged vendor over a more capable one."
  );
  return lines.join("\n");
}

function misrankExplanation(row) {
  const f = row.fingerprint;
  const drivers = [];
  if (f.costBidAccuracy.direction === "underpriced") {
    drivers.push(
      `bids ${Math.abs(f.costBidAccuracy.gap)} below its delivered quality ratio, presenting cheaper than it performs`
    );
  } else if (f.costBidAccuracy.direction === "overpriced") {
    drivers.push(
      `bids ${Math.abs(f.costBidAccuracy.gap)} above its delivered quality ratio, presenting more expensive than it performs`
    );
  }
  if (f.confidenceDirection.label === "overconfident") {
    drivers.push(
      `shortlist rate (${pct(f.confidenceDirection.shortlistRate)}) outruns accept rate (${pct(f.confidenceDirection.acceptRate)}) — confidence overstates verified performance`
    );
  }
  if (f.strategicSignature.label === "matchup-exploiting") {
    const entries = Object.entries(f.strategicSignature.winRateByStrategy)
      .map(([k, v]) => `${k}=${pct(v)}`)
      .join(", ");
    drivers.push(`wins concentrated in specific buyer regimes (${entries})`);
  }
  if (drivers.length === 0) return "The fingerprint does not surface a single dominant driver — investigate manually.";
  return "Driver:\n\n- " + drivers.join("\n- ");
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}
