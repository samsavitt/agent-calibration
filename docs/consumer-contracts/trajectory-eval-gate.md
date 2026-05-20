# Trajectory Eval Gate Clerk Contract

`agent-calibration` is the consumer. Clerk remains domain-neutral: it records and
reviews judgment structure, but it does not know procurement arenas, vendors,
bids, reputation ranks, or pass/fail thresholds.

This contract defines the entries `agent-calibration` writes when it turns arena
trajectory logs into Clerk-auditable judgment data.

## Schemas used

`agent-calibration` uses two Clerk schemas for different purposes:

| Purpose | Clerk schema | Notes |
|---|---|---|
| Per-run, per-vendor trajectory decisions | `clerk/v1` | Uses `agent`, `action_type`, `input`, `decision`, and `reason`. |
| Aggregate gate authorization | `clerk/judgment/v1` | Uses `domain`, `authorizer_id`, `inputs_hash`, `judgment_payload`, and `outcome_window`; it does not use `action_type`. |

Clerk fills `schema`, `id`, and `ts` for `clerk/v1` entries if they are
missing. Clerk fills `judgment_id`, `decision_time`, and `outcome_attached` for
`clerk/judgment/v1` entries if they are missing.

## Required by the logger

Every `clerk/v1` trajectory entry must satisfy Clerk's base logger schema:

- `agent`: `agent-calibration-trajectory-eval`
- `action_type`: one of the action types listed below
- `input`: the arena observation being judged
- `decision`: one value from the vocabulary for that `action_type`
- `reason`: one or two sentences explaining the arena rule or signal

Every `clerk/judgment/v1` gate entry must satisfy Clerk's judgment schema:

- `schema`: `clerk/judgment/v1`
- `domain`: `trajectory-eval-gate`
- `authorizer_id`: the agent or human authorizing the gate result
- `inputs_hash`: SHA-256 of the canonicalized gate inputs
- `judgment_payload`: the gate verdict and supporting metrics
- `outcome_window`: when the gate result can be checked

## Trajectory entry shape

`agent-calibration` writes trajectory entries as per-vendor observation rows, not
only as positive arena events. This preserves denominators for shortlist rate,
selection rate, and accept rate.

| Field | Where | Meaning |
|---|---|---|
| `ref` | `input` | Stable pointer to the source row, formatted as `<source-path>#<run_id>/<vendor_id>/<action_type>`. |
| `run_id` | `input` | Arena run identifier, e.g. `market-brief-procurement__buyer-careful`. |
| `arena_id` | `input` | Arena or scenario identifier. |
| `buyer_id` | `input` | Buyer actor id. |
| `buyer_strategy` | `input` | Buyer strategy, e.g. `safety_first`, `cost_first`, or `speed_first`. |
| `vendor_id` | `input` | Stable vendor id used by the estimator. |
| `vendor_name` | `input` | Display name from the arena reputation block. |
| `event_action` | `input` | Source arena event when one exists, e.g. `shortlist_vendor`, `accept_bid`, `accept_outcome`, or `flag_outcome`. Omit for denominator rows inferred from absence. |
| `event_turn` | `input` | Arena turn number for the source event. Omit when no event exists. |
| `bid` | `input` | Compact bid facts: `price`, `delivery_minutes`, `linked_sources`, `counter_evidence`, and `refund_policy` when available. |
| `risk` | `input` | What can go wrong if this signal is trusted for routing or misranking detection. |
| `reversibility` | `input` | Use `easy` for replayable analysis rows; no arena state is mutated. |
| `outcome_window` | `input` or top level | Arena-specific horizon defined below. |
| `reviewer_question` | `input` or top level | The one question a human should answer to audit this event mapping. |
| `provenance` | top level | Source files, run ids, estimator version, and prior Clerk ids if any. |
| `scores` | top level | Numeric or short-label signals used by the estimator. |
| `tags` | top level | Include `agent-calibration`, `trajectory-eval-gate`, and the action type. |

Recommended `scores` keys:

| Score | Meaning |
|---|---|
| `bid_price` | Bid price from the arena event, when available. |
| `delivery_minutes` | Promised delivery time, when available. |
| `true_score` | Final total score for the vendor in the run. |
| `perceived_score` | Buyer-visible or perceived score, when available. |
| `reputation_delta` | Reputation delta assigned by the arena. |
| `evidence_score` | Final evidence score. |
| `safety_score` | Final safety score. |
| `hidden_failures` | Count of hidden failures. |
| `policy_failures` | Count of policy failures. |

## Action types and decisions

The consumer owns this vocabulary. Clerk should not validate it beyond string
shape.

| `action_type` | Source signal | Allowed `decision` values | Meaning |
|---|---|---|---|
| `arena-shortlist` | `shortlist_vendor` plus denominator rows | `shortlisted`, `not-shortlisted`, `reshortlisted` | Whether this vendor was the buyer's visible top pick in the run. Use `reshortlisted` when the vendor is selected by a later shortlist after challenge, withdrawal, or replacement. |
| `arena-bid-selection` | `accept_bid` plus denominator rows | `selected`, `not-selected`, `withdrawn-before-selection` | Whether this vendor's bid became the buyer-selected bid. This is not the same as final artifact acceptance. |
| `arena-accept-reject` | `accept_outcome` / `flag_outcome` plus denominator rows | `accepted`, `rejected`, `not-selected` | Whether the selected vendor's delivered artifact passed verification. Non-selected vendors receive `not-selected`, not `rejected`. |

Do not add arena-specific decision values to Clerk itself. If a future arena adds
challenge, revise, or withdraw gates that need independent audit, add a new
consumer action type here before logging those entries.

## Outcome window in the arena

`outcome_window` is not wall-clock time in the current arena. It names the point
in the simulated trajectory when the decision can be checked without guessing.

Use these strings:

| Value | Use for | Meaning |
|---|---|---|
| `same-run:after-verification` | `arena-shortlist` and `arena-bid-selection` | The decision is checkable after the run reaches `accept_outcome` or `flag_outcome` and final scores/reputation deltas are written. |
| `same-run:final` | `arena-accept-reject` | The entry is itself the verification outcome and can be checked against the run's final `status`, selected vendor, final scores, and policy failures. |
| `batch:after-fingerprint-report` | `clerk/judgment/v1` aggregate gate entries | The gate judgment is checkable after the batch report compares reputation rank, capability rank, and behavioral drivers across the configured tournament regimes. |

For the current day-3 mechanistic gate, `batch:after-fingerprint-report` means:
after at least three varied tournament regimes complete and the fingerprint
report measures whether misranking identification cleared the required threshold.

## Aggregate judgment payload

When recording the gate result with `clerk/judgment/v1`, `agent-calibration`
populates:

| Field | Meaning |
|---|---|
| `domain` | Always `trajectory-eval-gate`. |
| `authorizer_id` | `agent-calibration-gate` for an automated gate, or a human reviewer id for manual authorization. |
| `inputs_hash` | SHA-256 over canonical JSON containing source paths, run ids, estimator version, thresholds, and generated report paths. |
| `judgment_payload.verdict` | `pass`, `fail`, or `hold`. |
| `judgment_payload.gate` | Gate name, e.g. `day-3-mechanistic`. |
| `judgment_payload.regime_count` | Total number of tournament regimes included, including negative controls. |
| `judgment_payload.positive_regime_count` | Number of regimes expected to identify the target misranked vendor. |
| `judgment_payload.negative_control_count` | Number of regimes expected to identify no misranked vendor. |
| `judgment_payload.required_detection_rate` | Required threshold, currently `0.6` for the day-3 gate. |
| `judgment_payload.observed_detection_rate` | Observed misranking identification rate. |
| `judgment_payload.controls_passed` | Whether all negative controls behaved as expected. |
| `judgment_payload.misranked_vendor_id` | Vendor flagged by the report, if any. |
| `judgment_payload.drivers` | Short labels such as `overconfident`, `underpriced`, or `matchup-exploiting`. |
| `judgment_payload.counterexample` | A concise failing case or `null`. |
| `outcome_window` | `batch:after-fingerprint-report`. |

## Example trajectory entry

```json
{
  "agent": "agent-calibration-trajectory-eval",
  "action_type": "arena-shortlist",
  "input": {
    "ref": "Lab/gauntlet/arena/outcomes/all-runs.json#market-brief-procurement__buyer-careful/vectorscout/arena-shortlist",
    "run_id": "market-brief-procurement__buyer-careful",
    "arena_id": "market-brief-procurement",
    "buyer_id": "buyer-careful",
    "buyer_strategy": "safety_first",
    "vendor_id": "vectorscout",
    "vendor_name": "VectorScout",
    "event_action": "shortlist_vendor",
    "event_turn": 6,
    "bid": {
      "price": 80,
      "delivery_minutes": 90,
      "linked_sources": true,
      "counter_evidence": true,
      "refund_policy": "partial_refund_if_evidence_below_70"
    },
    "risk": "A visible shortlist can overstate true capability if verification later fails.",
    "reversibility": "easy",
    "outcome_window": "same-run:after-verification",
    "reviewer_question": "Does the shortlist mapping identify the vendor, buyer strategy, and later verifier outcome needed to compute confidence inflation?"
  },
  "decision": "shortlisted",
  "reason": "The buyer shortlisted VectorScout as the visible top bid before accepting a bid in this run.",
  "scores": {
    "bid_price": 80,
    "delivery_minutes": 90,
    "true_score": 77,
    "perceived_score": 80,
    "reputation_delta": 9,
    "evidence_score": 100,
    "safety_score": 94,
    "hidden_failures": 0,
    "policy_failures": 0
  },
  "provenance": [
    "Lab/gauntlet/arena/outcomes/all-runs.json",
    "agent-calibration/src/ingest.mjs"
  ],
  "tags": ["agent-calibration", "trajectory-eval-gate", "arena-shortlist"]
}
```

## Example aggregate judgment

```json
{
  "schema": "clerk/judgment/v1",
  "domain": "trajectory-eval-gate",
  "authorizer_id": "agent-calibration-gate",
  "inputs_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "judgment_payload": {
    "gate": "day-3-mechanistic",
    "verdict": "hold",
    "regime_count": 1,
    "positive_regime_count": 1,
    "negative_control_count": 0,
    "required_detection_rate": 0.6,
    "observed_detection_rate": null,
    "controls_passed": true,
    "misranked_vendor_id": "fastbrief",
    "drivers": ["overconfident", "matchup-exploiting"],
    "counterexample": "Only one deterministic tournament is available; the gate requires at least three varied regimes."
  },
  "outcome_window": "batch:after-fingerprint-report",
  "provenance": [
    "agent-calibration/runs/day3-<timestamp>/gate-report.json",
    "agent-calibration/NEXT.md"
  ],
  "tags": ["agent-calibration", "trajectory-eval-gate", "day-3-mechanistic"]
}
```

## Effective use

Use Clerk when a trajectory decision affects calibration, routing, or the gate
result:

- shortlist and re-shortlist observations,
- selected and not-selected bid observations,
- accepted, rejected, and not-selected verifier observations,
- aggregate pass/fail/hold judgments for the mechanistic gate.

Do not use Clerk for every raw arena event, rendering output, routine report
write, or estimator-internal calculation. Large raw payloads belong in source
files and report artifacts; Clerk entries should point to them through
`provenance`, `input.ref`, or `proposal_path`.
