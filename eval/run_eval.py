"""Run PAKKA on labelled real site photos and print the numbers for the pitch.

Usage (from repo root):
  cd backend && GEMINI_API_KEY=... python ../eval/run_eval.py ../eval/labels.csv ../eval/photos
labels.csv columns: file,true_stage,claimed_milestone,expected_verdict
"""
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.milestones import PLAN_BY_ID  # noqa: E402
from app.perception import observe_media  # noqa: E402
from app.rules import decide  # noqa: E402

labels, photo_dir = Path(sys.argv[1]), Path(sys.argv[2])
rows = list(csv.DictReader(labels.open()))
stage_ok = verdict_ok = false_claims = false_caught = unusable = 0
confusion = Counter()

for r in rows:
    path = photo_dir / r["file"]
    if not path.exists():
        print(f"skip {r['file']} (missing)")
        continue
    m = PLAN_BY_ID[r["claimed_milestone"]]
    obs = observe_media(path, m.name + " done")
    rep = decide(m, [obs])
    unusable += not obs.usable
    stage_ok += obs.stage.value == r["true_stage"]
    verdict_ok += rep.verdict.value == r["expected_verdict"]
    confusion[(r["true_stage"], obs.stage.value)] += 1
    if r["expected_verdict"] == "not_proven":
        false_claims += 1
        false_caught += rep.verdict.value != "proven"
    mark = "OK " if rep.verdict.value == r["expected_verdict"] else "XX "
    print(f"{mark}{r['file']:<28} stage {obs.stage.value:<20} verdict {rep.verdict.value}")

n = len(rows)
print(f"\nStage accuracy      {stage_ok}/{n}")
print(f"Verdict accuracy    {verdict_ok}/{n}")
print(f"False claims caught {false_caught}/{false_claims}  (never paid for unfinished work)")
print(f"Asked for retake    {unusable}/{n}")
print("\nMost common stage mix-ups:")
for (t, p), c in confusion.most_common():
    if t != p:
        print(f"  true {t} -> said {p}  x{c}")
