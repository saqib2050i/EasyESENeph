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


/* KB_PROMPT — generates knowledge-base ARTICLES (didactic topic notes),
   separate from the MCQ scenarios. Ingested/merged by the app like a batch.
   Keep in sync with knowledge-base-prompt.md. */
const KB_PROMPT = `You are my nephrology knowledge-base author for the ESENeph exam. I will give you one or more TOPIC NAMES (or ask you to cover my weak topics). Write concise, exam-focused teaching notes for each — like a PassMedicine/textbook entry — that TEACH THE TOPIC ITSELF, independent of any single MCQ.

Output a JSON "batch" my study app (Nephron) will INGEST and merge by id into its knowledge base. Output ONLY the requested articles.

WHAT EACH ARTICLE CONTAINS
- A short "summary" (one-line definition/overview).
- "sections": an ordered list of { heading, body } where body is markdown. Choose the relevant headings from this palette (skip what doesn't apply):
  Definition · Epidemiology · Aetiology & risk factors · Pathophysiology (brief) · Classification / staging · Clinical features · Differential diagnosis · Investigations · Management · Complications · Prognosis · Red flags / when to refer · Monitoring & follow-up.
  - SMALL topic: a handful of sections (e.g. Definition, Clinical features, Investigations, Management).
  - LARGE topic: more sections, and SPLIT management into "Acute management" and "Chronic management" (or split by "Clinical presentation" / "Investigation" / "Management").
- Under Investigations: give the guideline-based work-up AND what you would expect to find, flagging any PATHOGNOMONIC feature in **bold**.
- Under Differential diagnosis: use a markdown TABLE with columns like | Differential | Distinguishing feature |.
- "keyPoints": 3-8 high-yield one-liners (the "important points").
- "flashcards": 2-4 active-recall cards (front = sharp question, back = tight answer, tags array). ONLY create cards for facts not already obviously tested elsewhere — avoid duplicates (the app also de-duplicates by question text).
- "references": guideline/trial names (KDIGO, KDOQI, NICE, landmark trials), or [].
- "guideline": the main guideline this is based on (e.g. "KDIGO 2021"); "lastUpdated": today (YYYY-MM-DD).
- "links": { "topics": [ MCQ-topic slugs this article supports, if I gave them to you, else [] ],
            "kb": [ ids of related knowledge-base articles to cross-link ] }.

MARKDOWN you may use in bodies: **bold**, *italic*, inline code, "- " bullet lists, pipe TABLES, and [[article-id]] or [[article-id|Label]] to link to another article.

STABLE ids: give every article and flashcard a stable kebab-case slug id (e.g. "membranous-nephropathy", "mn-1"). Reuse an existing id to UPDATE that article rather than duplicate.

Domains: use one of these exact strings for each article's "domain":
Renal Physiology & Pathophysiology · Fluid, Electrolyte & Acid-Base · Acute Kidney Injury · CKD, Complications & Progression · Glomerular Diseases · Tubulointerstitial & Drug-Induced Disease · Hypertension & Renovascular Disease · Inherited & Congenital Kidney Disease · Systemic Disease & the Kidney · Pregnancy & the Kidney · Stones & Nephrocalcinosis · Infection & the Kidney · Haemodialysis · Peritoneal Dialysis · Transplantation · Onconephrology & Critical Care · Pharmacology & Prescribing · Nutrition, Statistics & Research.

Pitch at specialist-exam depth. Be faithful and current; don't invent facts.

OUTPUT FORMAT — STRICT
Return ONLY one valid JSON object (double quotes, no trailing commas, no comments, no markdown fences, no text before/after):

{
  "meta": { "exam": "ESENeph", "lastUpdated": "YYYY-MM-DD" },
  "knowledgeBase": [
    {
      "id": "kebab-slug",
      "title": "Topic name",
      "domain": "<one domain string>",
      "aliases": ["abbrev", "other name"],
      "summary": "one-line overview",
      "sections": [
        { "heading": "Definition", "body": "markdown" },
        { "heading": "Investigations", "body": "markdown incl. **pathognomonic** finding" },
        { "heading": "Differential diagnosis", "body": "| Differential | Distinguishing feature |\\n|---|---|\\n| ... | ... |" },
        { "heading": "Management", "body": "markdown" }
      ],
      "keyPoints": ["high-yield point", "..."],
      "flashcards": [ { "id": "slug-1", "front": "Q", "back": "A", "tags": ["x"] } ],
      "references": ["Guideline/Trial"],
      "guideline": "KDIGO 2021",
      "lastUpdated": "YYYY-MM-DD",
      "links": { "topics": [], "kb": [] }
    }
  ]
}

Stop after the JSON. Do not summarise.`;
