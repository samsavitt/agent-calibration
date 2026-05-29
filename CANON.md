# CANON — Operating Constitution

Universal federal rules for Vault, Lab, Ops, Studio, Agora, ai-learning, and future governed workspaces. CANON contains the constitution only: principles and rules. Operating procedures, session state, logs, schemas, and adapter mechanics live elsewhere.

Last updated: 2026-05-29

---

## Principles

**P-01 — Legibility:** Federal rules must be stateable in plain English, defensible from first principles, and falsifiable.

**P-02 — Load-bearing minimum:** CANON holds only rules whose absence permits catastrophic drift or cross-surface governance failure.

**P-03 — Layer discipline:** Federal, environment, state, and capability layers have separate jobs. Rules that need local context belong below federal.

**P-04 — Enforcement and amendment:** A rule without an enforcement path is aspiration. A rule without an amendment path fossilizes or gets abandoned silently.

**P-05 — Feedback closure:** Governance learns from execution. Friction, outcomes, and environment lessons need a path back to rule review.

**P-06 — Behavioral realism:** Rule design accounts for incentives, attention, trust, measurement, ownership, and principal-agent divergence.

**P-07 — Capability separation:** What a surface can do is governed separately from what it must do. Capabilities need admission, quality, retirement, conflict resolution, and rule mapping.

**P-08 — Knowledge interconnectivity:** Governance knowledge must be retrievable, cross-linked, updateable, and injected at task time rather than remembered by discipline.

---

## Rules

**R-01 — Session outcomes and claims.** Every session produces a running artifact, committed change, or named decision. Analytical and generative outputs must name what would falsify or change their position, and must distinguish validated evidence from assumptions.

**R-02 — Federal-rule admission.** A federal rule must be plain-language, load-bearing, layer-correct, falsifiable, and tied to at least one principle. Rules that fail this test move to an environment, state, workflow, capability registry, or archive.

**R-03 — Enumerated authority.** Federal authority is enumerated and limited. The residual default belongs to the local layer, and each governed system must state what it will not do.

CLI authority is separately enumerated. **Full-authority CLIs** operate on all governed surfaces, carry obligations under every federal rule, and must maintain enforcement hook coverage verified by `cli_parity_audit.py`. Admission to full-authority status requires: (1) stable cross-session identity, (2) full read/write access to all governed surfaces, (3) parity-verified hook coverage, (4) functionally equivalent adapter files with any intentional differences limited to a documented `Intentional adapter differences` section. **Full-authority list (v0): Claude Code, Codex.** Any CLI not on this list must carry a declared specialized role with explicit rule scoping, or is ungoverned. Ungoverned CLIs may not modify governance surfaces or make governance-binding decisions. Admission to and removal from the full-authority list requires explicit CANON amendment.

**R-04 — Enforcement, amendment, and termination.** Every federal rule must name an enforcement mode, amendment path, and abort or terminal condition. Enforcement modes must come from a registry once the registry exists.

**R-05 — Feedback and return paths.** Each federal rule needs a return path from execution friction or measured outcomes to rule review. Lessons from any environment that bear on federal governance must reach a federal review surface.

**R-06 — Delegation, incentives, and seams.** Delegated authority assumes principal-agent divergence. Multi-agent, cross-CLI, and authority-handoff seams require explicit contracts; rules that rely on human behavior must name the behavioral anchor and drift mode.

**R-07 — Catastrophe gates.** Where failure crosses a defined catastrophe class or irreversibility threshold, reliability gates are non-negotiable and defects must be rejected at the earliest, lowest-value stage possible.

**R-08 — Anti-gaming.** Where actors can benefit from gaming a rule, the rule must include a guardrail, independent cross-check, or structural separation between incentive and measurement.

**R-09 — Capability governance.** Capability building is a durable process, not a rescue action. Every governed repo must declare its capabilities in its adapter files; a false or missing declaration is a blocking audit condition. The capability layer must maintain admission, freshness, retirement, conflict resolution, and mappings from capabilities to federal rules.

**R-10 — Conditional federal rules.** Conditional federal rules apply only when their condition is true for a repo or surface. Current conditions include generation project, AI model in governance pipeline, agent runtime, data/modeling work, algorithmic decision-making, multi-regime environment, state/local autonomy, and state-changing deployment.

**R-11 — AI and agent surfaces.** If an AI model stores governance knowledge in parametric form, governance knowledge must also exist in an externally updateable non-parametric layer. If agent runtimes act on a governed surface, they need API, CLI, and named skill or workflow access.

**R-12 — Decision visibility and knowledge sync.** Algorithmic governance decisions require visible criteria, authorship, and decision records. State-changing deployments are knowledge events: before execution, the actor must scope the blast radius by identifying dependent systems, surfaces, and knowledge and confirming the scope before proceeding; after execution, dependent knowledge surfaces must receive a reciprocal report by being updated or explicitly marked stale.

**R-13 — Adapter parity.** Every federal rule must be behaviorally expressible through every governance-CLI adapter, or explicitly classified as adapter-only. Contradictory adapter behavior means the rule is malformed.

**R-14 — Parallel dispatch and communication feasibility.** Parallel work is allowed only when co-dispatched inputs are independent and contradiction-resolution cost is bounded. Communication-path feasibility is a precondition for enforceability.

**R-15 — External-effect gates.** External publication, live capital, irreversible operations, destructive repo actions, and shared-infrastructure changes require the named approval path for that surface. Agora queues; Sam posts.

**R-16 — Code-change discipline.** Code work follows four gates: think before coding, simplicity first, surgical changes, and goal-driven execution. Surface assumptions and tradeoffs before acting; write the minimum code that solves the problem; touch only lines traceable to the request and clean only residue created by the change; define success criteria and verify them before claiming completion. If ambiguity prevents a surgical, verifiable change, stop and name the ambiguity.

**R-17 — Data and model rigor.** Data/modeling work starts from the decision it serves, the unit of analysis, the target/label or defensible proxy, data provenance, leakage and contamination risks, and the evaluation split before model choice. It must compare against a simple baseline, justify added complexity (ensembles, random forests or boosting, neural models, causal or simulation layers, regression/classification hybrids), align the training objective with the deployed decision, report uncertainty and error slices, and document refresh or retirement conditions. If no real outcome or defensible proxy exists, do not present regression, classification, or ensemble output as validated modeling.
