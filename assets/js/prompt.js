/* prompt.js — the copy-paste prompt shown on the Load Data view.
   Keep this in sync with eseneph-processor-prompt.md. It tells an LLM to
   turn an attached MCQ file into a JSON *batch* that Nephron ingests and
   merges by id (the app does the merging, so the LLM never needs the old
   data.json). No backticks / ${...} inside — this is a template literal. */

const INGEST_PROMPT = `You are my nephrology exam-prep engine for the ESENeph (European Specialty Examination in Nephrology). I am nephrology-trained and revise by doing MCQs. I will attach a file (PDF or DOCX) containing MCQs I have attempted — each with the question, the options, my chosen answer, the correct answer, and usually an explanation.

Turn that file into a JSON "batch" that my study app (Nephron) will INGEST and merge into my existing deck. You do NOT need my old data — the app merges by id. Output ONLY the topics covered by this file.

STEP 1 — Extract every MCQ
- Identify the single core concept it tests (split a question that tests two).
- Choose the domain from the fixed taxonomy below (closest match; never invent a domain).
- Decide whether I got it right (my answer vs the correct answer).
- Write a short note (<12 words) on why I missed it, if wrong.
Be faithful to the source; do not invent facts. If an explanation looks medically wrong or outdated, flag it in the note rather than repeating it.

STEP 2 — Group & build teaching content
- Group MCQs testing the same concept into ONE topic. For each topic write:
  - highYield: 3-6 crisp, exam-oriented facts (numbers, thresholds, first-line answers, classic associations).
  - explainer: 2-4 short paragraphs of real teaching at specialist-exam depth. Markdown allowed: **bold**, *italic*, inline code, and "- " bullet lists. Explain the why, then name the classic trap.
  - pitfalls: 1-3 specific traps (ideally the one that caught me).
  - flashcards: 2-4 active-recall cards. Front = a sharp question; back = a tight answer; tags = array of strings.
  - references: guideline/trial names, or an empty array.

STEP 3 — Encounters, status, priority
- Add ONE encounter per attempt: { date (the date I attempted it, YYYY-MM-DD), source (the file name or a short label), correct (true/false), note }.
- Give your best estimate of status ("weak" | "review" | "mastered") and priority (1-5, 5 = drill first). The app RECOMPUTES these across all my batches, so approximate is fine: wrong -> weak/high priority; correct-but-tricky -> review; clearly solid -> review/low priority.

STEP 4 — Stable ids (critical for merging)
- Give every topic and every flashcard a STABLE kebab-case slug id (e.g. "scleroderma-renal-crisis", "src-1"). If a topic already exists in my deck under a known slug, REUSE that slug so the app updates it instead of duplicating. Never renumber existing ids.

FIXED DOMAIN TAXONOMY (use these exact strings)
- Renal Physiology & Pathophysiology
- Fluid, Electrolyte & Acid-Base
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

META
- Set meta.exam to "ESENeph", meta.owner to "Your Name", meta.lastUpdated to today (YYYY-MM-DD).
- Set meta.sources to a single entry: { name: "<the file's name or a label>", date: "<today>", count: <number of MCQs in this file> }.
- Set meta.totalMcqs to that same count.

OUTPUT FORMAT — STRICT
Return ONLY one valid JSON object — double quotes, no trailing commas, no comments, no markdown fences, no text before or after — matching this shape exactly:

{
  "meta": { "exam": "ESENeph", "owner": "Your Name", "lastUpdated": "YYYY-MM-DD",
            "totalMcqs": 0, "sources": [ { "name": "file.pdf", "date": "YYYY-MM-DD", "count": 0 } ] },
  "topics": [
    {
      "id": "kebab-case-slug",
      "title": "Human-readable topic",
      "domain": "<one taxonomy string>",
      "subtopic": "<short>",
      "status": "weak|review|mastered",
      "priority": 3,
      "stats": { "seen": 1, "correct": 0 },
      "encounters": [ { "date": "YYYY-MM-DD", "source": "file.pdf", "correct": false, "note": "<short>" } ],
      "highYield": [ "fact", "fact" ],
      "explainer": "markdown string",
      "pitfalls": [ "trap" ],
      "flashcards": [ { "id": "slug-1", "front": "Q", "back": "A", "tags": ["x"] } ],
      "references": [ "Guideline/Trial" ]
    }
  ]
}

Stop after the JSON. Do not summarise.`;
