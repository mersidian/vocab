# Vocab

A personal English vocabulary trainer for Thai speakers: Anki-style spaced repetition (FSRS), decks by CEFR level (A1–C2), topic, exam and specialist lists, phrasal verbs and idioms. Progress syncs between phone and computer through Firebase.

Live site: https://mersidian.github.io/vocab/

## Develop

```bash
npm install
npm run dev          # http://localhost:5173/vocab/
npm run build        # static site in dist/
```

Without Firebase settings in `src/firebase-config.ts` the app runs in local mode (progress saved in the browser only).

## Data pipeline

| Step | Script | Output |
|---|---|---|
| Merge word lists | `scripts/build_entries.py` | `data/build/entries.json`, `decks.json` |
| IPA, phrasal verbs, idioms from Wiktionary | `scripts/wiktionary.py` (needs `data/raw/kaikki/english.jsonl.gz`) | `data/build/ipa.json`, `extra_*.json`, `glosses.json` |
| Batches for Thai content | `scripts/make_batches.py <prefix>` | `data/gen/todo/*.json` |
| Check written content | `scripts/check_content.py` | – |
| App data | `scripts/export_app_data.py` | `public/data/` |

Thai meanings and example sentences in `data/content/` were written by Claude (AI) following `data/gen/GUIDE.md`.

## Sources and licences

The **app code** is the author's own. The **word data** (`data/`, `public/data/`) combines the sources below and is shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

- The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from https://www.cefr-j.org/ in November 2026. (CSV via the Open Language Profiles project.)
- Octanove Vocabulary Profile C1/C2, Octanove Labs, CC BY-SA 4.0.
- New General Service List (NGSL), NGSL-Spoken, NGSL-GR, New Dolch List, New Academic Word List (NAWL), TOEIC Service List (TSL), Business Service List (BSL), Fitness English List (FEL) and Bible English List (BEL) by Browne, C., Culligan, B., and Phillips, J., https://www.newgeneralservicelist.com/, CC BY-SA 4.0.
- Medical Oral English List (MOEL) by Chartrand, R. and Dilenschneider, R., CC BY-SA 4.0.
- Wiktionary (https://en.wiktionary.org/) via kaikki.org, CC BY-SA 4.0: pronunciations (IPA), phrasal verbs, idioms.
- Words-CEFR-Dataset by Maximax67 (used for word frequency ordering), MIT License, Copyright (c) Maximax67.

Exam-prep decks are assembled from the level lists above; they are **not** official word lists of IELTS, TOEFL, Cambridge English, CU-TEP, TU-GET or TGAT.
