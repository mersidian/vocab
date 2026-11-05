"""Split entries that still need Thai content into batch files for writing.

Order: CEFR A1 -> C2 (each by frequency), then list-only words, then phrasal verbs, then idioms.
Output: data/gen/todo/<prefix>0001.json ...  (each a list of {id, w, pos, lvl, kind, gloss})
        Content for todo/<name>.json is written to data/content/<name>.jsonl, so use a new
        prefix for every run to keep file names unique.

Run:  python3 -I scripts/make_batches.py <prefix> [batch_size] [levels|rest|all]
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data" / "build"
CONTENT = ROOT / "data" / "content"
TODO = ROOT / "data" / "gen" / "todo"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def main():
    prefix = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    scope = sys.argv[3] if len(sys.argv) > 3 else "all"
    entries = json.loads((BUILD / "entries.json").read_text(encoding="utf-8"))
    extra_p = BUILD / "extra_entries.json"
    entries += json.loads(extra_p.read_text(encoding="utf-8")) if extra_p.exists() else []
    gloss_p = BUILD / "glosses.json"
    glosses = json.loads(gloss_p.read_text(encoding="utf-8")) if gloss_p.exists() else {}

    done = set()
    for f in CONTENT.glob("*.jsonl") if CONTENT.exists() else []:
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["id"])

    def key(e):
        if e.get("kind") == "phrasal":
            group = 8
        elif e.get("kind") == "idiom":
            group = 9
        elif e.get("lvl"):
            group = LEVELS.index(e["lvl"])
        else:
            group = 6
        return (group, e.get("rank", 0))

    todo = [e for e in sorted(entries, key=key) if e["id"] not in done]
    if scope == "levels":
        todo = [e for e in todo if e.get("lvl")]
    elif scope == "rest":
        todo = [e for e in todo if not e.get("lvl")]
    TODO.mkdir(parents=True, exist_ok=True)
    if any(TODO.glob(f"{prefix}*.json")):
        sys.exit(f"todo files with prefix {prefix!r} already exist; pick a new prefix")
    for i in range(0, len(todo), size):
        rows = [{k: v for k, v in {
            "id": e["id"], "w": e["w"], "pos": e.get("pos"), "lvl": e.get("lvl"), "kind": e.get("kind"),
            "gloss": glosses.get(e["id"], [])[:3],
        }.items() if v} for e in todo[i:i + size]]
        (TODO / f"{prefix}{i // size + 1:04d}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(done)} done, {len(todo)} to write in {(len(todo) + size - 1) // size} batches of {size}")


if __name__ == "__main__":
    main()
