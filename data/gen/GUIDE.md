# Writing Thai content for a batch

Each batch file `data/gen/todo/bNNNN.json` is a list of items:

```json
{"id": "decide_verb", "w": "decide", "pos": "verb", "lvl": "A2", "gloss": ["To resolve or settle..."]}
```

`pos`, `lvl`, `kind` (`phrasal` or `idiom`) and `gloss` (English senses from Wiktionary) may be missing.

Write `data/content/bNNNN.jsonl`: one JSON object per line, one line per item, same order, same `id`.

```json
{"id":"decide_verb","th":"ตัดสินใจ; ตกลงใจ","ex":"She decided to study abroad next year.","exTh":"เธอตัดสินใจไปเรียนต่อต่างประเทศปีหน้า"}
```

## Fields

- `th` (required): Thai meaning for **this part of speech**. Up to 3 short meanings, most common first, separated by `; `. Use the natural word a Thai dictionary would give, not an explanation. For phrasal verbs and idioms give the common figurative meaning.
- `ex` (required): one natural English sentence that uses the word in this part of speech and its most common meaning. Keep it short (6–15 words) and match the level: A1–A2 use very simple words around it; C1–C2 can be richer. Use everyday, modern contexts. No names of real people.
- `exTh` (required): a natural Thai translation of `ex` (how a Thai speaker would say it, not word-for-word).
- `pos` (only when the item has no `pos` and no `kind`): the word's main part of speech, one of `noun, verb, adj, adv, prep, conj, pron, det, interj, num`.
- `note` (optional, rare): a short Thai note only when it really helps, e.g. a common confusion, irregular forms (`went, gone`), formality (`ภาษาทางการ`), or that a word is British/American. Skip it otherwise.
- `c` (only for `phrasal` and `idiom` items): how common it is in modern English, 1 (rare/old-fashioned) to 5 (very common, everyday).

## Rules

- Exactly one line per item, every `id` copied exactly. Valid JSON per line, UTF-8, no trailing commas, no extra text.
- `th` and `exTh` must be Thai; `ex` must be English only.
- Function words (`the`, `of`, `a`): give the closest Thai usage, e.g. `the` → `(คำนำหน้านามเฉพาะเจาะจง) ไม่แปล / นั้น`.
- Sensitive or offensive words: give a neutral meaning and mark the register in `note`, e.g. `คำหยาบ`.
- After writing, run `python3 -I scripts/check_content.py data/gen/todo/bNNNN.json data/content/bNNNN.jsonl` and fix every problem it prints.
