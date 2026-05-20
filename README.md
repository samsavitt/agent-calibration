# agent-calibration

Behavioral fingerprinting for LLM agent procurement markets.

LLM agent markets that clear on bid prices and reputation deltas systematically favor overconfident bidders over best performers. This library detects that misranking from interaction logs alone — identifying which agents are overvalued by reputation and naming the behavioral driver.

## The problem

When you route work to LLM agents based on bids and reputation scores, three failure modes compound:

- **Cost-bid inaccuracy** — agents underprice relative to delivered quality, winning work they can't perform at the implied margin
- **Confidence inflation** — shortlist rate (how often an agent is selected as top pick) diverges from accept rate (how often the work actually passes verification)
- **Matchup exploitation** — an agent wins consistently against one buyer strategy type but fails against others, masking a narrow capability profile behind an aggregate reputation score

The result: after enough rounds, reputation rank diverges from true-capability rank. The agents at the top of your leaderboard are not necessarily your best performers.

## How it works

Three behavioral parameters are estimated per agent from a round-by-round log of bids, outcomes, and reputation deltas:

| Parameter | What it measures |
|-----------|-----------------|
| Cost-bid accuracy | Mean bid price vs. mean delivered quality score |
| Confidence direction | Shortlist rate minus accept rate |
| Strategic signature | Win rate decomposed by buyer strategy type |

**Misranking detection:** for each agent, compare true-capability rank (mean final score) against reputation rank (cumulative reputation delta). Agents whose reputation rank materially exceeds their capability rank are flagged with the behavioral driver named.

## Usage

No runtime dependencies. Requires Node.js with ES module support.

```bash
# Run against the default arena output
npm run fingerprint

# Run against a specific log file
node bin/fingerprint.mjs path/to/runs.json

# Run the Day-3 mechanistic gate against Gauntlet regimes
npm run day3

# Convert a Day-3 gate report into Clerk ledger entries
npm run clerk:gate -- runs/day3-<timestamp>/gate-report.json
```

**Input** — a JSON array of round records, each containing per-agent bid price, final score, shortlist/accept events, reputation delta, and buyer strategy. Schema: `src/ingest.mjs`. The current source fixture is `Lab/gauntlet/arena/outcomes/all-runs.json`.

**Output** — two files written to `runs/`:
- `fingerprints.json` — behavioral parameters and misranking flags per agent
- `summary.md` — readable report naming misranked agents and the driver for each

The Day-3 gate writes a gitignored `runs/day3-<timestamp>/` bundle containing regime inputs, per-regime fingerprint reports, `gate-report.json`, `summary.md`, and optional Clerk ledger/report artifacts. The gate includes positive regimes and a negative control.

## Example output

```
FastBrief: MISRANKED
  Reputation rank: 2  |  True-capability rank: 3
  Driver: confidence inflation (shortlist 67%, accept 22%)
  Bid presentation consistently over-sells capability;
  buyers select at high rates but work fails verification
```

## Status

Early-stage. Validated on single-tournament runs (9 rounds, 4 agents, 3 buyer strategies) and a Day-3 variation harness over 4 positive Gauntlet tournament regimes plus 1 negative control. The next validation target is richer Gauntlet live-runtime traces, especially gated actions, rework/dispute paths, and non-scripted reputation movement.

## Data format

The estimator is data-source-agnostic — any per-round log with the expected schema works. It was developed with a procurement simulation but applies to any multi-agent system that produces bid/outcome/reputation records.

## Related

- The behavioral fingerprinting approach is grounded in empirical findings that LLM agent cost bids are systematically wrong by 2-10x and that strategic dominance is matchup-dependent rather than capability-ranked.
- [The Judgment Layer](https://ssavitt.substack.com) — writing on AI agent accountability and the infrastructure layer it requires.

## License

MIT
