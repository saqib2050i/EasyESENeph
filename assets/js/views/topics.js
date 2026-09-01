/* views/topics.js — study library, grouped domain → subtopic.
   At 80+ topics a flat list stops being navigable, so domains render as
   collapsible sections carrying their own coverage read-out. Sections start
   folded (the header row doubles as a curriculum overview) and open
   automatically when a search or a domain filter narrows the view. */

function _topicMatches(t, q){
  if(!q) return true;
  return [t.title, t.domain, t.subtopic, (t.highYield||[]).join(' ')]
    .join(' ').toLowerCase().includes(q);
}

/* Per-domain coverage across ALL topics in that domain — deliberately not
   filtered, so the header always reports true coverage. */
function _domainCoverage(domain){
  const ts = DATA.topics.filter(t => t.domain === domain);
  let seen = 0, correct = 0, weak = 0;
  ts.forEach(t => { seen += t.stats?.seen||0; correct += t.stats?.correct||0; if(t.status==='weak') weak++; });
  return { topics: ts.length, seen, correct, weak, pct: seen ? Math.round(correct/seen*100) : null };
}

function renderTopics(){
  const q = topicSearch.toLowerCase();
  const list = DATA.topics.filter(t =>
    _topicMatches(t, q) &&
    (topicDomain === 'all' || t.domain === topicDomain) &&
    (topicStatus === 'all' || t.status === topicStatus));

  const domains = [...new Set(DATA.topics.map(t => t.domain))].sort();
  const domOpts = ['all', ...domains].map(d =>
    `<option value="${escAttr(d)}"${topicDomain===d?' selected':''}>${d==='all'?'All domains':esc(d)}</option>`).join('');
  const statBtns = ['all','weak','review','mastered'].map(s =>
    `<button class="seg-b" data-ts="${s}" aria-pressed="${topicStatus===s}">${s==='all'?'Any':s}</button>`).join('');

  const bar = `
    <div class="fc-bar">
      <div class="search"><input id="tsearch" placeholder="Search topics, domains, facts…" value="${escAttr(topicSearch)}"></div>
      <select class="fc-sel" id="tdom" aria-label="Filter by domain">${domOpts}</select>
      <div class="seg" role="group" aria-label="Filter by status">${statBtns}</div>
      <span class="fc-count">${list.length} topic${list.length!==1?'s':''}</span>
    </div>`;

  if(!list.length) return `${_topicsHead()}${bar}<div class="empty">No topics match.</div>`;

  // A narrowed view is useless folded shut, so force sections open.
  const forceOpen = !!q || topicDomain !== 'all' || topicStatus !== 'all';

  const byDomain = {};
  list.forEach(t => (byDomain[t.domain] = byDomain[t.domain] || []).push(t));

  const sections = Object.keys(byDomain).sort().map(dom => {
    const cov = _domainCoverage(dom);
    const open = forceOpen || expandedDomains.has(dom);
    const acc = cov.pct === null ? '<span class="dcov dash">untested</span>'
      : `<span class="dcov ${cov.pct>=80?'good':cov.pct>=55?'mid':'bad'}">${cov.pct}% · ${cov.correct}/${cov.seen}</span>`;

    // subtopic → topics, so a domain reads as a syllabus rather than a pile
    const bySub = {};
    byDomain[dom].forEach(t => (bySub[t.subtopic||'General'] = bySub[t.subtopic||'General'] || []).push(t));
    const body = Object.keys(bySub).sort().map(sub => `
      <div class="subgroup"><div class="sublab">${esc(sub)}</div>
        ${bySub[sub].sort((a,b) => (statusRank(a.status)-statusRank(b.status)) || a.title.localeCompare(b.title))
          .map(_topicCard).join('')}
      </div>`).join('');

    return `<section class="dsec ${open?'open':''}" data-dom="${escAttr(dom)}">
      <button class="dsec-head" aria-expanded="${open}">
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="dname">${esc(dom)}</span>
        <span class="dmeta">${byDomain[dom].length}${byDomain[dom].length!==cov.topics?` of ${cov.topics}`:''} topic${cov.topics!==1?'s':''}${cov.weak?` · <b class="wk">${cov.weak} weak</b>`:''}</span>
        ${acc}
      </button>
      <div class="dsec-body">${body}</div>
    </section>`;
  }).join('');

  return `${_topicsHead()}${bar}${sections}`;
}

function _topicsHead(){
  return `<div class="viewhead"><div class="eyebrow">Study library</div><h1>Topics</h1>
    <p>The decision each logged MCQ was testing, grouped by domain and subtopic. Domain headers show your true coverage; open one to drill in.</p></div>`;
}

function _topicCard(t){
  const enc = (t.encounters||[]).map(e =>
    `<span class="e ${e.correct?'c':'w'}">${esc(e.date)} · ${e.correct?'✓':'✗'} ${esc(e.source||'')}${e.note?` <span class="nt">— ${esc(e.note)}</span>`:''}</span>`).join('');
  const pr = (t.priority>=4) ? `<span class="prio">P${t.priority}</span>` : '';
  return `<div class="tcard" data-id="${escAttr(t.id)}">
    <button class="tcard-head" aria-expanded="false">
      <span class="pill ${esc(t.status)}">${esc(t.status)}</span>
      <span class="title">${esc(t.title)}</span>
      ${pr}
      <span class="dm">${t.stats?.correct||0}/${t.stats?.seen||0}</span>
      <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="tcard-body">
      ${t.explainer?`<div class="subhead">Explainer</div><div class="explainer">${md(t.explainer)}</div>`:''}
      ${(t.highYield||[]).length?`<div class="subhead">High-yield</div><ul class="hylist">${t.highYield.map(h=>`<li>${mdInline(h)}</li>`).join('')}</ul>`:''}
      ${(t.pitfalls||[]).length?`<div class="subhead">Common traps</div><ul class="pitlist">${t.pitfalls.map(p=>`<li>${mdInline(p)}</li>`).join('')}</ul>`:''}
      ${enc?`<div class="subhead">MCQ encounters</div><div class="enc">${enc}</div>`:''}
      ${(t.references||[]).length?`<div class="refs">Refs: ${t.references.map(esc).join(' · ')}</div>`:''}
      ${kbForTopic(t.id).map(a=>`<button class="btn kb-open" data-kb="${escAttr(a.id)}">📖 Read the full topic: ${esc(a.title)}</button>`).join('')}
    </div>
  </div>`;
}

function bindTopics(){
  document.querySelectorAll('.dsec-head').forEach(h => h.onclick = () => {
    const dom = h.parentElement.dataset.dom;
    if(expandedDomains.has(dom)) expandedDomains.delete(dom); else expandedDomains.add(dom);
    const open = h.parentElement.classList.toggle('open');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.querySelectorAll('.tcard-head').forEach(h => h.onclick = () => {
    const open = h.parentElement.classList.toggle('open');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const dom = document.getElementById('tdom');
  if(dom) dom.onchange = () => { topicDomain = dom.value; paint(); };
  document.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => { topicStatus = b.dataset.ts; paint(); });

  const s = document.getElementById('tsearch');
  if(s) s.oninput = e => {
    topicSearch = e.target.value;
    const pos = e.target.selectionStart;
    paint();
    const ns = document.getElementById('tsearch');
    if(ns){ ns.focus(); ns.setSelectionRange(pos, pos); }
  };
}
