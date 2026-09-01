/* state.js — shared app state + derived selectors.
   These `let`/`const` bindings live in the shared global scope of the
   classic scripts, so every other file (srs.js, views/*, app.js) reads
   and writes the same values. Load order matters: this file must come
   before srs.js and the views. */

let DATA = { meta:{}, topics:[] };
let VIEW = 'dashboard';
let deck = [], deckPos = 0, flipped = false;
let roundSize = +(store.get('nephron-round') || 20);   // cards per study round
let filterDomain = 'all', filterStatus = 'all';
let topicSearch = '';
let topicDomain = 'all', topicStatus = 'all';   // Topics view filters (separate from the flashcard filters)
const expandedDomains = new Set();              // Topics view: domain sections the user has opened
let dataSource = 'server';       // 'server-db' | 'browser' | 'server' | 'embedded'
let pendingImport = null;        // staged { raw, incoming?, summary, errors, warnings } awaiting confirmation
let backend = false;             // true when the API (/api/*) is reachable
let authRequired = false;        // true when the server gates data behind a login
let authed = false;              // true when this browser holds a valid session
let kbSelected = null;           // knowledge-base article id being read (null = list)
let kbSearch = '';               // knowledge-base search query

const STATUS_ORDER = { weak:0, review:1, mastered:2 };
/* Guarded lookup so an unknown/missing status sorts last instead of
   producing NaN in comparators. */
function statusRank(s){ return STATUS_ORDER[s] ?? 99; }
function statusColor(s){ return s==='weak' ? 'var(--weak)' : s==='mastered' ? 'var(--mastered)' : 'var(--review)'; }

/* ---- derived selectors ---- */
const kb = () => DATA.knowledgeBase || [];
const kbById = id => kb().find(a => a.id === id) || null;
/* MCQ topics that have no knowledge-base article pointing at them. */
function topicsWithoutKb(){
  const covered = new Set();
  kb().forEach(a => (a.links?.topics || []).forEach(id => covered.add(id)));
  return DATA.topics.filter(t => !covered.has(t.id));
}
/* Knowledge-base articles whose links.topics include this topic id. */
function kbForTopic(id){ return kb().filter(a => (a.links?.topics || []).includes(id)); }

function _cardKey(front){ return String(front || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/* All flashcards from MCQ topics AND knowledge-base articles, de-duplicated
   by question text (topic cards win, so KB never duplicates an MCQ card). */
function allCards(){
  const out = [], seen = new Set();
  const add = (c, meta) => {
    const k = _cardKey(c.front);
    if(!c.front || !k || seen.has(k)) return;
    seen.add(k);
    out.push({ ...c, ...meta });
  };
  DATA.topics.forEach(t => (t.flashcards||[]).forEach(c => add(c, { _topic:t.title, _topicId:t.id, _domain:t.domain, _status:t.status })));
  kb().forEach(a => (a.flashcards||[]).forEach(c => add(c, { _topic:a.title, _domain:a.domain, _status:'review', _kb:a.id })));
  return out;
}

/* ---- curriculum coverage (blueprint.js) ----
   A theme counts as covered when any topic or KB article matches one of its
   keys. Matching is over id + title + subtopic + aliases, lower-cased, so a
   key is a substring hint rather than an exact identifier. */
function _searchBlob(){
  const parts = [];
  // Deliberate, structural text only — ids, titles, aliases, section headings,
  // key points and high-yield bullets. Body prose is excluded on purpose: a
  // passing mention of a term is not coverage, and matching it would report
  // false confidence about topics you have never actually studied.
  DATA.topics.forEach(t => parts.push({
    kind:'topic', id:t.id,
    hay:[t.id, t.title, t.subtopic||'', (t.highYield||[]).join(' ')].join(' ').toLowerCase() }));
  kb().forEach(a => parts.push({
    kind:'kb', id:a.id,
    hay:[a.id, a.title, (a.aliases||[]).join(' '),
         (a.sections||[]).map(x => x.heading).join(' '),
         (a.keyPoints||[]).join(' ')].join(' ').toLowerCase() }));
  return parts;
}

function blueprintCoverage(){
  const blob = _searchBlob();
  return (typeof EXAM_CATEGORIES === 'undefined' ? [] : EXAM_CATEGORIES).map(cat => {
    const themes = cat.themes.map(th => {
      const hits = blob.filter(b => th.keys.some(k => b.hay.includes(k)));
      return { label: th.label, covered: hits.length > 0,
               topics: hits.filter(h => h.kind==='topic').length,
               kb: hits.filter(h => h.kind==='kb').length };
    });
    const covered = themes.filter(t => t.covered).length;
    // performance is still measured on the finer domains this category maps to
    let seen = 0, correct = 0, nTopics = 0;
    (cat.domains||[]).forEach(d => DATA.topics.filter(t => t.domain===d).forEach(t => {
      seen += t.stats?.seen||0; correct += t.stats?.correct||0; nTopics++;
    }));
    return { n:cat.n, name:cat.name, note:cat.note||'', themes,
             covered, total: themes.length,
             pct: themes.length ? Math.round(100*covered/themes.length) : 0,
             topics:nTopics, seen, correct,
             acc: seen ? Math.round(100*correct/seen) : null };
  });
}

function domainStats(){
  const m = {};
  DATA.topics.forEach(t => {
    const d = t.domain || 'Uncategorised';
    if(!m[d]) m[d] = { seen:0, correct:0, topics:0 };
    m[d].seen    += t.stats?.seen || 0;
    m[d].correct += t.stats?.correct || 0;
    m[d].topics++;
  });
  return Object.entries(m)
    .map(([domain,v]) => ({ domain, ...v, pct: v.seen ? Math.round(v.correct/v.seen*100) : null }))
    .sort((a,b) => (a.pct ?? 101) - (b.pct ?? 101));
}

/* ---- what to study next ------------------------------------------------
   `priority` on the topic is derived from `status` by the merge engines, so
   sorting by status and then priority is circular — it ranks by one thing
   twice. This computes a genuine study score instead, combining how badly
   you answer the topic, how long since you touched it, how far its revision
   has got, and how weak its whole domain is. Derived at render time, so no
   schema change and nothing to migrate.

   Returns { score 0..1, reasons[] } — the reasons are shown in the UI so the
   ranking explains itself rather than being an opaque number. */
function _daysSince(iso){
  if(!iso) return null;
  const d = Date.parse(iso);
  if(isNaN(d)) return null;
  return Math.max(0, Math.round((Date.now() - d) / 86400000));
}

function _domainAccuracy(){
  const m = {};
  DATA.topics.forEach(t => {
    const d = t.domain || '?';
    if(!m[d]) m[d] = { seen:0, correct:0 };
    m[d].seen += t.stats?.seen||0; m[d].correct += t.stats?.correct||0;
  });
  Object.keys(m).forEach(k => m[k] = m[k].seen ? m[k].correct/m[k].seen : 1);
  return m;
}

function studyScore(t, domAcc){
  domAcc = domAcc || _domainAccuracy();
  const seen = t.stats?.seen||0, correct = t.stats?.correct||0;
  const reasons = [];

  const accGap = seen ? 1 - correct/seen : 0.5;
  if(seen && correct === 0)      reasons.push(`${seen}/${seen} wrong`);
  else if(accGap >= 0.5)         reasons.push(`${correct}/${seen} correct`);

  const statusW = t.status==='weak' ? 1 : t.status==='mastered' ? 0 : 0.5;
  if(t.status==='weak') reasons.push('weak');

  // most recent contact: an MCQ attempt or a flashcard review
  const lastEnc = (t.encounters||[]).map(e => e.date).filter(Boolean).sort().pop();
  const lastRev = t.cardStats?.lastReviewed;
  const last = [lastEnc, lastRev].filter(Boolean).sort().pop();
  const days = _daysSince(last);
  const stale = days === null ? 0.5 : Math.min(1, days/90);
  if(days !== null && days >= 30) reasons.push(`${days}d since seen`);

  const strength = (typeof revisionStrength === 'function') ? revisionStrength(t) : 0;
  const revGap = 1 - strength/100;
  if(strength === 0 && (t.flashcards||[]).length) reasons.push('never revised');

  const dGap = 1 - (domAcc[t.domain] ?? 1);
  if(dGap >= 0.45) reasons.push('weak domain');

  const score = 0.30*accGap + 0.25*statusW + 0.20*stale + 0.15*revGap + 0.10*dGap;
  return { score, reasons, days, strength };
}

/* Topics ranked by what would most repay studying now. */
function studyQueue(n){
  const domAcc = _domainAccuracy();
  return DATA.topics
    .map(t => ({ topic:t, ...studyScore(t, domAcc) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, n || 8);
}

function totals(){
  let seen = 0, correct = 0, weak = 0, mastered = 0;
  DATA.topics.forEach(t => {
    seen    += t.stats?.seen || 0;
    correct += t.stats?.correct || 0;
    if(t.status === 'weak') weak++;
    if(t.status === 'mastered') mastered++;
  });
  const loggedMcqs = countEncounters();
  return {
    seen, correct, weak, mastered, topics: DATA.topics.length,
    acc: seen ? Math.round(correct/seen*100) : 0,
    // Prefer the actual encounter count; fall back to meta / seen if a
    // deck predates encounter logging. Keeps the headline honest.
    mcqs: loggedMcqs || DATA.meta?.totalMcqs || seen
  };
}

/* Total MCQ attempts actually recorded across all topics. */
function countEncounters(){
  return DATA.topics.reduce((n,t) => n + (t.encounters?.length || 0), 0);
}

/* Accuracy grouped by attempt date, oldest→newest, for the trend panel.
   Returns [{date, attempts, correct, pct}]. */
function activityTrend(maxDays = 8){
  const byDate = {};
  DATA.topics.forEach(t => (t.encounters||[]).forEach(e => {
    const d = e.date || 'undated';
    if(!byDate[d]) byDate[d] = { date:d, attempts:0, correct:0 };
    byDate[d].attempts++;
    if(e.correct) byDate[d].correct++;
  }));
  return Object.values(byDate)
    .sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    .slice(-maxDays)
    .map(d => ({ ...d, pct: d.attempts ? Math.round(d.correct/d.attempts*100) : 0 }));
}
