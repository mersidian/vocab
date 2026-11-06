# Reviewing odd entries

Each batch `data/review/todo/rvNN.json` is a list of **word groups**. A group holds every entry of one
headword (one entry per part of speech), with its current Thai content:
`{"id","w","pos","lvl","th","ex","exTh","note"}`.

Some entries come from word lists that tag a word with a part of speech it almost never has in modern
English (e.g. `it` as a noun = "the chaser in tag", `automatic` as a verb), or give it a rare sense.
Learners find these confusing. Decide for **every entry**:

- `drop`: the part of speech or sense is rare, archaic, technical/jargon, dialect, a list artifact, a
  misspelling, or a prefix/fragment rather than a word, so a learner would rarely meet it in modern
  English, especially when another entry in the same group already covers the common use. When in doubt
  between keeping strange content and dropping, drop.
- `fix`: the part of speech is genuinely common, but `th`, `ex` or `exTh` is wrong, unnatural, mixes in a
  rare or unrelated sense (e.g. "เสน่ห์"), or the example does not use the word in this part of speech.
  Give the corrected fields (only the ones you change). `th`: up to 3 short meanings, most common first,
  separated by `; `. `ex`: natural modern English, 6–15 words. `exTh`: natural Thai. To remove a note,
  give `"note": ""`.
- `keep`: the entry is a normal, common use and its content is correct and natural.

Write `data/review/done/rvNN.jsonl`, one JSON object per line, one line per entry id in the batch:

```json
{"id":"it_noun","action":"drop","why":"noun use only in the game of tag"}
{"id":"it_pron","action":"keep"}
{"id":"still_adj","action":"fix","th":"นิ่ง; สงบ; ไม่เคลื่อนไหว","ex":"Please keep still while I take the photo.","exTh":"อยู่นิ่งๆ นะ ระหว่างที่ฉันถ่ายรูป"}
```

`why` is required for `drop` (a few words). Then run
`python3 -I scripts/check_review.py data/review/todo/rvNN.json data/review/done/rvNN.jsonl`
and fix every problem it prints.
