/* views/highyield.js — every learning point on one scannable page,
   grouped by domain. Print CSS turns this into a clean PDF. */

function renderHighYield(){
  const byDomain = {};
  DATA.topics.forEach(t => {
    const d = t.domain || 'Uncategorised';
    (byDomain[d] || (byDomain[d] = [])).push(t);
  });

  const groups = Object.entries(byDomain).map(([d, topics]) => `
    <div class="hy-group">
      <h3>${esc(d)}</h3>
      ${topics.map(t => `
        <div class="hy-topic">
          <div class="tt"><span class="pill ${esc(t.status)}">${esc(t.status)}</span>${esc(t.title)}</div>
          <ul>${(t.highYield||[]).map(h => `<li>${mdInline(h)}</li>`).join('') || '<li style="color:var(--text-faint)">No high-yield points yet.</li>'}</ul>
        </div>`).join('')}
    </div>`).join('') || '<div class="empty">No topics loaded.</div>';

  return `
  <div class="viewhead no-print"><div class="eyebrow">Condensed recall</div><h1>High-yield sheet</h1>
    <p>Every learning point in one scannable page, grouped by domain. Use the button below (not the whole-page browser print from other views) to export a clean PDF for the last-minute pass.</p>
    <br><button class="btn" id="hy-print">Print / save as PDF</button></div>
  ${groups}`;
}

function bindHighYield(){
  const p = document.getElementById('hy-print');
  if(p) p.onclick = () => window.print();
}
