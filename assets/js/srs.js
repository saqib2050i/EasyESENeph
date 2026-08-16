/* srs.js — lightweight Leitner spaced repetition.
   `srs` maps cardId -> box number (higher = better known).
   Grading: Again -> box 0, Good -> +1, Easy -> +2. Persisted via store.
   Kept deliberately simple — no external SRS library. */

const srs = store.get('nephron-srs') || {};   // cardId -> box

/* Cards matching the current domain/status filters (the pool a round is
   drawn from). Kept separate so the round-size options can size themselves. */
function filteredCards(){
  let cards = allCards();
  if(filterDomain !== 'all') cards = cards.filter(c => c._domain === filterDomain);
  if(filterStatus !== 'all') cards = cards.filter(c => c._status === filterStatus);
  return cards;
}

/* Round-size choices: multiples of 5 up to 30 that are *below* the pool
   total, then "all". A pool of 27 gives 5,10,15,20,25,27; a pool of 4
   gives just 4 — so we never offer a size the pool cannot fill. */
function roundOptions(total){
  const out = [];
  for(let n = 5; n <= 30; n += 5) if(n < total) out.push(n);
  out.push(total);
  return out;
}

/* Fisher–Yates, so each round opens somewhere new. */
function shuffle(a){
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Build a study round: stratify by status, shuffle within each stratum
   (due/low box first), then interleave 3 weak : 2 review : 1 mastered so
   the round is a genuine mix that still leans on weak topics. */
function buildDeck(){
  const pool = filteredCards();
  const opts = roundOptions(pool.length);
  if(!opts.includes(roundSize)) roundSize = opts[0];   // filter shrank past the saved size
  const take = Math.min(roundSize, pool.length);

  const strata = { weak:[], review:[], mastered:[] };
  pool.forEach(c => (strata[c._status] || strata.review).push(c));
  Object.keys(strata).forEach(k => {
    shuffle(strata[k]);
    strata[k].sort((a,b) => (srs[a.id] ?? 0) - (srs[b.id] ?? 0));   // due first
  });

  const weights = { weak:3, review:2, mastered:1 };
  const out = [];
  while(out.length < take){
    let moved = false;
    for(const k of ['weak','review','mastered']){
      for(let n = 0; n < weights[k] && out.length < take; n++){
        if(strata[k].length){ out.push(strata[k].shift()); moved = true; }
      }
    }
    if(!moved) break;                                  // every stratum drained
  }

  deck = out; deckPos = 0; flipped = false;
}

function gradeCard(g){
  const c = deck[deckPos];
  if(!c) return;
  srs[c.id] = g === 0 ? 0 : (srs[c.id] ?? 0) + g;
  store.set('nephron-srs', srs);
  recordRevision(c, g);
  deckPos++; flipped = false;
  paint();
}

/* ---- revision record (topic.cardStats) ----------------------------------
   Mirrors the Leitner box into the deck itself so revision progress travels
   with the data instead of living only in this browser. Deliberately kept
   separate from `status`, which stays owned by MCQ encounters. */
function recordRevision(card, g){
  if(!card._topicId) return;                       // KB-only card: nothing to attribute
  const t = DATA.topics.find(x => x.id === card._topicId);
  if(!t) return;
  const cs = t.cardStats && typeof t.cardStats === 'object' ? t.cardStats : (t.cardStats = {});
  if(!cs.boxes || typeof cs.boxes !== 'object') cs.boxes = {};
  cs.boxes[card.id] = srs[card.id];
  cs.reps = (cs.reps || 0) + 1;
  cs[['again','good','easy'][g]] = (cs[['again','good','easy'][g]] || 0) + 1;
  cs.lastReviewed = new Date().toISOString().slice(0,10);
  _revDirty.add(t.id);
  clearTimeout(_revTimer);
  _revTimer = setTimeout(flushRevision, 1200);
}

/* Grades arrive a few seconds apart, so batch them rather than writing on
   every card. With a backend they go to /api/cardstats (which only ever
   touches cardStats); without one they ride along in the localStorage deck. */
let _revTimer = null;
const _revDirty = new Set();

function _revPayload(){
  return [..._revDirty]
    .map(id => DATA.topics.find(t => t.id === id))
    .filter(Boolean)
    .map(t => ({ id: t.id, cardStats: t.cardStats }));
}

async function flushRevision(){
  if(!_revDirty.size) return;
  const topics = _revPayload();
  _revDirty.clear();
  if(!backend){ store.set('nephron-data', DATA); return; }
  try{ await apiPost('./api/cardstats', JSON.stringify({ topics })); }
  catch(e){ /* offline: boxes remain in nephron-srs and re-sync on the next grade */ }
}

/* Last grades of a session would otherwise die with the tab. */
addEventListener('pagehide', () => {
  if(!_revDirty.size) return;
  const raw = JSON.stringify({ topics: _revPayload() });
  _revDirty.clear();
  if(backend && navigator.sendBeacon){
    navigator.sendBeacon('./api/cardstats', new Blob([raw], { type:'application/json' }));
  }else if(!backend){
    store.set('nephron-data', DATA);
  }
});

/* Revision strength 0–100: the mean Leitner box across every card in the
   topic, each capped at box 3. A topic only reaches 100 when all of its
   cards are well known, so a single grade moves the meter, never a band. */
function revisionStrength(topic){
  const cards = topic.flashcards || [];
  if(!cards.length) return 0;
  const boxes = topic.cardStats?.boxes || {};
  const sum = cards.reduce((s,c) => s + Math.min(boxes[c.id] ?? 0, 3) / 3, 0);
  return Math.round(100 * sum / cards.length);
}

function strengthBand(s){
  if(!s) return 'not revised';
  if(s < 40) return 'shaky';
  if(s < 75) return 'getting there';
  return 'solid';
}

/* Count how many cards in the current deck sit in each Leitner box.
   Box 0 (incl. never-seen) is the "still learning" bucket. Returns
   [{box, count}] sorted by box. */
function boxDistribution(){
  const counts = {};
  deck.forEach(c => {
    const b = srs[c.id] ?? 0;
    counts[b] = (counts[b] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([box,count]) => ({ box:+box, count }))
    .sort((a,b) => a.box - b.box);
}
