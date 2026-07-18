/* srs.js — lightweight Leitner spaced repetition.
   `srs` maps cardId -> box number (higher = better known).
   Grading: Again -> box 0, Good -> +1, Easy -> +2. Persisted via store.
   Kept deliberately simple — no external SRS library. */

const srs = store.get('nephron-srs') || {};   // cardId -> box

/* Build the review deck from the current filters, due (low box) first,
   then weak status first. Resets position. */
function buildDeck(){
  let cards = allCards();
  if(filterDomain !== 'all') cards = cards.filter(c => c._domain === filterDomain);
  if(filterStatus !== 'all') cards = cards.filter(c => c._status === filterStatus);
  cards.sort((a,b) => {
    const ba = srs[a.id] ?? 0, bb = srs[b.id] ?? 0;
    if(ba !== bb) return ba - bb;                 // low box (due) first
    return statusRank(a._status) - statusRank(b._status);
  });
  deck = cards; deckPos = 0; flipped = false;
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
