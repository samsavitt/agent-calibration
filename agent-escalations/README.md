# Agent Calibration — Agent Escalation Protocol

Universal escalation protocol: `vault:.ai/workflows/agent-escalation.md`

This file adds agent-calibration-specific stopping conditions and context.

## Repo-specific stopping conditions

Fire an escalation (in addition to the universal conditions) when:

1. **Day-3 detection rate drops**: `npm run day3` produces a detection rate below 60% across positive regimes. Do not attempt to fix by adjusting the fingerprint threshold — this may mean the test fixture has changed or the Gauntlet source data is different from what the fingerprint was calibrated against.
2. **Clerk entry count diverges unexpectedly**: `npm run clerk:gate` writes a Clerk ledger with more than ±10% entries from the last verified baseline (541 entries as of 2026-05-20) without a task that explicitly changes the schema or regime count.
3. **Gauntlet source data modified**: any task that would change files under `Lab/gauntlet/arena/outcomes/`. That directory is a read-only fixture source — agent-calibration reads it, never writes it.
4. **Fingerprint claims a new misranked vendor**: if a run identifies a vendor as misranked that was not misranked in prior verified runs, do not treat it as a success without escalating. Could indicate fixture drift or a fingerprint bug, not a genuine new finding.
5. **Consumer contract changes**: any modification to `docs/consumer-contracts/trajectory-eval-gate.md` that would break the auth-infra replay engine. Check `Lab/auth-infra/NEXT.md` status table before changing the contract shape.

## Escalation file naming

`agent-escalations/ESCALATION-[YYYY-MM-DD]-[slug].md`

Examples:
- `ESCALATION-2026-05-21-detection-rate-below-threshold.md`
- `ESCALATION-2026-05-21-clerk-entry-count-divergence.md`

## Resolution

Sam adds a `## Resolution` section to the escalation file, or creates `RESUME-[slug].md`. Agent reads it at next session start before continuing.

## Current escalations

None.
