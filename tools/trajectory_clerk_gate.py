#!/usr/bin/env python3
"""Write Clerk entries for the agent-calibration trajectory gate.

This is the consumer bridge. Clerk stays domain-neutral; all arena vocabulary
lives here and in docs/consumer-contracts/trajectory-eval-gate.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert an agent-calibration Day-3 gate report into Clerk entries."
    )
    parser.add_argument("gate_report", help="runs/day3-*/gate-report.json")
    parser.add_argument(
        "--ledger",
        help="output Clerk JSONL path (default: beside gate report as clerk-ledger.jsonl)",
    )
    parser.add_argument(
        "--clerk-src",
        default="../clerk/src",
        help="path to Clerk src directory, relative to agent-calibration",
    )
    args = parser.parse_args(argv)

    project_root = Path(__file__).resolve().parents[1]
    gate_report_path = Path(args.gate_report)
    if not gate_report_path.is_absolute():
        gate_report_path = project_root / gate_report_path
    if not gate_report_path.exists():
        print(f"trajectory-clerk-gate: gate report not found: {gate_report_path}", file=sys.stderr)
        return 2

    clerk_src = (project_root / args.clerk_src).resolve()
    if not clerk_src.exists():
        print(f"trajectory-clerk-gate: clerk src not found: {clerk_src}", file=sys.stderr)
        return 2

    sys.path.insert(0, str(clerk_src))
    from clerk import build_report, load_entries, log, render_markdown  # noqa: PLC0415

    gate_report = json.loads(gate_report_path.read_text(encoding="utf-8"))
    ledger_path = Path(args.ledger) if args.ledger else gate_report_path.parent / "clerk-ledger.jsonl"
    if not ledger_path.is_absolute():
        ledger_path = project_root / ledger_path
    if ledger_path.exists():
        ledger_path.unlink()

    entry_count = 0
    for regime in gate_report["regimes"]:
        runs_path = project_root / regime["path"]
        payload = json.loads(runs_path.read_text(encoding="utf-8"))
        for run in payload["runs"]:
            entries = trajectory_entries(
                run,
                source_path=regime["path"],
                gate_report_path=relative(project_root, gate_report_path),
            )
            for entry in entries:
                log(entry, log_path=ledger_path)
                entry_count += 1

    log(gate_judgment_entry(gate_report, project_root, gate_report_path), log_path=ledger_path)
    entry_count += 1

    report = build_report(load_entries(ledger_path))
    report_path = ledger_path.with_name("clerk-report.md")
    report_path.write_text(render_markdown(report), encoding="utf-8")
    print(f"entries={entry_count} ledger={relative(project_root, ledger_path)} report={relative(project_root, report_path)}")
    return 0


def trajectory_entries(
    run: dict[str, Any],
    *,
    source_path: str,
    gate_report_path: str,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    shortlist_events = [event for event in run["events"] if event.get("action") == "shortlist_vendor"]
    accept_event = find_event(run["events"], "accept_bid")
    verify_event = find_event(run["events"], "accept_outcome") or find_event(run["events"], "flag_outcome")
    if not accept_event or not verify_event:
        return entries

    for vendor_id, scores in run.get("finalScores", {}).items():
        vendor_name = vendor_name_for(run, vendor_id)
        bid_event = bid_event_for(run["events"], vendor_name)
        bid = bid_event.get("detail") if bid_event else {}

        shortlist_index = next(
            (index for index, event in enumerate(shortlist_events) if event["detail"].get("vendor") == vendor_name),
            None,
        )
        if shortlist_index is None:
            shortlist_decision = "not-shortlisted"
            shortlist_event = None
        elif shortlist_index == 0:
            shortlist_decision = "shortlisted"
            shortlist_event = shortlist_events[shortlist_index]
        else:
            shortlist_decision = "reshortlisted"
            shortlist_event = shortlist_events[shortlist_index]

        selected = run.get("selectedVendor") == vendor_name
        withdrawn = withdrew_before_selection(run["events"], vendor_name)
        selection_decision = (
            "selected" if selected else "withdrawn-before-selection" if withdrawn else "not-selected"
        )
        accept_reject_decision = (
            "accepted" if selected and run.get("status") == "accepted"
            else "rejected" if selected
            else "not-selected"
        )

        entries.append(make_entry(
            action_type="arena-shortlist",
            decision=shortlist_decision,
            reason=shortlist_reason(vendor_name, shortlist_decision, run),
            run=run,
            vendor_id=vendor_id,
            vendor_name=vendor_name,
            scores=scores,
            bid=bid,
            source_path=source_path,
            gate_report_path=gate_report_path,
            event=shortlist_event,
            risk="A visible shortlist can overstate true capability if verification later fails.",
            outcome_window="same-run:after-verification",
            reviewer_question="Does the shortlist mapping identify the vendor, buyer strategy, and later verifier outcome needed to compute confidence inflation?",
        ))
        entries.append(make_entry(
            action_type="arena-bid-selection",
            decision=selection_decision,
            reason=selection_reason(vendor_name, selection_decision, run),
            run=run,
            vendor_id=vendor_id,
            vendor_name=vendor_name,
            scores=scores,
            bid=bid,
            source_path=source_path,
            gate_report_path=gate_report_path,
            event=accept_event if selected else None,
            risk="A selected bid may look economically attractive while hiding downstream verification failures.",
            outcome_window="same-run:after-verification",
            reviewer_question="Does the selection mapping preserve the selected vendor and all non-selected denominators?",
        ))
        entries.append(make_entry(
            action_type="arena-accept-reject",
            decision=accept_reject_decision,
            reason=accept_reject_reason(vendor_name, accept_reject_decision, run),
            run=run,
            vendor_id=vendor_id,
            vendor_name=vendor_name,
            scores=scores,
            bid=bid,
            source_path=source_path,
            gate_report_path=gate_report_path,
            event=verify_event if selected else None,
            risk="A failed selected artifact is the delayed outcome that exposes overconfident routing.",
            outcome_window="same-run:final",
            reviewer_question="Does the verifier outcome line up with selected vendor, final status, and policy failures?",
        ))
    return entries


def make_entry(
    *,
    action_type: str,
    decision: str,
    reason: str,
    run: dict[str, Any],
    vendor_id: str,
    vendor_name: str,
    scores: dict[str, Any],
    bid: dict[str, Any],
    source_path: str,
    gate_report_path: str,
    event: dict[str, Any] | None,
    risk: str,
    outcome_window: str,
    reviewer_question: str,
) -> dict[str, Any]:
    input_data = {
        "ref": f"{source_path}#{run['runId']}/{vendor_id}/{action_type}",
        "run_id": run["runId"],
        "arena_id": run.get("arenaId", ""),
        "regime_id": run.get("regime", {}).get("id", ""),
        "buyer_id": run["buyer"]["id"],
        "buyer_strategy": run["buyer"]["strategy"],
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "bid": compact_bid(bid),
        "risk": risk,
        "reversibility": "easy",
        "outcome_window": outcome_window,
        "reviewer_question": reviewer_question,
    }
    if event is not None:
        input_data["event_action"] = event.get("action")
        input_data["event_turn"] = event.get("turn")

    return {
        "agent": "agent-calibration-trajectory-eval",
        "action_type": action_type,
        "input": input_data,
        "decision": decision,
        "reason": reason,
        "scores": compact_scores(scores, run, vendor_id, bid),
        "provenance": [source_path, gate_report_path, "agent-calibration/src/ingest.mjs"],
        "tags": ["agent-calibration", "trajectory-eval-gate", action_type],
    }


def gate_judgment_entry(
    gate_report: dict[str, Any],
    project_root: Path,
    gate_report_path: Path,
) -> dict[str, Any]:
    hash_payload = {
        "gate": gate_report["gate"],
        "source": gate_report["source"],
        "requiredDetectionRate": gate_report["requiredDetectionRate"],
        "expectedMisrankedVendorId": gate_report["expectedMisrankedVendorId"],
        "regimes": [
            {
                "id": regime["id"],
                "kind": regime["kind"],
                "path": regime["path"],
                "expectedMisrankedVendorId": regime["expectedMisrankedVendorId"],
                "detectedMisrankedVendorId": regime["detectedMisrankedVendorId"],
            }
            for regime in gate_report["regimes"]
        ],
    }
    inputs_hash = hashlib.sha256(
        json.dumps(hash_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    drivers = sorted({
        driver
        for regime in gate_report["regimes"]
        for driver in drivers_for(regime)
    })
    counterexamples = [
        f"{regime['id']}: expected {regime['expectedMisrankedVendorId']}, detected {regime['detectedMisrankedVendorId'] or 'none'}"
        for regime in gate_report["regimes"]
        if not regime["passed"]
    ]
    return {
        "schema": "clerk/judgment/v1",
        "domain": "trajectory-eval-gate",
        "authorizer_id": "agent-calibration-gate",
        "inputs_hash": inputs_hash,
        "judgment_payload": {
            "gate": gate_report["gate"],
            "verdict": gate_report["verdict"],
            "regime_count": gate_report["regimeCount"],
            "positive_regime_count": gate_report["positiveRegimeCount"],
            "negative_control_count": gate_report["negativeControlCount"],
            "required_detection_rate": gate_report["requiredDetectionRate"],
            "observed_detection_rate": gate_report["observedDetectionRate"],
            "controls_passed": gate_report["controlsPassed"],
            "misranked_vendor_id": gate_report["expectedMisrankedVendorId"],
            "drivers": drivers,
            "counterexample": "; ".join(counterexamples) if counterexamples else None,
        },
        "outcome_window": "batch:after-fingerprint-report",
        "provenance": [relative(project_root, gate_report_path)],
        "tags": ["agent-calibration", "trajectory-eval-gate", gate_report["gate"]],
    }


def compact_bid(bid: dict[str, Any]) -> dict[str, Any]:
    return {
        "price": bid.get("price"),
        "delivery_minutes": bid.get("deliveryMinutes"),
        "linked_sources": bid.get("linkedSources"),
        "counter_evidence": bid.get("counterEvidence"),
        "refund_policy": bid.get("refundPolicy"),
    }


def compact_scores(
    scores: dict[str, Any],
    run: dict[str, Any],
    vendor_id: str,
    bid: dict[str, Any],
) -> dict[str, Any]:
    rep = run.get("reputation", {}).get(vendor_id, {})
    return {
        "bid_price": bid.get("price"),
        "delivery_minutes": bid.get("deliveryMinutes"),
        "true_score": scores.get("total"),
        "perceived_score": scores.get("perceived"),
        "reputation_delta": rep.get("delta", 0),
        "evidence_score": scores.get("evidence"),
        "safety_score": scores.get("safety"),
        "hidden_failures": len(scores.get("hiddenFailures") or []),
        "policy_failures": len(scores.get("policyFailures") or []),
    }


def drivers_for(regime: dict[str, Any]) -> list[str]:
    if regime["expectedMisrankedVendorId"] is None:
        return []
    row = next(
        (item for item in regime["ranking"] if item["vendorId"] == regime["expectedMisrankedVendorId"]),
        None,
    )
    if not row:
        return []
    drivers = []
    if row["gap"] > 0:
        drivers.append("overranked-by-reputation")
    return drivers


def bid_event_for(events: list[dict[str, Any]], vendor_name: str) -> dict[str, Any] | None:
    return next(
        (event for event in events if event.get("action") == "propose_bid" and event.get("actor") == vendor_name),
        None,
    )


def find_event(events: list[dict[str, Any]], action: str) -> dict[str, Any] | None:
    return next((event for event in events if event.get("action") == action), None)


def vendor_name_for(run: dict[str, Any], vendor_id: str) -> str:
    return run.get("reputation", {}).get(vendor_id, {}).get("name", vendor_id)


def withdrew_before_selection(events: list[dict[str, Any]], vendor_name: str) -> bool:
    return any(
        event.get("action") == "respond_to_challenge"
        and event.get("actor") == vendor_name
        and event.get("detail", {}).get("withdrawn") is True
        for event in events
    )


def shortlist_reason(vendor_name: str, decision: str, run: dict[str, Any]) -> str:
    if decision == "shortlisted":
        return f"The buyer shortlisted {vendor_name} as the visible top bid in this run."
    if decision == "reshortlisted":
        return f"The buyer re-shortlisted {vendor_name} after an earlier candidate changed state."
    return f"{vendor_name} was not shortlisted; this denominator row preserves shortlist-rate calculation."


def selection_reason(vendor_name: str, decision: str, run: dict[str, Any]) -> str:
    if decision == "selected":
        return f"The buyer accepted {vendor_name}'s bid before artifact delivery."
    if decision == "withdrawn-before-selection":
        return f"{vendor_name} withdrew during challenge response before selection."
    return f"{vendor_name} was not selected; this denominator row preserves selection-rate calculation."


def accept_reject_reason(vendor_name: str, decision: str, run: dict[str, Any]) -> str:
    if decision == "accepted":
        return f"{vendor_name}'s selected artifact passed verification."
    if decision == "rejected":
        return f"{vendor_name}'s selected artifact was flagged by verification."
    return f"{vendor_name} was not selected, so no artifact acceptance decision applied."


def relative(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())
