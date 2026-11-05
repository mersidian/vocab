"""Merge the open word lists into one entry table and a deck index.

Output: data/build/entries.json  (list of entries, no generated content yet)
        data/build/decks.json    (deck metadata + ordered entry ids)

Run:  python3 -I scripts/build_entries.py
"""
import csv, html, json, re, zipfile, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources"
OUT = ROOT / "data" / "build"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

POS_MAP = {
    "noun": "noun", "verb": "verb", "adjective": "adj", "adverb": "adv",
    "preposition": "prep", "conjunction": "conj", "pronoun": "pron",
    "determiner": "det", "interjection": "interj", "number": "num",
    "modal verb": "verb", "modal auxiliary": "modal", "be-verb": "verb", "do-verb": "verb", "have-verb": "verb",
    "infinitive-to": "particle", "vern": "verb",
}


def norm(w):
    return re.sub(r"\s+", " ", w.replace("\xa0", " ")).strip().strip('"')


def slug(w):
    s = re.sub(r"[^a-z0-9]+", "-", w.lower()).strip("-")
    return s or "x"


# ---------------------------------------------------------------- frequency
def load_frequency():
    """word(lower) -> total corpus frequency (Words-CEFR-Dataset, MIT)."""
    words = {}
    with open(SRC / "wcd" / "words.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            words[r["word_id"]] = r["word"].lower()
    freq = collections.Counter()
    with open(SRC / "wcd" / "word_pos.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            w = words.get(r["word_id"])
            if w:
                freq[w] += float(r["frequency_count"] or 0)
    return freq


# ---------------------------------------------------------------- lists
def read_lines(p):
    raw = (SRC / p).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:      # a few NGSL files are Windows-1252 (café, résumé)
        text = raw.decode("cp1252")
    return text.splitlines()


def first_col(p, skip_header=True, col=0):
    out = []
    for i, line in enumerate(read_lines(p)):
        if not line.strip() or line.startswith("#"):
            continue
        if skip_header and i == 0:
            continue
        cells = line.split(",")
        if len(cells) > col and cells[col].strip():
            out.append(norm(cells[col]))
    return out


def fel_list():
    lines = read_lines("ngsl/FEL_12_stats.csv")
    start = next(i for i, l in enumerate(lines) if l.startswith("Word,"))
    out = []
    for l in lines[start + 1:]:
        w = l.split(",")[0].strip()
        if w:
            out.extend(norm(x) for x in w.split(" / "))
    return out


def moel_list():
    z = zipfile.ZipFile(SRC / "ngsl" / "Oral-English-Medical-Corpus.xlsx")
    shared = [html.unescape(re.sub(r"<[^>]+>", "", m))
              for m in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode()
    vals = [norm(shared[int(v)]) for v in re.findall(r't="s"[^>]*><v>(\d+)</v>', sheet)]
    return [v for v in vals if v and not re.search(r"(?i)^(word|rank|list|medical|oral)", v)]


# deck id, title, category, loader, attribution key
LIST_DECKS = [
    ("ngsl", "Core 2,800 (NGSL)", "General", lambda: first_col("ngsl/NGSL_12_stats.csv") + first_col("ngsl/SUP_lemmatized.csv", False), "ngsl"),
    ("spoken", "Spoken English (NGSL-S)", "General", lambda: first_col("ngsl/NGSL-Spoken_12_stats.csv"), "ngsl"),
    ("readers", "Graded Readers (NGSL-GR)", "General", lambda: first_col("ngsl/NGSL-GR_rank.csv", True, 1), "ngsl"),
    ("kids", "Children's Words (New Dolch)", "General", lambda: first_col("ngsl/NDL_11_stats.csv", True, 1), "ngsl"),
    ("academic", "Academic (NAWL)", "Academic & Exams", lambda: first_col("ngsl/NAWL_12_lemmatized_for_teaching.csv", False), "ngsl"),
    ("toeic", "TOEIC (TSL)", "Academic & Exams", lambda: first_col("ngsl/TSL_12_stats.csv"), "ngsl"),
    ("business", "Business (BSL)", "Specialized", lambda: first_col("ngsl/BSL_120_stats.csv"), "ngsl"),
    ("fitness", "Fitness (FEL)", "Specialized", fel_list, "ngsl"),
    ("medical", "Medical (MOEL)", "Specialized", moel_list, "moel"),
    ("bible", "Bible (BEL)", "Specialized", lambda: first_col("ngsl/BEL_10_stats.csv"), "ngsl"),
]

# Exam-prep decks composed from CEFR levels + lists (no official lists are redistributable).
EXAM_DECKS = [
    ("exam-ielts-toefl", "IELTS / TOEFL Academic (prep)", {"levels": ["B2", "C1"], "decks": ["academic"]}),
    ("exam-ket", "Cambridge A2 Key level (prep)", {"levels": ["A2"]}),
    ("exam-pet", "Cambridge B1 Preliminary level (prep)", {"levels": ["B1"]}),
    ("exam-fce", "Cambridge B2 First level (prep)", {"levels": ["B2"]}),
    ("exam-cae", "Cambridge C1 Advanced level (prep)", {"levels": ["C1"]}),
    ("exam-cpe", "Cambridge C2 Proficiency level (prep)", {"levels": ["C2"]}),
    ("exam-cutep", "CU-TEP / TU-GET (prep)", {"levels": ["B1", "B2", "C1"], "decks": ["academic"]}),
    ("exam-tgat", "TGAT / A-Level English (prep)", {"levels": ["B1", "B2"]}),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    freq = load_frequency()
    entries = {}            # id -> entry
    by_word = collections.defaultdict(list)   # lower word -> [ids]

    def add(word, pos, level, source):
        key = (word.lower(), pos)
        eid = f"{slug(word)}_{slug(pos) if pos else 'x'}"
        e = entries.get(eid)
        if e is None:
            e = entries[eid] = {"id": eid, "w": word, "pos": pos, "lvl": level, "src": [], "decks": []}
            by_word[word.lower()].append(eid)
        elif level and (e["lvl"] is None or LEVELS.index(level) < LEVELS.index(e["lvl"])):
            e["lvl"] = level
        if source not in e["src"]:
            e["src"].append(source)
        return e

    # 1. CEFR-J (A1-B2) and Octanove (C1-C2)
    for fname, source in [("cefrj-vocabulary-profile-1.5.csv", "cefrj"),
                          ("octanove-vocabulary-profile-c1c2-1.0.csv", "octanove")]:
        with open(SRC / "olp" / fname, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                variants = [norm(v) for v in r["headword"].split("/") if norm(v)]
                pos = POS_MAP.get(r["pos"].strip().lower(), r["pos"].strip().lower() or None)
                e = add(variants[0], pos, r["CEFR"].strip(), source)
                alts = [v for v in variants[1:] if v.lower() != variants[0].lower()]
                if alts:
                    e["alt"] = sorted(set(e.get("alt", []) + alts))
                for v in alts:
                    if e["id"] not in by_word[v.lower()]:
                        by_word[v.lower()].append(e["id"])

    # 2. Frequency-list decks: attach to every existing entry for that headword, else create one.
    list_order = {}
    for deck_id, _title, _cat, loader, source in LIST_DECKS:
        order, seen = [], set()
        for word in loader():
            if not word or word.lower() in seen:
                continue
            seen.add(word.lower())
            ids = by_word.get(word.lower())
            if not ids:
                ids = [add(word, None, None, source)["id"]]
            for eid in ids:
                if source not in entries[eid]["src"]:
                    entries[eid]["src"].append(source)
                order.append(eid)
        list_order[deck_id] = order

    # 3. Frequency rank (higher corpus frequency = lower rank number)
    def f(e):
        return freq.get(e["w"].lower(), 0)
    for rank, e in enumerate(sorted(entries.values(), key=lambda e: (-f(e), e["w"].lower())), 1):
        e["rank"] = rank

    # 4. Decks
    decks = []
    for lv in LEVELS:
        ids = sorted((e["id"] for e in entries.values() if e["lvl"] == lv), key=lambda i: entries[i]["rank"])
        decks.append({"id": f"cefr-{lv.lower()}", "title": f"Level {lv}", "category": "Levels", "ids": ids})
    for deck_id, title, cat, _l, _s in LIST_DECKS:
        ids = list_order[deck_id]
        if deck_id in ("academic",):          # alphabetical source -> order by frequency
            ids = sorted(ids, key=lambda i: entries[i]["rank"])
        decks.append({"id": deck_id, "title": title, "category": cat, "ids": ids})
    deck_ids = {d["id"]: d for d in decks}
    for deck_id, title, spec in EXAM_DECKS:
        ids = []
        for lv in spec.get("levels", []):
            ids += deck_ids[f"cefr-{lv.lower()}"]["ids"]
        for d in spec.get("decks", []):
            ids += deck_ids[d]["ids"]
        ids = sorted(dict.fromkeys(ids), key=lambda i: entries[i]["rank"])
        decks.append({"id": deck_id, "title": title, "category": "Exam Prep", "ids": ids, "composed": True})

    for d in decks:
        for eid in d["ids"]:
            if d["id"] not in entries[eid]["decks"]:
                entries[eid]["decks"].append(d["id"])

    out_entries = sorted(entries.values(), key=lambda e: e["rank"])
    (OUT / "entries.json").write_text(json.dumps(out_entries, ensure_ascii=False, indent=0), encoding="utf-8")
    (OUT / "decks.json").write_text(json.dumps(decks, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"entries: {len(out_entries)}  (with POS {sum(1 for e in out_entries if e['pos'])}, "
          f"no level {sum(1 for e in out_entries if not e['lvl'])})")
    for d in decks:
        print(f"  {d['category']:<17} {d['id']:<18} {len(d['ids']):>6}  {d['title']}")


if __name__ == "__main__":
    main()
