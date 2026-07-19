/* merge.js — ingest an incoming deck/batch into the current deck.
   Pure function: mergeDecks(base, incoming) returns { deck, summary }
   without mutating `base`, so it can be used for a dry-run preview and
   for the real commit. Topics and flashcards merge by their stable id.

   Merge rules (mirror eseneph-processor-prompt.md):
   - Topic matched by id  → append new encounters (deduped), refresh
     teaching content from the batch, add new flashcards, then
     recompute stats/status/priority from the CUMULATIVE record.
   - Topic not present     → added and normalised.
   - Re-ingesting the same batch is idempotent (encounters dedupe). */

function _encKey(e){ return [e.date||'', e.source||'', e.correct?1:0, e.note||''].join('|'); }

function _recomputeStats(t){
  const encs = t.encounters || [];
  if(encs.length) t.stats = { seen: encs.length, correct: encs.filter(e => e.correct).length };
  else t.stats = t.stats || { seen:0, correct:0 };
}

/* status from the cumulative encounter record (see processor prompt). */
function _recomputeStatus(t){
  const encs = t.encounters || [];
  if(!encs.length) return t.status || 'review';
  const correct = encs.filter(e => e.correct).length;
  const wrong = encs.length - correct;
  const last = encs[encs.length - 1];
  if(!last.correct || wrong > correct) return 'weak';
  const recent = encs.slice(-2);
  if(correct >= 2 && recent.every(e => e.correct)) return 'mastered';
  return 'review';
}

function _clampPriority(status, p){
  if(typeof p !== 'number') p = status==='weak' ? 4 : status==='mastered' ? 1 : 3;
  if(status==='weak')     p = Math.max(p, 4);
  if(status==='mastered') p = Math.min(p, 2);
  return Math.max(1, Math.min(5, p));
}

/* Normalise a standalone topic (recompute derived fields, fill arrays). */
function normalizeTopic(t){
  t.encounters = t.encounters || [];
  t.flashcards = t.flashcards || [];
  _recomputeStats(t);
  t.status = _recomputeStatus(t);
  t.priority = _clampPriority(t.status, t.priority);
  return t;
}

function _mergeTopic(base, inc){
  let encAdded = 0, cardsAdded = 0;
  // Refresh teaching content from the batch when provided (LLM improves it).
  ['title','domain','subtopic','explainer'].forEach(k => { if(inc[k] != null && inc[k] !== '') base[k] = inc[k]; });
  ['highYield','pitfalls','references'].forEach(k => { if(Array.isArray(inc[k]) && inc[k].length) base[k] = inc[k]; });
  // Encounters: append new ones only (dedupe by content).
  base.encounters = base.encounters || [];
  const seen = new Set(base.encounters.map(_encKey));
  (inc.encounters || []).forEach(e => { const k = _encKey(e); if(!seen.has(k)){ base.encounters.push(e); seen.add(k); encAdded++; } });
  // Flashcards: merge by id (update existing, add new).
  base.flashcards = base.flashcards || [];
  const byId = new Map(base.flashcards.map(c => [c.id, c]));
  (inc.flashcards || []).forEach(c => {
    if(!c || !c.id) return;
    if(byId.has(c.id)) Object.assign(byId.get(c.id), c);
    else { base.flashcards.push(c); byId.set(c.id, c); cardsAdded++; }
  });
  _recomputeStats(base);
  base.status = _recomputeStatus(base);
  base.priority = _clampPriority(base.status, inc.priority != null ? inc.priority : base.priority);
  return { encAdded, cardsAdded };
}

/* ---- knowledge-base articles ---- */
function normalizeArticle(a){
  a.sections = a.sections || [];
  a.keyPoints = a.keyPoints || [];
  a.flashcards = a.flashcards || [];
  a.references = a.references || [];
  a.aliases = a.aliases || [];
  a.links = a.links || {};
  a.links.topics = a.links.topics || [];
  a.links.kb = a.links.kb || [];
  return a;
}
function _mergeArticle(base, inc){
  normalizeArticle(base);
  // Replace scalar/whole-section content when the incoming article provides it.
  ['title','domain','subtitle','summary','guideline','lastUpdated'].forEach(k => { if(inc[k] != null && inc[k] !== '') base[k] = inc[k]; });
  ['sections','keyPoints','references','aliases'].forEach(k => { if(Array.isArray(inc[k]) && inc[k].length) base[k] = inc[k]; });
  if(inc.links){
    base.links.topics = [...new Set([...(base.links.topics||[]), ...(inc.links.topics||[])])];
    base.links.kb     = [...new Set([...(base.links.kb||[]),     ...(inc.links.kb||[])])];
  }
  // Flashcards: merge by id.
  const byId = new Map((base.flashcards||[]).map(c => [c.id, c]));
  (inc.flashcards || []).forEach(c => {
    if(!c || !c.id) return;
    if(byId.has(c.id)) Object.assign(byId.get(c.id), c);
    else { base.flashcards.push(c); byId.set(c.id, c); }
  });
}

function mergeDecks(base, incoming){
  const deck = JSON.parse(JSON.stringify(base || { meta:{}, topics:[] }));
  deck.meta = deck.meta || {};
  deck.topics = deck.topics || [];
  const summary = { topicsAdded:0, topicsUpdated:0, encountersAdded:0, cardsAdded:0, sourcesAdded:0, kbAdded:0, kbUpdated:0 };
  const byId = new Map(deck.topics.map(t => [t.id, t]));

  (incoming.topics || []).forEach(inc => {
    if(!inc || !inc.id) return;
    if(byId.has(inc.id)){
      const r = _mergeTopic(byId.get(inc.id), inc);
      summary.topicsUpdated++;
      summary.encountersAdded += r.encAdded;
      summary.cardsAdded += r.cardsAdded;
    }else{
      const t = normalizeTopic(JSON.parse(JSON.stringify(inc)));
      deck.topics.push(t); byId.set(t.id, t);
      summary.topicsAdded++;
      summary.encountersAdded += t.encounters.length;
      summary.cardsAdded += t.flashcards.length;
    }
  });

  // Knowledge base: merge articles by id (add or update in place).
  if(Array.isArray(incoming.knowledgeBase)){
    deck.knowledgeBase = deck.knowledgeBase || [];
    const kbId = new Map(deck.knowledgeBase.map(a => [a.id, a]));
    incoming.knowledgeBase.forEach(inc => {
      if(!inc || !inc.id) return;
      if(kbId.has(inc.id)){ _mergeArticle(kbId.get(inc.id), inc); summary.kbUpdated++; }
      else{
        const a = normalizeArticle(JSON.parse(JSON.stringify(inc)));
        deck.knowledgeBase.push(a); kbId.set(a.id, a);
        summary.kbAdded++;
      }
    });
  }

  // Meta: keep identity, advance date, union sources, recompute totals.
  const im = incoming.meta || {};
  deck.meta.exam  = deck.meta.exam  || im.exam  || 'ESENeph';
  deck.meta.owner = deck.meta.owner || im.owner || '';
  // Advance to the most recent date — never regress if an older-dated batch is ingested.
  const _dates = [deck.meta.lastUpdated, im.lastUpdated].filter(Boolean).sort();
  deck.meta.lastUpdated = _dates.length ? _dates[_dates.length - 1] : new Date().toISOString().slice(0,10);
  deck.meta.sources = deck.meta.sources || [];
  const srcSeen = new Set(deck.meta.sources.map(s => (s.name||'') + '|' + (s.date||'')));
  (im.sources || []).forEach(s => {
    const k = (s.name||'') + '|' + (s.date||'');
    if(!srcSeen.has(k)){ deck.meta.sources.push(s); srcSeen.add(k); summary.sourcesAdded++; }
  });
  deck.meta.totalMcqs = deck.topics.reduce((n,t) => n + ((t.encounters||[]).length), 0) || deck.meta.totalMcqs || 0;

  return { deck, summary };
}
