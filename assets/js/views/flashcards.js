/* views/flashcards.js — active-recall deck with domain/status filters,
   a Leitner box read-out, flip + grade. Weakest / most-due cards first. */

function renderFlashcards(){
  const domains = ['all', ...new Set(allCards().map(c => c._domain))];
  const domChips = domains.map(d =>
    `<button class="chip ${filterDomain===d?'on':''}" data-fd="${escAttr(d)}">${d==='all'?'All domains':esc(d)}</button>`).join('');
  const statChips = ['all','weak','review','mastered'].map(s =>
    `<button class="chip ${filterStatus===s?'on':''}" data-fs="${s}">${s==='all'?'Any status':s}</button>`).join('');

  const boxes = boxDistribution();
  const boxBar = deck.length ? `<div class="boxbar">${
    boxes.map(b => `<span class="b ${b.box===0?'new':''}"><b>${b.count}</b> ${b.box===0?'still learning':'box '+b.box}</span>`).join('')
  }</div>` : '';

  let stage;
  if(!deck.length){
    stage = `<div class="deck-done"><div class="big">No cards match this filter.</div><div>Load more MCQ batches or widen the filter.</div></div>`;
  }else if(deckPos >= deck.length){
    stage = `<div class="deck-done"><div class="big">Deck complete — ${deck.length} cards reviewed.</div><div>Grades saved. Reshuffle to run it again.</div><br><button class="btn primary" id="reshuffle">Reshuffle deck</button></div>`;
  }else{
    const c = deck[deckPos];
    const tags = (c.tags||[]).map(x => `<span class="t">${esc(x)}</span>`).join('');
    stage = `
      <div class="flash ${flipped?'flip':''}" id="flash" tabindex="0" role="button" aria-label="Flashcard, activate to flip">
        <div class="flash-inner">
          <div class="face front"><span class="side-lbl">Question</span><div class="content">${md(c.front)}</div></div>
          <div class="face back"><span class="side-lbl">Answer</span><div class="content">${md(c.back)}</div><div class="foot"><span class="t topic">${esc(c._topic)}</span><span class="t">${esc(c._domain)}</span>${tags}</div></div>
        </div>
      </div>
      ${flipped?`<div class="grade-row">
        <button class="grade again" data-g="0">Again<small>&lt; box 0</small></button>
        <button class="grade good" data-g="1">Good<small>box +1</small></button>
        <button class="grade easy" data-g="2">Easy<small>box +2</small></button>
      </div>`:`<div class="flip-hint">Tap the card or press <kbd>Space</kbd> to reveal</div>`}
      <div class="flip-hint">Card ${deckPos+1} of ${deck.length} · grade with <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div>`;
  }

  return `
  <div class="viewhead"><div class="eyebrow">Active recall</div><h1>Flashcards</h1>
    <p>Cards from your weakest topics surface first. Grades feed a lightweight Leitner box so shaky cards keep coming back.</p></div>
  <div class="card-toolbar">${domChips}</div>
  <div class="card-toolbar">${statChips}<span class="card-count">${deck.length} card${deck.length!=1?'s':''} in deck</span></div>
  ${boxBar}
  <div class="flash-stage">${stage}</div>`;
}

function bindFlashcards(){
  document.querySelectorAll('[data-fd]').forEach(b => b.onclick = () => { filterDomain = b.dataset.fd; buildDeck(); paint(); });
  document.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { filterStatus = b.dataset.fs; buildDeck(); paint(); });
  const f = document.getElementById('flash');
  if(f){
    const flip = () => { flipped = !flipped; paint(); };
    f.onclick = flip;
    f.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); flip(); } };
  }
  document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => gradeCard(+b.dataset.g));
  const rs = document.getElementById('reshuffle');
  if(rs) rs.onclick = () => { buildDeck(); paint(); };
}
