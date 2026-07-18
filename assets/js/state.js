/* state.js — shared app state + derived selectors.
   These `let`/`const` bindings live in the shared global scope of the
   classic scripts, so every other file (srs.js, views/*, app.js) reads
   and writes the same values. Load order matters: this file must come
   before srs.js and the views. */

let DATA = { meta:{}, topics:[] };
let VIEW = 'dashboard';
let deck = [], deckPos = 0, flipped = false;
let filterDomain = 'all', filterStatus = 'all';
let topicSearch = '';
let dataSource = 'server';       // 'server-db' | 'browser' | 'server' | 'embedded'
let pendingImport = null;        // staged { raw, incoming?, summary, errors, warnings } awaiting confirmation
let backend = false;             // true when the API (/api/*) is reachable
let authRequired = false;        // true when the server gates data behind a login
let authed = false;              // true when this browser holds a valid session

const STATUS_ORDER = { weak:0, review:1, mastered:2 };
/* Guarded lookup so an unknown/missing status sorts last instead of
   producing NaN in comparators. */
function statusRank(s){ return STATUS_ORDER[s] ?? 99; }
function statusColor(s){ return s==='weak' ? 'var(--weak)' : s==='mastered' ? 'var(--mastered)' : 'var(--review)'; }

/* ---- derived selectors ---- */
function allCards(){
  const out = [];
  DATA.topics.forEach(t => (t.flashcards||[]).forEach(c =>
    out.push({ ...c, _topic:t.title, _domain:t.domain, _status:t.status })));
  return out;
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
