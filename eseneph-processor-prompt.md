# ESENeph MCQ → Study Deck Processor

**How to use:** You don't need to keep this file in sync by hand — the exact prompt is built into the
app (**Load Data → Prompt for your LLM → Copy prompt**). The workflow:

1. In the app, open **Load Data**, hit **Copy prompt**.
2. Start a fresh chat with an LLM, paste the prompt, and **attach your MCQ PDF/DOCX**.
3. The LLM returns a single JSON **batch** (only the MCQs in that file).
4. Save/copy that JSON to a `.json` file and **drop it into Load Data → Ingest a batch**.
5. The app previews the changes, then **merges the batch into your deck by id** and remembers it in the
   browser. **Export data.json** to persist it back to the server volume.

The LLM no longer needs your old `data.json` — **the app does the merging** (by stable topic/flashcard
`id`), so you only ever feed it the new file. Re-ingesting the same batch is safe (attempts dedupe).

The canonical copy of the prompt lives in [`assets/js/prompt.js`](assets/js/prompt.js) as `INGEST_PROMPT`.
Keep this file and that constant in sync if you change the schema.

---

You are my nephrology exam-prep engine for the ESENeph (European Specialty Examination in Nephrology). I
am nephrology-trained and revise by doing MCQs. I will attach a file (PDF or DOCX) containing MCQs I have
attempted — each with the question, the options, my chosen answer, the correct answer, and usually an
explanation.

Turn that file into a JSON "batch" that my study app (Nephron) will INGEST and merge into my existing
deck. You do NOT need my old data — the app merges by id. Output ONLY the topics covered by this file.

## Step 1 — Extract every MCQ
- Identify the single core concept it tests (split a question that tests two).
- Choose the **domain** from the fixed taxonomy below (closest match; never invent a domain).
- Decide whether I got it right (my answer vs the correct answer).
- Write a short **note** (<12 words) on why I missed it, if wrong.

Be faithful to the source; do not invent facts. If an explanation looks medically wrong or outdated, flag
it in the note rather than repeating it.

## Step 2 — Group & build teaching content
Group MCQs testing the same concept into **one topic**. For each topic write:
- **highYield**: 3–6 crisp, exam-oriented facts (numbers, thresholds, first-line answers, associations).
- **explainer**: 2–4 short paragraphs of real teaching at specialist-exam depth. Markdown allowed
  (`**bold**`, `*italic*`, `` `code` ``, `- ` bullet lists). Explain the *why*, then name the classic trap.
- **pitfalls**: 1–3 specific traps (ideally the one that caught me).
- **flashcards**: 2–4 active-recall cards (front = sharp question, back = tight answer, `tags` array).
- **references**: guideline/trial names, or an empty array.

## Step 3 — Encounters, status, priority
- Add **one encounter per attempt**: `{ date (when I attempted it, YYYY-MM-DD), source (file name/label),
  correct (true/false), note }`.
- Give your best estimate of **status** (`weak` | `review` | `mastered`) and **priority** (1–5, 5 = drill
  first). **The app recomputes these cumulatively across batches**, so approximate is fine: wrong →
  weak/high; correct-but-tricky → review; clearly solid → review/low.

## Step 4 — Stable ids (critical for merging)
Give every topic and flashcard a **stable kebab-case slug `id`** (e.g. `scleroderma-renal-crisis`,
`src-1`). If a topic already exists in my deck under a known slug, **reuse it** so the app updates rather
than duplicates. Never renumber existing ids.

## Fixed domain taxonomy (use these exact strings)
- Renal Physiology & Pathophysiology
- Fluid, Electrolyte & Acid–Base
- Acute Kidney Injury
- CKD, Complications & Progression
- Glomerular Diseases
- Tubulointerstitial & Drug-Induced Disease
- Hypertension & Renovascular Disease
- Inherited & Congenital Kidney Disease
- Systemic Disease & the Kidney
- Pregnancy & the Kidney
- Stones & Nephrocalcinosis
- Infection & the Kidney
- Haemodialysis
- Peritoneal Dialysis
- Transplantation
- Onconephrology & Critical Care
- Pharmacology & Prescribing
- Nutrition, Statistics & Research

## Meta
- `meta.exam` = `"ESENeph"`, `meta.owner` = `"Your Name"`, `meta.lastUpdated` = today (YYYY-MM-DD).
- `meta.sources` = a single entry `{ name: "<file name/label>", date: "<today>", count: <MCQs in file> }`.
- `meta.totalMcqs` = that same count.

## Output format — STRICT
Return **only** one valid JSON object (double quotes, no trailing commas, no comments, no markdown fences,
no text before or after) matching this shape exactly:

```
{
  "meta": { "exam":"ESENeph", "owner":"Your Name", "lastUpdated":"YYYY-MM-DD",
            "totalMcqs": <int>, "sources":[{"name":"<file>","date":"YYYY-MM-DD","count":<int>}] },
  "topics": [
    {
      "id":"kebab-case-slug",
      "title":"Human-readable topic",
      "domain":"<one taxonomy string>",
      "subtopic":"<short>",
      "status":"weak|review|mastered",
      "priority": 1-5,
      "stats": { "seen":<int>, "correct":<int> },
      "encounters":[ {"date":"YYYY-MM-DD","source":"<file>","correct":true|false,"note":"<short>"} ],
      "highYield":[ "fact", "fact" ],
      "explainer":"markdown string",
      "pitfalls":[ "trap" ],
      "flashcards":[ {"id":"slug-1","front":"Q","back":"A","tags":["x"]} ],
      "references":[ "Guideline/Trial" ]
    }
  ]
}
```

Stop after the JSON. Do not summarise.
