#!/usr/bin/env python3
"""Generates parity fixtures for Beacon and Beacon Pro from their original source.

The original files are only read. This script takes the pure part of each
main.py (input schema, scoring maps, scoring, insights, rule based advisory,
prompt builders) as text, and runs it with a tiny stand in for pydantic. The
part that connects to Supabase, OpenAI, Resend, or renders PDFs is never
loaded, so nothing leaves this machine.

Usage:
  python scripts/parity/generate_beacon.py <path to beamx-scorecard> <path to beamx-scorecard-v2>

Output: fixtures/parity/beacon/*.json
"""

import json
import random
import subprocess
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Literal, get_args

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "fixtures" / "parity" / "beacon"

PRELUDE = '''
from typing import Dict, List, Literal, get_args
from dataclasses import dataclass
import datetime, re, logging
logger = logging.getLogger("parity")

class _Field:
    pass

def Field(**kwargs):
    return _Field()

EmailStr = str

class BaseModel:
    """Stand in for pydantic.BaseModel: checks Literal values, stores fields."""
    def __init__(self, **data):
        for name, annotation in self.__class__.__annotations__.items():
            if name not in data:
                raise ValueError(f"missing field {name}")
            options = get_args(annotation)
            if options and data[name] not in options:
                raise ValueError(f"{name}: {data[name]!r} is not an allowed option")
            setattr(self, name, data[name])
    def model_dump(self):
        return {k: getattr(self, k) for k in self.__class__.__annotations__}
'''


def source_info(repo: Path) -> dict:
    def git(*args: str) -> str:
        return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

    return {
        "remote": git("remote", "get-url", "origin"),
        "commit": git("rev-parse", "HEAD"),
        "commitDate": git("log", "-1", "--format=%cs"),
        "uncommittedChanges": bool(git("status", "--porcelain")),
    }


def load_pure_part(main_py: Path, start: str, end: str) -> dict:
    text = main_py.read_text(encoding="utf-8")
    i, j = text.find(start), text.find(end)
    if i < 0 or j < 0 or j <= i:
        raise SystemExit(f"Could not find the pure section in {main_py} ({start!r} .. {end!r})")
    namespace: dict = {}
    exec(compile(PRELUDE + text[i:j], f"{main_py} (pure part)", "exec"), namespace)
    return namespace


def score_to_dict(score, with_insights: bool) -> dict:
    def cat(c):
        out = {
            "name": c.name,
            "score": c.score,
            "max": c.max_score,
            "percentage": c.percentage,
            "grade": c.grade,
        }
        if with_insights:
            out["insights"] = c.insights
        return out

    return {
        "total_score": score.total_score,
        "readiness_level": score.readiness_level,
        "breakdown": {
            "financial_health": cat(score.financial_health),
            "customer_strength": cat(score.customer_strength),
            "operational_maturity": cat(score.operational_maturity),
            "financial_intelligence": cat(score.financial_intelligence),
            "growth_resilience": cat(score.growth_resilience),
        },
        "flags": {"critical": score.critical_flags, "opportunities": score.opportunity_flags},
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    v1_repo, v2_repo = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()

    v1 = load_pure_part(v1_repo / "main.py", "class BeaconSMEInput", "def generate_pdf_report")
    v2 = load_pure_part(v2_repo / "main.py", "class BeaconProInput", '@app.post("/generate-report-stream")')

    Input = v1["BeaconSMEInput"]
    fields = {name: list(get_args(t)) for name, t in Input.__annotations__.items()}
    choice_fields = {k: v for k, v in fields.items() if v}
    contact = {
        "fullName": "Ada Test",
        "email": "ada@example.com",
        "businessName": "Test Ventures",
    }

    # Every scoring map in v1, keyed by the field it scores, so we can pick the
    # best and worst option of each question.
    maps = {
        "cashFlow": "CASH_FLOW_MAP", "profitMargin": "PROFIT_MARGIN_MAP",
        "cashRunway": "CASH_RUNWAY_MAP", "paymentSpeed": "PAYMENT_SPEED_MAP",
        "repeatCustomerRate": "REPEAT_RATE_MAP", "acquisitionChannel": "ACQUISITION_MAP",
        "pricingPower": "PRICING_POWER_MAP", "founderDependency": "FOUNDER_DEPENDENCY_MAP",
        "processDocumentation": "PROCESS_DOC_MAP", "inventoryTracking": "INVENTORY_MAP",
        "expenseAwareness": "EXPENSE_AWARENESS_MAP", "profitPerProduct": "PROFIT_PER_PRODUCT_MAP",
        "pricingStrategy": "PRICING_STRATEGY_MAP", "businessTrajectory": "TRAJECTORY_MAP",
        "revenueDiversification": "DIVERSIFICATION_MAP", "digitalPayments": "DIGITAL_PAYMENTS_MAP",
        "formalRegistration": "FORMALIZATION_MAP", "infrastructure": "INFRASTRUCTURE_MAP",
        "bankingRelationship": "BANKING_MAP",
    }
    best = {f: max(v1[m], key=v1[m].get) for f, m in maps.items()}
    worst = {f: min(v1[m], key=v1[m].get) for f, m in maps.items()}

    rand = random.Random(20261119)

    def random_answers() -> dict:
        return {**contact, **{k: rand.choice(v) for k, v in choice_fields.items()}}

    def answers(*layers: dict) -> dict:
        base = {**contact, "industry": "Retail/Trade", "yearsInBusiness": "3-5 years",
                "primaryPainPoint": "Getting more customers/sales"}
        for layer in layers:
            base = {**base, **layer}
        return base

    def run(data: dict):
        s1 = v1["calculate_beacon_score"](v1["BeaconSMEInput"](**data))
        s2 = v2["calculate_score"](v2["BeaconProInput"](**data))
        return s1, s2

    # Search random answer sets for totals near each readiness boundary.
    boundary_cases = {}
    targets = {85: "scale-ready", 70: "stable", 50: "building", 30: "survival"}
    for _ in range(200_000):
        if len(boundary_cases) == 2 * len(targets):
            break
        data = random_answers()
        total = v1["calculate_beacon_score"](v1["BeaconSMEInput"](**data)).total_score
        for edge, label in targets.items():
            above, below = f"just-above-{label}-{edge}", f"just-below-{label}-{edge}"
            if edge <= total < edge + 1.5 and above not in boundary_cases:
                boundary_cases[above] = data
            if edge - 1.5 <= total < edge and below not in boundary_cases:
                boundary_cases[below] = data

    named = {
        "all-best": answers(best, {"primaryPainPoint": "Actually doing well, want to optimize"}),
        "all-worst": answers(worst, {"primaryPainPoint": "Managing cash flow/getting paid"}),
        "all-dont-know": answers(best, {k: "Don't know" for k, v in choice_fields.items() if "Don't know" in v}),
        "service-business-no-inventory": answers(best, {"inventoryTracking": "Not applicable (service business)",
                                                        "industry": "Professional Services"}),
        "young-business": answers(worst, {"yearsInBusiness": "Less than 1 year",
                                          "businessTrajectory": "Less than 1 year old"}),
        **boundary_cases,
    }
    # One case per pain point and per industry, on otherwise random answers,
    # so every advisory branch is captured.
    for pain in fields["primaryPainPoint"]:
        named[f"pain-{pain}"] = {**random_answers(), "primaryPainPoint": pain}
    for industry in fields["industry"]:
        named[f"industry-{industry}"] = {**random_answers(), "industry": industry}

    # Fill each named answer set in to a full, valid input.
    named = {name: {**random_answers(), **data} for name, data in named.items()}

    report_cases = []
    for name, data in named.items():
        s1, s2 = run(data)
        report_cases.append({
            "name": name,
            "answers": data,
            "expected": {
                "beacon": {
                    **score_to_dict(s1, with_insights=True),
                    "structured_advisory": v1["build_structured_advisory"](s1),
                },
                "beaconPro": {
                    **score_to_dict(s2, with_insights=False),
                    "user_prompt": v2["_build_pro_user_prompt"](v2["BeaconProInput"](**data), s2),
                },
            },
        })

    scoring_cases = []
    mismatches = 0
    half_up_differs = 0
    for i in range(200):
        data = random_answers()
        s1, s2 = run(data)
        d1, d2 = score_to_dict(s1, True), score_to_dict(s2, False)
        # Beacon and Beacon Pro must score identically apart from the emoji.
        stripped = d1["readiness_level"].split(" ", 1)[-1]
        same = (d1["total_score"] == d2["total_score"] and stripped == d2["readiness_level"]
                and d1["flags"] == d2["flags"]
                and all({k: c[k] for k in ("score", "percentage", "grade")}
                        == {k: d2["breakdown"][n][k] for k in ("score", "percentage", "grade")}
                        for n, c in d1["breakdown"].items()))
        mismatches += 0 if same else 1
        scoring_cases.append({"name": f"random-{i + 1:03d}", "answers": data,
                              "expected": d1, "expectedProReadinessLevel": d2["readiness_level"]})

    # Python's round() is round half to even; JavaScript ports usually round
    # half up. Check whether that ever matters on these inputs.
    for case in scoring_cases + report_cases:
        d = case["answers"]
        m = lambda f: v1[maps[f]][d[f]]  # noqa: E731
        fh = (m("cashFlow") + m("profitMargin") + m("cashRunway") + m("paymentSpeed")) / 20 * 20
        cs = (m("repeatCustomerRate") + m("acquisitionChannel") + m("pricingPower")) / 15 * 20
        om = (m("founderDependency") + m("processDocumentation") + m("inventoryTracking")) / 15 * 20
        fi = (m("expenseAwareness") + m("profitPerProduct") + m("pricingStrategy")) / 15 * 20
        gr = ((m("businessTrajectory") + m("revenueDiversification")) / 10 * 12
              + m("digitalPayments") / 5 * 2 + m("formalRegistration") / 5 * 3
              + m("infrastructure") / 5 * 2 + m("bankingRelationship") / 5 * 1)
        for raw in (fh, cs, om, fi, gr, fh + cs + om + fi + gr):
            half_up = float(Decimal(repr(raw)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
            if half_up != round(raw, 1):
                half_up_differs += 1

    if mismatches:
        raise SystemExit(f"Beacon and Beacon Pro scoring differ on {mismatches} cases")

    src1, src2 = source_info(v1_repo), source_info(v2_repo)
    OUT.mkdir(parents=True, exist_ok=True)

    questions = {
        name: (options if options else {"type": "free text"})
        for name, options in fields.items()
    }
    write = lambda name, obj: (OUT / name).write_text(  # noqa: E731
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    write("questions.json", {
        "source": {"beacon": src1, "beaconPro": src2},
        "note": "Field order is the form order. Option strings are the exact values the API accepts.",
        "fields": questions,
        "scoreMaps": {f: v1[m] for f, m in maps.items()},
    })
    write("scoring.json", {
        "source": {"beacon": src1, "beaconPro": src2},
        "note": "Random answer sets. expected is Beacon's output; Beacon Pro scores identically except readiness_level has no emoji.",
        "checks": {
            "beaconProScoresIdentical": True,
            "casesChecked": len(scoring_cases),
            "roundHalfUpWouldDiffer": half_up_differs,
        },
        "cases": scoring_cases,
    })
    write("reports.json", {
        "source": {"beacon": src1, "beaconPro": src2},
        "note": "Named answer sets covering every readiness band, pain point and industry. structured_advisory is Beacon's rule based advisory before the AI polish step. user_prompt is the exact prompt Beacon Pro sends the model.",
        "beaconProSystemPrompt": v2["_build_pro_system_prompt"](),
        "cases": report_cases,
    })
    print(f"beacon: {len(scoring_cases)} scoring cases, {len(report_cases)} report cases, "
          f"pro identical, half up differs on {half_up_differs} values")


if __name__ == "__main__":
    main()
