/* views/dashboard.js — overview: headline stats, domain accuracy
   matrix, recent-accuracy trend, and a weak-first focus list. */

function renderDashboard(){
  const t = totals(), ds = domainStats();
  // Ranked by studyScore, not by status→priority (which is circular).
  const focus = studyQueue(8);

  const matrix = ds.map(d => {
    const pct = d.pct == null ? 0 : d.pct;
    const col = pct >= 80 ? 'var(--mastered)' : pct >= 55 ? 'var(--review)' : 'var(--weak)';
    return `<div class="mrow">
      <div class="lab">${esc(d.domain)}<span>${d.topics} topic${d.topics!=1?'s':''}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="pct" style="color:${d.pct==null?'var(--text-faint)':col}">${d.pct==null?'—':pct+'%'}<div class="n">${d.correct}/${d.seen}</div></div>
    </div>`;
  }).join('') || '<div class="focus-empty">No data yet. Load a data.json to begin.</div>';

  // Curriculum coverage — the only panel that can report what has NEVER
  // been studied, since it measures the deck against the blueprint rather
  // than against itself.
  const bp = blueprintCoverage();
  const bpGaps = bp.flatMap(c => c.themes.filter(th => !th.covered).map(th => ({ cat:c.n, label:th.label })));
  const bpDone = bp.reduce((n,c) => n + c.covered, 0), bpTotal = bp.reduce((n,c) => n + c.total, 0);
  const coveragePanel = bp.length ? `
    <div class="panel">
      <h2>Curriculum coverage</h2>
      <div class="hint">Exam categories vs the deck — <b>${bpDone} of ${bpTotal}</b> expected themes covered. Bars show coverage, not accuracy.</div>
      <div class="matrix cov">${bp.map(c => {
        const col = c.pct >= 90 ? 'var(--mastered)' : c.pct >= 70 ? 'var(--review)' : 'var(--weak)';
        return `<div class="mrow">
          <div class="lab">${c.n}. ${esc(c.name)}<span>${c.covered}/${c.total} themes${c.acc!=null?` · ${c.acc}% correct`:''}</span></div>
          <div class="track"><div class="fill" style="width:${c.pct}%;background:${col}"></div></div>
          <div class="pct" style="color:${col}">${c.pct}%</div>
        </div>`;
      }).join('')}</div>
      ${bpGaps.length ? `<div class="gaps"><div class="gaps-lab">Not covered yet — nothing in topics or the knowledge base</div>
        ${bpGaps.map(g => `<span class="gap">${esc(g.label)}<b>${g.cat}</b></span>`).join('')}</div>`
        : '<div class="gaps"><div class="gaps-lab">Every blueprint theme has at least one topic or article.</div></div>'}
    </div>` : '';

  const trend = activityTrend();
  const trendPanel = trend.length ? `
    <div class="panel">
      <h2>Accuracy trend</h2><div class="hint">Percent correct per logging date, most recent on the right.</div>
      <div class="trend">${trend.map(d => {
        const col = d.pct >= 80 ? 'var(--mastered)' : d.pct >= 55 ? 'var(--review)' : 'var(--weak)';
        return `<div class="trend-col">
          <div class="trend-bar" style="height:100%"><div class="seg" style="height:${d.pct}%;background:${col}"></div></div>
          <div class="cap">${d.pct}%</div>
          <div class="sub" title="${escAttr(d.date)} · ${d.correct}/${d.attempts}">${esc(d.date)}</div>
        </div>`;
      }).join('')}</div>
    </div>` : '';

  const focusList = focus.length ? focus.map(({topic:t, reasons}) => {
    const dots = (t.encounters||[]).slice(-6).map(e => `<span class="dot ${e.correct?'c':'w'}"></span>`).join('');
    const why = reasons.slice(0,3).map(r => `<span class="why">${esc(r)}</span>`).join('');
    return `<div class="focus-item" tabindex="0" role="link" data-goto="${escAttr(t.id)}">
      <span class="pill ${esc(t.status)}">${esc(t.status)}</span>
      <span class="ft">${esc(t.title)}${why?`<span class="whys">${why}</span>`:''}</span>
      <span class="fd">${esc(t.domain)}${dots?`<span class="dots">${dots}</span>`:''}</span>
    </div>`;
  }).join('') : '<div class="focus-empty">Nothing flagged yet.</div>';

  return `
  <div class="viewhead"><div class="eyebrow">Overview</div><h1>Where you're losing marks</h1>
    <p>Accuracy by curriculum domain, drawn from every MCQ batch you've logged. Lowest-scoring domains sort to the top.</p></div>
  <div class="stat-row">
    <div class="stat"><div class="k">MCQs logged</div><div class="v">${t.mcqs}</div></div>
    <div class="stat accent"><div class="k">Overall accuracy</div><div class="v">${t.acc}<small>%</small></div></div>
    <div class="stat"><div class="k">Weak topics</div><div class="v">${t.weak}</div></div>
    <div class="stat"><div class="k">Mastered</div><div class="v">${t.mastered}<small>/${t.topics}</small></div></div>
  </div>
  <div class="panel">
    <h2>Domain accuracy matrix</h2><div class="hint">Green ≥80% · amber 55–79% · red &lt;55%. A dash means untested.</div>
    <div class="matrix">${matrix}</div>
  </div>
  ${coveragePanel}
  ${trendPanel}
  <div class="panel">
    <h2>Focus next</h2><div class="hint">Ranked by accuracy, how long since you last touched it, revision progress and domain weakness. Tags explain the ranking; dots are recent attempts.</div>
    <div class="focus-list">${focusList}</div>
  </div>`;
}

function bindDashboard(){
  document.querySelectorAll('[data-goto]').forEach(el => {
    const go = () => gotoTopic(el.dataset.goto);
    el.onclick = go;
    el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } };
  });
}
