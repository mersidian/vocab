"""Pull IPA, phrasal verbs and idioms from the kaikki.org English Wiktionary extract.

Input:   data/raw/kaikki/english.jsonl.gz   (https://kaikki.org/dictionary/English/)
Output:  data/build/ipa.json           entry id / lowercase word -> IPA
         data/build/extra_entries.json phrasal verb + idiom entries
         data/build/extra_decks.json   their decks
         data/build/glosses.json       entry id -> short English glosses (input for writing Thai content)

Run:  python3 -I scripts/wiktionary.py
"""
import gzip, json, re, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "kaikki" / "english.jsonl.gz"
BUILD = ROOT / "data" / "build"

POS_MAP = {"noun": "noun", "verb": "verb", "adj": "adj", "adv": "adv", "prep": "prep", "conj": "conj",
           "pron": "pron", "det": "det", "intj": "interj", "num": "num", "particle": "particle"}
DOWNRANK_TAGS = {"obsolete", "archaic", "rare", "dated", "dialectal", "nonstandard", "historical"}
# The extract carries no "English phrasal verbs"/"English idioms" categories, so:
#  phrasal verb = verb entry "<verb> <particle>[ <particle>]"
#  idiom        = other multi-word entry with a sense tagged "idiomatic"
PARTICLES = {"up", "down", "in", "out", "off", "on", "away", "back", "over", "through", "around", "round",
             "about", "along", "across", "by", "after", "into", "for", "with", "apart", "ahead", "forward",
             "aside", "behind", "together", "onto", "upon", "against", "at", "from", "to", "of", "past", "under"}


def slug(w):
    return re.sub(r"[^a-z0-9]+", "-", w.lower()).strip("-") or "x"


def pick_ipa(sounds):
    """Prefer General American, then RP; avoid weak forms, regional and historical variants."""
    best, best_score = None, -99
    for s in sounds or []:
        ipa = s.get("ipa")
        if not ipa or not ipa.startswith(("/", "[")):
            continue
        tags = set(s.get("tags", []))
        note = (s.get("note") or "").lower()
        if tags & {"Early", "Modern", "obsolete", "dated", "archaic"}:
            continue
        score = 3 if tags & {"US", "General-American"} else 2 if tags & {"UK", "Received-Pronunciation"} else 1
        if "weak" in note or tags & {"unstressed", "weak"}:
            score -= 5
        if "strong" in note:
            score += 1
        if re.search(r"scotland|ireland|australia|new zealand|south africa|india|canada|northern england|wales|southern british", note):
            score -= 3
        if score > best_score:
            best, best_score = ipa.split(" [")[0].split(", ")[0], score
    return best


def categories(entry):
    cats = set()
    for c in entry.get("categories", []):
        cats.add(c if isinstance(c, str) else c.get("name", ""))
    for s in entry.get("senses", []):
        for c in s.get("categories", []):
            cats.add(c if isinstance(c, str) else c.get("name", ""))
    return cats


def usable_senses(entry):
    out = []
    for s in entry.get("senses", []):
        tags = set(s.get("tags", []))
        if "form-of" in tags or "alt-of" in tags or not s.get("glosses"):
            continue
        out.append((s["glosses"][-1], bool(tags & DOWNRANK_TAGS)))
    return out


def main():
    base = json.loads((BUILD / "entries.json").read_text(encoding="utf-8"))
    want = collections.defaultdict(list)          # lower word -> [(id, pos)]
    for e in base:
        want[e["w"].lower()].append((e["id"], e["pos"]))
        for a in e.get("alt", []):
            want[a.lower()].append((e["id"], e["pos"]))

    ipa_by_id, ipa_by_word = {}, {}
    gloss_by_id = collections.defaultdict(list)
    multi = {}                                     # word -> info for phrasal verbs / idioms

    with gzip.open(RAW, "rt", encoding="utf-8") as f:
        for n, line in enumerate(f):
            e = json.loads(line)
            if e.get("lang_code") != "en":
                continue
            word = e.get("word", "")
            pos = POS_MAP.get(e.get("pos"), e.get("pos"))
            low = word.lower()

            # 1. IPA + glosses for entries we already have
            if low in want:
                ipa = pick_ipa(e.get("sounds"))
                if ipa and low not in ipa_by_word:
                    ipa_by_word[low] = ipa
                for eid, epos in want[low]:
                    if epos is None or epos == pos:
                        if ipa and eid not in ipa_by_id:
                            ipa_by_id[eid] = ipa
                        for g, _ in usable_senses(e)[:4]:
                            if len(gloss_by_id[eid]) < 4 and g not in gloss_by_id[eid]:
                                gloss_by_id[eid].append(g)

            # 2. phrasal verbs and idioms
            if " " not in word and "-" not in word:
                continue
            if e.get("pos") in ("name", "proverb", "character", "symbol", "prefix", "suffix", "affix"):
                continue
            parts = low.split()
            sense_tags = {t for sn in e.get("senses", []) for t in sn.get("tags", [])}
            if (e.get("pos") == "verb" and 2 <= len(parts) <= 3 and parts[0].isalpha()
                    and all(x in PARTICLES for x in parts[1:])):
                kind = "phrasal"
            elif len(parts) >= 2 and "idiomatic" in sense_tags:
                kind = "idiom"
            else:
                continue
            senses = usable_senses(e)
            if not senses:
                continue
            m = multi.setdefault(low, {"w": word, "kind": kind, "senses": [], "trans": 0, "pos": set()})
            if kind == "phrasal":
                m["kind"] = "phrasal"
            m["senses"] += senses
            m["trans"] += len(e.get("translations", [])) + sum(len(s.get("translations", [])) for s in e.get("senses", []))
            m["pos"].add(pos)
            if n % 200000 == 0:
                print(f"  line {n:,}: ipa {len(ipa_by_id):,}, multi {len(multi):,}", flush=True)

    # popularity proxy: translations + senses, minus obsolete/rare-only items
    def score(m):
        live = sum(1 for _, down in m["senses"] if not down)
        return (live > 0, m["trans"] + 3 * live)

    extra_entries, decks = [], {"phrasal": [], "idiom": []}
    for low, m in sorted(multi.items(), key=lambda kv: score(kv[1]), reverse=True):
        eid = f"{slug(m['w'])}_{'pv' if m['kind'] == 'phrasal' else 'idiom'}"
        extra_entries.append({"id": eid, "w": m["w"], "pos": "verb" if m["kind"] == "phrasal" else None,
                              "lvl": None, "kind": m["kind"], "src": ["wiktionary"], "decks": []})
        gloss_by_id[eid] = [g for g, down in m["senses"] if not down][:4] or [g for g, _ in m["senses"][:2]]
        decks[m["kind"]].append(eid)

    out_decks = [
        {"id": "phrasal-verbs", "title": "Phrasal Verbs", "category": "Phrasal Verbs & Idioms", "ids": decks["phrasal"]},
        {"id": "idioms", "title": "Idioms", "category": "Phrasal Verbs & Idioms", "ids": decks["idiom"]},
    ]
    by_id = {e["id"]: e for e in extra_entries}
    for d in out_decks:
        for eid in d["ids"]:
            by_id[eid]["decks"].append(d["id"])

    ipa = {**ipa_by_word, **ipa_by_id}
    (BUILD / "ipa.json").write_text(json.dumps(ipa, ensure_ascii=False), encoding="utf-8")
    (BUILD / "extra_entries.json").write_text(json.dumps(extra_entries, ensure_ascii=False, indent=0), encoding="utf-8")
    (BUILD / "extra_decks.json").write_text(json.dumps(out_decks, ensure_ascii=False, indent=1), encoding="utf-8")
    (BUILD / "glosses.json").write_text(json.dumps(gloss_by_id, ensure_ascii=False), encoding="utf-8")
    print(f"IPA for {len(ipa_by_id):,}/{len(base):,} entries; phrasal verbs {len(decks['phrasal']):,}; idioms {len(decks['idiom']):,}")


if __name__ == "__main__":
    main()
