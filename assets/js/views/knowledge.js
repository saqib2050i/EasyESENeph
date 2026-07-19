/* views/knowledge.js — the knowledge base: didactic topic notes
   (definition, features, investigations, management…) kept separate from
   the MCQ scenarios. Articles cross-link to each other and to the MCQ
   topics that use them. `kbSelected` toggles list vs reader. */

function renderKnowledge(){
  if(kbSelected){
    const a = kbById(kbSelected);
    if(a) return renderArticle(a);
    kbSelected = null;
  }
  const q = kbSearch.toLowerCase();
  const list = kb().filter(a => !q ||
    [a.title, a.domain, (a.aliases||[]).join(' '), a.summary].join(' ').toLowerCase().includes(q));

  const byDom = {};
  list.forEach(a => { const d = a.domain || 'Uncategorised'; (byDom[d] || (byDom[d] = [])).push(a); });
  const groups = Object.entries(byDom).map(([d, arts]) => `
    <div class="hy-group">
      <h3>${esc(d)}</h3>
      ${arts.map(a => `<button class="kb-card" data-open="${escAttr(a.id)}">
        <span class="kb-t">${esc(a.title)}</span>
        <span class="kb-s">${esc((a.summary||'').replace(/\*/g,'').slice(0,140))}</span>
        <span class="kb-meta">${(a.sections||[]).length} section${(a.sections||[]).length!=1?'s':''}${(a.flashcards||[]).length?` · ${a.flashcards.length} card${a.flashcards.length!=1?'s':''}`:''}</span>
      </button>`).join('')}
    </div>`).join('') || `<div class="empty">No articles yet. On the <strong>Load Data</strong> view, hit <em>Copy KB prompt</em> to generate some with an LLM, then ingest them.</div>`;

  const total = DATA.topics.length, without = topicsWithoutKb().length;
  const coverage = total ? `<div class="hint">Covers ${total - without} of ${total} MCQ topics${without ? ` · ${without} still without an article` : ''}.</div>` : '';

  return `
  <div class="viewhead"><div class="eyebrow">Reference</div><h1>Knowledge base</h1>
    <p>Teaching notes per topic — definition, clinical features, investigations, management — independent of the MCQ scenarios. Each article links to the MCQs that use it.</p></div>
  <div class="topic-toolbar"><div class="search"><input id="kbsearch" placeholder="Search articles, aliases, domains…" value="${escAttr(kbSearch)}"></div></div>
  ${coverage}
  ${groups}`;
}

function renderArticle(a){
  const secs = a.sections || [];
  const toc = secs.length >= 4
    ? `<div class="kb-toc no-print">${secs.map((s,i) => `<a href="#kbsec-${i}" data-sec="${i}">${esc(s.heading)}</a>`).join('')}</div>` : '';
  const sections = secs.map((s,i) =>
    `<section class="kb-section" id="kbsec-${i}"><h2>${esc(s.heading)}</h2><div class="explainer">${md(s.body)}</div></section>`).join('');
  const keypts = (a.keyPoints||[]).length
    ? `<div class="panel kb-keypoints"><h2>Key points</h2><ul class="hylist">${a.keyPoints.map(k => `<li>${mdInline(k)}</li>`).join('')}</ul></div>` : '';
  const refs = (a.references||[]).length ? `<div class="refs">Refs: ${a.references.map(esc).join(' · ')}</div>` : '';

  const linkTopics = (a.links?.topics || []).map(id => DATA.topics.find(t => t.id === id)).filter(Boolean);
  const linkKb = (a.links?.kb || []).map(id => kbById(id)).filter(Boolean);
  const related = (linkTopics.length || linkKb.length) ? `<div class="panel kb-links no-print"><h2>Related</h2>
    ${linkTopics.length ? `<div class="subhead">MCQ topics</div><div class="enc">${linkTopics.map(t => `<span class="e link" data-goto-topic="${escAttr(t.id)}" role="link" tabindex="0"><span class="pill ${esc(t.status)}">${esc(t.status)}</span>${esc(t.title)}</span>`).join('')}</div>` : ''}
    ${linkKb.length ? `<div class="subhead">Related articles</div><div class="enc">${linkKb.map(x => `<span class="e link" data-kb="${escAttr(x.id)}" role="link" tabindex="0">${esc(x.title)}</span>`).join('')}</div>` : ''}
  </div>` : '';

  const metaline = [a.guideline ? `Guideline: ${esc(a.guideline)}` : '', a.lastUpdated ? `Updated ${esc(a.lastUpdated)}` : ''].filter(Boolean).join(' · ');

  return `
  <div class="kb-article">
    <button class="btn no-print" id="kb-back">← All articles</button>
    <div class="viewhead" style="margin-top:16px">
      <div class="eyebrow">${esc(a.domain||'')}</div>
      <h1>${esc(a.title)}</h1>
      ${a.summary ? `<p>${mdInline(a.summary)}</p>` : ''}
      ${metaline ? `<div class="kb-metaline">${metaline}</div>` : ''}
      <div class="btn-row no-print"><button class="btn" id="kb-print">Print / save as PDF</button></div>
    </div>
    ${toc}
    ${sections}
    ${keypts}
    ${related}
    ${refs}
  </div>`;
}

function bindKnowledge(){
  const s = document.getElementById('kbsearch');
  if(s) s.oninput = e => {
    kbSearch = e.target.value;
    const pos = e.target.selectionStart;
    paint();
    const ns = document.getElementById('kbsearch');
    if(ns){ ns.focus(); ns.setSelectionRange(pos, pos); }
  };
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { kbSelected = b.dataset.open; paint(); window.scrollTo(0,0); });
  const back = document.getElementById('kb-back');
  if(back) back.onclick = () => { kbSelected = null; paint(); window.scrollTo(0,0); };
  const pr = document.getElementById('kb-print');
  if(pr) pr.onclick = () => window.print();
  document.querySelectorAll('[data-goto-topic]').forEach(el => {
    const go = () => gotoTopic(el.dataset.gotoTopic);
    el.onclick = go;
    el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } };
  });
  document.querySelectorAll('.kb-toc [data-sec]').forEach(el => el.onclick = e => {
    e.preventDefault();
    const t = document.getElementById('kbsec-' + el.dataset.sec);
    if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  // [data-kb] links are handled by the global delegated listener in app.js
}
