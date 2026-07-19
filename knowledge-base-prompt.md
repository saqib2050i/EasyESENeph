# ESENeph Knowledge-Base Article Builder

**How to use:** The exact prompt is built into the app — **Load Data → "Prompt for knowledge-base
articles" → Copy KB prompt**. Paste it into a fresh LLM chat, add one or more **topic names** (or ask it
to cover your weak topics), and it returns a JSON batch you ingest exactly like an MCQ batch. The app
merges knowledge-base articles by stable `id` (add or update), independently of your MCQ topics.

The canonical copy of this prompt lives in [`assets/js/prompt.js`](assets/js/prompt.js) as `KB_PROMPT`;
keep this file and that constant in sync if the article schema changes.

## What an article contains
- `summary` — one-line definition/overview.
- `sections[]` — ordered `{ heading, body }` (body is markdown). Headings are chosen from a palette:
  Definition · Epidemiology · Aetiology & risk factors · Pathophysiology · Classification/staging ·
  Clinical features · Differential diagnosis · Investigations · Management · Complications · Prognosis ·
  Red flags / when to refer · Monitoring & follow-up. Small topics use a few sections; large topics use
  more and split **Acute management** / **Chronic management** (or presentation / investigation / management).
- Investigations give the guideline work-up **and** expected/**pathognomonic** findings.
- Differentials are a markdown **table**.
- `keyPoints[]` — high-yield one-liners.
- `flashcards[]` — 2–4 non-duplicate active-recall cards (the app also de-duplicates by question text).
- `references[]`, `guideline`, `lastUpdated`.
- `links` — `{ topics: [MCQ-topic slugs], kb: [related article ids] }`. Bodies may also cross-link with
  `[[article-id]]` / `[[article-id|Label]]`.

## Schema (the JSON the app ingests)
```
{
  "meta": { "exam": "ESENeph", "lastUpdated": "YYYY-MM-DD" },
  "knowledgeBase": [
    {
      "id": "kebab-slug", "title": "Topic", "domain": "<taxonomy string>",
      "aliases": ["abbrev"], "summary": "one-line overview",
      "sections": [ { "heading": "Definition", "body": "markdown" } ],
      "keyPoints": ["fact"],
      "flashcards": [ { "id": "slug-1", "front": "Q", "back": "A", "tags": ["x"] } ],
      "references": ["Guideline/Trial"], "guideline": "KDIGO 2021", "lastUpdated": "YYYY-MM-DD",
      "links": { "topics": [], "kb": [] }
    }
  ]
}
```
The domain must be one of the fixed taxonomy strings (see `eseneph-processor-prompt.md`). Return only the
JSON object.
