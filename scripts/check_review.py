"""Validate a review decision file against its batch.

Usage: python3 -I scripts/check_review.py data/review/todo/rv01.json data/review/done/rv01.jsonl
"""
import json, re, sys

THAI = re.compile(r"[฀-๿]")


def main(batch_path, out_path):
    ids = [x["id"] for g in json.load(open(batch_path, encoding="utf-8")) for x in g]
    rows, problems = {}, []
    for n, line in enumerate(open(out_path, encoding="utf-8"), 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError as e:
            problems.append(f"line {n}: bad JSON ({e})")
            continue
        rows[r.get("id")] = r
    for i in ids:
        r = rows.get(i)
        if not r:
            problems.append(f"{i}: missing")
            continue
        a = r.get("action")
        if a not in ("keep", "drop", "fix"):
            problems.append(f"{i}: action must be keep, drop or fix")
        if a == "drop" and not r.get("why"):
            problems.append(f"{i}: drop needs why")
        if a == "fix":
            if not any(k in r for k in ("th", "ex", "exTh", "note")):
                problems.append(f"{i}: fix changes nothing")
            for k in ("th", "exTh"):
                if k in r and not THAI.search(r[k]):
                    problems.append(f"{i}: {k} has no Thai")
            if "ex" in r and (THAI.search(r["ex"]) or not r["ex"].strip()):
                problems.append(f"{i}: ex must be English")
    extra = set(rows) - set(ids)
    if extra:
        problems.append(f"unexpected ids: {sorted(extra)[:5]}")
    for p in problems:
        print(p)
    acts = [rows[i].get("action") for i in ids if i in rows]
    print(f"{len(rows)}/{len(ids)} rows, keep {acts.count('keep')}, fix {acts.count('fix')}, drop {acts.count('drop')}, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
