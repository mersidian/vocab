"""Validate generated content against its batch file.

Usage:  python3 -I scripts/check_content.py data/gen/todo/b0001.json data/content/b0001.jsonl
Prints problems; exit code 1 if any row is missing or malformed.
"""
import json, re, sys

THAI = re.compile(r"[฀-๿]")


def main(batch_path, out_path):
    batch = json.load(open(batch_path, encoding="utf-8"))
    rows = {}
    problems = []
    for n, line in enumerate(open(out_path, encoding="utf-8"), 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError as e:
            problems.append(f"line {n}: bad JSON ({e})")
            continue
        rows[r.get("id")] = r
    for item in batch:
        r = rows.get(item["id"])
        if not r:
            problems.append(f"{item['id']}: missing")
            continue
        for field in ("th", "ex", "exTh"):
            if not isinstance(r.get(field), str) or not r[field].strip():
                problems.append(f"{item['id']}: empty {field}")
        if r.get("th") and not THAI.search(r["th"]):
            problems.append(f"{item['id']}: th has no Thai")
        if r.get("exTh") and not THAI.search(r["exTh"]):
            problems.append(f"{item['id']}: exTh has no Thai")
        if r.get("ex") and THAI.search(r["ex"]):
            problems.append(f"{item['id']}: ex contains Thai")
        if r.get("ex") and len(r["ex"].split()) > 25:
            problems.append(f"{item['id']}: example too long")
        if not item.get("pos") and not r.get("pos") and not item.get("kind"):
            problems.append(f"{item['id']}: pos not filled")
    extra = set(rows) - {i["id"] for i in batch}
    if extra:
        problems.append(f"unexpected ids: {sorted(extra)[:5]}")
    for p in problems:
        print(p)
    print(f"{len(rows)}/{len(batch)} rows, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
