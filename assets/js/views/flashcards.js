/* views/flashcards.js — active-recall deck. Compact filter bar, a bounded
   study round with a progress bar, flip + grade. The grade row is always
   rendered (disabled until the card is flipped) so the layout never jumps
   and the buttons never leave the screen. */

function renderFlashcards(){
  const pool = filteredCards();
  const domains = [...new Set(allCards().map(c => c._domain))].sort();
  const domOpts = ['all', ...domains].map(d =>
    `<option value="${escAttr(d)}"${filterDomain===d?' selected':''}>${d==='all'?'All domains':esc(d)}</option>`).join('');
  const statBtns = ['all','weak','review','mastered'].map(s =>
    `<button class="seg-b" data-fs="${s}" aria-pressed="${filterStatus===s}">${s==='all'?'Any':s}</button>`).join('');
  const sizeOpts = roundOptions(pool.length).map(n =>
    `<option value="${n}"${n===roundSize?' selected':''}>${n===pool.length?`All (${n})`:`${n} cards`}</option>`).join('');

  const bar = `
    <div class="fc-bar">
      <select class="fc-sel" id="fdom" aria-label="Filter by domain">${domOpts}</select>
      <div class="seg" role="group" aria-label="Filter by status">${statBtns}</div>
      <label class="fc-round">Round
        <select class="fc-sel accent" id="fsize" aria-label="Cards per round">${sizeOpts}</select>
      </label>
      <span class="fc-count">${pool.length} card${pool.length!==1?'s':''} in filter</span>
    </div>`;

  let stage;
  if(!deck.length){
    stage = `<div class="deck-done"><div class="big">No cards match this filter.</div>
      <div>Load more MCQ batches or widen the filter.</div></div>`;
  }else if(deckPos >= deck.length){
    const boxes = boxDistribution();
    const solid = boxes.filter(b => b.box >= 3).reduce((n,b) => n + b.count, 0);
    stage = `<div class="deck-done"><div class="big">Round complete — ${deck.length} card${deck.length!==1?'s':''}</div>
      <div>${solid} card${solid!==1?'s':''} now sitting at box 3 or better. Grades are saved.</div>
      <button class="btn primary" id="reshuffle">Start another round</button></div>`;
  }else{
    const c = deck[deckPos];
    const pct = Math.round(deckPos / deck.length * 100);
    const tags = (c.tags||[]).map(x => `<span class="t">${esc(x)}</span>`).join('');
    // Two independent signals: status is owned by MCQ attempts, strength is
    // earned by revision. Neither overwrites the other.
    const topic = c._topicId ? DATA.topics.find(t => t.id === c._topicId) : null;
    const str = topic ? revisionStrength(topic) : 0;
    const strengthRow = topic ? `
      <div class="fc-strength">
        <span class="lbl">Revision</span>
        <span class="track"><i style="width:${str}%"></i></span>
        <span class="val">${str}% · ${strengthBand(str)}</span>
      </div>` : '';
    stage = `
      <div class="fc-prog"><i style="width:${pct}%"></i></div>
      <div class="fc-progtxt"><span>Card ${deckPos+1} of ${deck.length}</span><span>${deck.length-deckPos-1} left</span></div>
      <div class="flash ${flipped?'flip':''}" id="flash" tabindex="0" role="button"
           aria-label="Flashcard. Activate to reveal the answer.">
        <div class="flash-inner">
          <div class="face front"><span class="side-lbl">Question</span>
            <div class="content">${md(c.front)}</div></div>
          <div class="face back"><span class="side-lbl">Answer</span>
            <div class="content">${md(c.back)}</div>
            <div class="foot"><span class="t topic">${esc(c._topic)}</span>${topic?`<span class="t st-${esc(topic.status)}">${esc(topic.status)}</span>`:''}<span class="t">${esc(c._domain)}</span>${tags}</div>
            ${strengthRow}
          </div>
        </div>
      </div>
      <div class="grade-row">
        <button class="grade again" data-g="0" ${flipped?'':'disabled'}><kbd>1</kbd>
          <span class="g-lab">Missed it</span><small>see it again soon</small></button>
        <button class="grade good" data-g="1" ${flipped?'':'disabled'}><kbd>2</kbd>
          <span class="g-lab">Got it</span><small>see it later</small></button>
        <button class="grade easy" data-g="2" ${flipped?'':'disabled'}><kbd>3</kbd>
          <span class="g-lab">Easy</span><small>see it much later</small></button>
      </div>
      <div class="flip-hint">${flipped
        ? 'Grade with <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>'
        : 'Click the card or press <kbd>Space</kbd> to reveal'}</div>`;
  }

  return `
  <div class="viewhead fc-head"><div class="eyebrow">Active recall</div><h1>Flashcards</h1>
    <p>Each round is a shuffled mix, weighted towards your weakest topics. Grades feed a lightweight Leitner box so shaky cards keep coming back.</p></div>
  ${bar}
  <div class="flash-stage">${stage}</div>`;
}

function bindFlashcards(){
  const dom = document.getElementById('fdom');
  if(dom) dom.onchange = () => { filterDomain = dom.value; buildDeck(); paint(); };

  document.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => {
    filterStatus = b.dataset.fs; buildDeck(); paint();
  });

  const size = document.getElementById('fsize');
  if(size) size.onchange = () => {
    roundSize = +size.value; store.set('nephron-round', roundSize);
    buildDeck(); paint();
  };

  const f = document.getElementById('flash');
  if(f){
    const flip = () => { flipped = !flipped; paint(); };
    f.onclick = flip;
    f.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); flip(); } };
  }

  document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    if(!b.disabled) gradeCard(+b.dataset.g);
  });

  const rs = document.getElementById('reshuffle');
  if(rs) rs.onclick = () => { buildDeck(); paint(); };
}
