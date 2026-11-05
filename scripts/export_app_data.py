"""Build the static data files the web app loads.

Inputs:  data/build/entries.json, data/build/decks.json      (from build_entries.py)
         data/build/extra_entries.json, extra_decks.json     (from wiktionary step, optional)
         data/content/*.jsonl                                (generated Thai content, optional)
         data/build/ipa.json                                 (from wiktionary step, optional)
Output:  public/data/index.json   decks + shard info
         public/data/s<N>.json    entry shards (contiguous ranges of the global order)

Run:  python3 -I scripts/export_app_data.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data" / "build"
CONTENT = ROOT / "data" / "content"
OUT = ROOT / "public" / "data"
SHARD = 1500


def load(p, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def main():
    entries = load(BUILD / "entries.json", [])
    decks = load(BUILD / "decks.json", [])
    entries += load(BUILD / "extra_entries.json", [])
    decks += load(BUILD / "extra_decks.json", [])
    ipa = load(BUILD / "ipa.json", {})

    content = {}
    if CONTENT.exists():
        for f in sorted(CONTENT.glob("*.jsonl")):
            for line in f.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    row = json.loads(line)
                    content[row["id"]] = row

    # Phrasal verbs / idioms: drop slurs, then order each deck by how common the writer rated
    # it (c = 5 everyday ... 1 rare), keeping the Wiktionary popularity order within a rating.
    rules = [l.strip() for l in (ROOT / "data" / "exclude.txt").read_text(encoding="utf-8").splitlines()
             if l.strip() and not l.startswith("#")] if (ROOT / "data" / "exclude.txt").exists() else []
    keep = {l[5:] for l in rules if l.startswith("keep ")}
    listed = {l for l in rules if not l.startswith("keep ")}
    multi = {e["id"] for e in entries if e.get("kind")}
    flagged = {i for i in multi if content.get(i, {}).get("note", "").lower().startswith("slur")}
    dropped = (listed | flagged) - keep
    entries = [e for e in entries if e["id"] not in dropped]
    for d in decks:
        d["ids"] = [i for i in d["ids"] if i not in dropped]
        if d["ids"] and all(i in multi for i in d["ids"]):
            pos = {i: n for n, i in enumerate(d["ids"])}
            d["ids"].sort(key=lambda i: (-int(content.get(i, {}).get("c") or 2), pos[i]))
    if dropped:
        print(f"left out {len(dropped)} slurs: {sorted(dropped)}")

    order = {e["id"]: i for i, e in enumerate(entries)}
    compact = []
    for e in entries:
        c = content.get(e["id"], {})
        item = {"id": e["id"], "w": e["w"]}
        pos = e.get("pos") or c.get("pos")
        if pos:
            item["p"] = pos
        if e.get("lvl"):
            item["l"] = e["lvl"]
        if e.get("kind"):
            item["k"] = e["kind"]
        if e.get("alt"):
            item["a"] = e["alt"]
        i = ipa.get(e["id"]) or ipa.get(e["w"].lower())
        if i:
            item["i"] = i
        for src, dst in (("th", "t"), ("ex", "x"), ("exTh", "xt"), ("note", "n")):
            if c.get(src):
                item[dst] = c[src]
        compact.append(item)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("s*.json"):
        old.unlink()
    shards = 0
    for start in range(0, len(compact), SHARD):
        (OUT / f"s{shards}.json").write_text(
            json.dumps(compact[start:start + SHARD], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        shards += 1

    index = {
        "version": len(content),
        "total": len(compact),
        "shardSize": SHARD,
        "shards": shards,
        "withContent": sum(1 for e in compact if "t" in e),
        "decks": [{
            "id": d["id"], "title": d["title"], "category": d["category"],
            "composed": d.get("composed", False),
            "items": [order[i] for i in d["ids"] if i in order],
        } for d in decks],
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.glob("*.json"))
    print(f"{len(compact)} entries, {shards} shards, {len(decks)} decks, "
          f"{index['withContent']} with Thai content, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
