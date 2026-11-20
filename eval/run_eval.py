"""Run PAKKA on labelled site photos and print the numbers for the pitch.

Usage (from pakka/backend):
  python ../eval/run_eval.py ../eval/labels.csv ../eval/photos            # uses .env / environment
  python ../eval/run_eval.py ../eval/labels.csv ../eval/photos --workers 4

labels.csv columns: file,true_stage,claimed_milestone,expected_verdict[,notes]
  true_stage "unusable" means the photo should be rejected for a retake (blurred, not a site, ...).

Every photo goes through the same ingest as the app (decode, EXIF-rotate, strip metadata, resize),
then Gemini observes it blind and rules.py decides. Raw observations are saved to eval/runs/*.jsonl
so thresholds can be re-tuned later without paying for new API calls.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import media, perception, store  # noqa: E402
from app.milestones import PLAN_BY_ID  # noqa: E402
from app.prompts import PROMPT_VERSION_HASH  # noqa: E402
from app.rules import RULES_VERSION, decide  # noqa: E402


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - r) / d, (c + r) / d


def pct(k: int, n: int) -> str:
    if n == 0:
        return "  n/a"
    lo, hi = wilson(k, n)
    return f"{k}/{n} = {k / n:5.0%}  (95% CI {lo:.0%}-{hi:.0%})"


def run_one(row: dict, photo_dir: Path, work: Path) -> dict:
    src = photo_dir / row["file"]
    out = {"file": row["file"], **{k: row.get(k) for k in ("true_stage", "claimed_milestone", "expected_verdict", "notes")}}
    raw = src.read_bytes()
    try:
        item = media.ingest(src.name, raw, store.sha256_bytes(raw))
    except media.RejectedUpload as e:
        return {**out, "error": f"rejected at upload: {e}"}
    path = work / f"{Path(row['file']).stem[:40]}{item.ext}"
    path.write_bytes(item.data)
    t0 = time.monotonic()
    try:
        obs = perception.observe_media(path, item.mime)
    except perception.PerceptionError as e:
        return {**out, "error": str(e)}
    report = decide(PLAN_BY_ID[row["claimed_milestone"]], [obs])
    return {**out, "latency_s": round(time.monotonic() - t0, 2), "observation": obs.model_dump(mode="json"),
            "verdict": report.verdict.value, "headline": report.headline,
            "findings": [f.text for f in report.findings]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("labels", type=Path)
    ap.add_argument("photos", type=Path)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent / "runs")
    ap.add_argument("--rpm", type=float, default=0, help="max Gemini calls per minute (free tier: 5); 0 = no limit")
    args = ap.parse_args()
    # The eval can afford to wait out rate limits; the live app keeps its short defaults.
    os.environ.setdefault("GEMINI_RETRY_MAX_WAIT_S", "75")
    os.environ.setdefault("GEMINI_MAX_ATTEMPTS", "6")

    rows = list(csv.DictReader(args.labels.open(encoding="utf-8")))
    present = [r for r in rows if (args.photos / r["file"]).exists()]
    for r in rows:
        if r not in present:
            print(f"skip   {r['file']} (file missing)")
    labelled = {r["file"] for r in rows}
    for f in sorted(args.photos.iterdir()):
        if f.is_file() and f.name != ".gitkeep" and f.name not in labelled:
            print(f"unlabelled  {f.name} (add it to labels.csv to include it)")

    print(f"\nBackend {perception.backend_name()} · model {perception.MODEL} · prompt {PROMPT_VERSION_HASH} · "
          f"rules v{RULES_VERSION} · {len(present)} photos\n")

    gap = 60.0 / args.rpm if args.rpm else 0.0
    lock, last = threading.Lock(), [0.0]

    def paced(row):
        if gap:
            with lock:  # space out the start of each call so we stay under the per-minute quota
                delay = last[0] + gap - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                last[0] = time.monotonic()
        r = run_one(row, args.photos, Path(tmp))
        status = r.get("error") or f"{r['observation']['stage']} -> {r['verdict']}"
        print(f"  .. {row['file'][:44]:<44} {status}", flush=True)
        return r

    workers = 1 if gap else args.workers
    with tempfile.TemporaryDirectory(prefix="pakka_eval_") as tmp, ThreadPoolExecutor(workers) as pool:
        results = list(pool.map(paced, present))

    stage_ok = stage_n = verdict_ok = 0
    false_claims = caught = should_pay = false_pay = 0
    retake_expected = retake_right = errors = 0
    mixups: dict[tuple[str, str], int] = {}

    for r in results:
        if "error" in r:
            errors += 1
            print(f"ERR {r['file']:<44} {r['error']}")
            continue
        o, v, exp, true = r["observation"], r["verdict"], r["expected_verdict"], r["true_stage"]
        got_stage = o["stage"] if o["usable"] else "unusable"
        if true == "unusable":
            retake_expected += 1
            retake_right += not o["usable"]
        else:
            stage_n += 1
            stage_ok += got_stage == true
            if got_stage != true:
                mixups[(true, got_stage)] = mixups.get((true, got_stage), 0) + 1
        verdict_ok += v == exp
        if exp == "not_proven":
            false_claims += 1
            caught += v != "proven"
        if v == "proven":
            should_pay += 1
            false_pay += exp != "proven"
        mark = "OK " if v == exp else "XX "
        print(f"{mark}{r['file'][:44]:<44} saw {got_stage:<19} ({o['stage_confidence']:.2f})  "
              f"verdict {v:<15} expected {exp}   {r['latency_s']}s")

    n = len(results) - errors
    print("\n" + "-" * 78)
    print(f"Stage accuracy        {pct(stage_ok, stage_n)}")
    print(f"Verdict accuracy      {pct(verdict_ok, n)}")
    print(f"False claims caught   {pct(caught, false_claims)}   (unfinished work never shown as proven)")
    print(f"False-pay rate        {pct(false_pay, should_pay)}   (of 'proven' verdicts, how many were wrong)")
    print(f"Retake requests       {pct(retake_right, retake_expected)}   (bad photos correctly rejected)")
    if errors:
        print(f"Errors                {errors}")
    if mixups:
        print("\nStage mix-ups:")
        for (t, g), c in sorted(mixups.items(), key=lambda kv: -kv[1]):
            print(f"  true {t:<19} -> saw {g:<19} x{c}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = args.out_dir / f"{stamp}_{perception.backend_name().split(':')[0]}_{perception.MODEL}_{PROMPT_VERSION_HASH}.jsonl"
    with out.open("w", encoding="utf-8") as fh:
        for r in results:
            fh.write(json.dumps({"model": perception.MODEL, "prompt": PROMPT_VERSION_HASH, "rules": RULES_VERSION, **r}) + "\n")
    print(f"\nRaw observations saved to {out}")


if __name__ == "__main__":
    main()
