---
schema: repo-state/v1
repo_type: lab_experiment
capabilities: [security]
environment: Lab
---

# Agent Calibration

## Durable rules

- Treat Gauntlet outcomes as read-only source evidence.
- Keep calibration claims tied to reproducible runs and gate reports.
- Do not broaden into orchestration, observability, or outreach before richer live-runtime traces exist.

## Ownership boundary

This repo owns reputation/capability fingerprinting over arena traces. Gauntlet owns the arena source data, Clerk owns judgment logging, and auth-infra owns replay/gate checks.
