/* views/topics.js — searchable study library: explainer, high-yield,
   pitfalls and the MCQ encounters behind each topic. Weak topics first. */

function renderTopics(){
  const q = topicSearch.toLowerCase();
  const list = DATA.topics
    .filter(t => !q || [t.title, t.domain, t.subtopic, (t.highYield||[]).join(' ')].join(' ').toLowerCase().includes(q))
    .sort((a,b) => (statusRank(a.status) - statusRank(b.status)) || a.title.localeCompare(b.title));

  const cards = list.map(t => {
    const enc = (t.encounters||[]).map(e =>
      `<span class="e ${e.correct?'c':'w'}">${esc(e.date)} · ${e.correct?'✓':'✗'} ${esc(e.source||'')}${e.note?` <span class="nt">— ${esc(e.note)}</span>`:''}</span>`).join('');
    return `<div class="tcard" data-id="${escAttr(t.id)}">
      <button class="tcard-head" aria-expanded="false">
        <span class="pill ${esc(t.status)}">${esc(t.status)}</span>
        <span class="title">${esc(t.title)}</span>
        <span class="dm">${esc(t.domain)} · ${t.stats?.correct||0}/${t.stats?.seen||0}</span>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="tcard-body">
        ${t.explainer?`<div class="subhead">Explainer</div><div class="explainer">${md(t.explainer)}</div>`:''}
        ${(t.highYield||[]).length?`<div class="subhead">High-yield</div><ul class="hylist">${t.highYield.map(h=>`<li>${mdInline(h)}</li>`).join('')}</ul>`:''}
        ${(t.pitfalls||[]).length?`<div class="subhead">Common traps</div><ul class="pitlist">${t.pitfalls.map(p=>`<li>${mdInline(p)}</li>`).join('')}</ul>`:''}
        ${enc?`<div class="subhead">MCQ encounters</div><div class="enc">${enc}</div>`:''}
        ${(t.references||[]).length?`<div class="refs">Refs: ${t.references.map(esc).join(' · ')}</div>`:''}
      </div>
    </div>`;
  }).join('') || '<div class="empty">No topics match your search.</div>';

  return `
  <div class="viewhead"><div class="eyebrow">Study library</div><h1>Topics</h1>
    <p>Full educational bits distilled from your logged MCQs. Weak topics first. Click any card to expand.</p></div>
  <div class="topic-toolbar"><div class="search"><input id="tsearch" placeholder="Search topics, domains, facts…" value="${escAttr(topicSearch)}"></div></div>
  ${cards}`;
}

function bindTopics(){
  document.querySelectorAll('.tcard-head').forEach(h => h.onclick = () => {
    const open = h.parentElement.classList.toggle('open');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  const s = document.getElementById('tsearch');
  if(s) s.oninput = e => {
    topicSearch = e.target.value;
    const pos = e.target.selectionStart;
    paint();
    const ns = document.getElementById('tsearch');
    if(ns){ ns.focus(); ns.setSelectionRange(pos, pos); }
  };
}
