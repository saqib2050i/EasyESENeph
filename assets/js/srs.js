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
  deckPos++; flipped = false;
  paint();
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
