/* app.js — orchestration: view registry, router/paint, shared
   navigation, file I/O, theme switching, global keys, and boot.
   Loaded last, after all views. */

/* Each view supplies a render() (returns an HTML string) and a bind()
   (wires its events after the string is in the DOM). */
const VIEWS = {
  dashboard:  { render: renderDashboard,  bind: bindDashboard  },
  flashcards: { render: renderFlashcards, bind: bindFlashcards },
  highyield:  { render: renderHighYield,  bind: bindHighYield  },
  topics:     { render: renderTopics,     bind: bindTopics     },
  load:       { render: renderLoad,        bind: bindLoad       }
};

function paint(){
  const v = VIEWS[VIEW] || VIEWS.dashboard;
  document.getElementById('main').innerHTML = v.render();
  if(v.bind) v.bind();
  document.getElementById('ct-cards').textContent  = allCards().length;
  document.getElementById('ct-topics').textContent = DATA.topics.length;
}

function switchView(v){
  VIEW = v;
  document.querySelectorAll('#nav button').forEach(b => {
    const on = b.dataset.view === v;
    b.classList.toggle('on', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  if(v === 'flashcards') buildDeck();
  paint();
  window.scrollTo(0,0);
}

/* Shared: jump from a dashboard focus item to its expanded topic card. */
function gotoTopic(id){
  switchView('topics');
  setTimeout(() => {
    const c = document.querySelector(`.tcard[data-id="${CSS.escape(id)}"]`);
    if(c){
      c.classList.add('open');
      const head = c.querySelector('.tcard-head');
      if(head) head.setAttribute('aria-expanded','true');
      c.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }, 60);
}

/* ================= DATA I/O & INGEST =================
   Two paths, chosen at boot by whether the write API is reachable:
   - backend  → the server validates, merges and persists (real DB).
   - no backend (static / file://) → merge client-side into localStorage. */

function validateDeckClient(j){
  const e = [];
  if(!j || typeof j !== 'object' || Array.isArray(j)) e.push('Top level must be a JSON object with a "topics" array.');
  else if(!Array.isArray(j.topics) || !j.topics.length) e.push('"topics" must be a non-empty array.');
  else j.topics.forEach((t,i) => { if(!t || typeof t.id !== 'string' || !t.id.trim()) e.push(`topics[${i}] needs a non-empty string "id".`); });
  return e;
}

function summaryText(s){
  return s ? `${s.topicsAdded} new, ${s.topicsUpdated} updated, ${s.encountersAdded} attempt(s), ${s.cardsAdded} card(s).` : '';
}

async function apiPost(path, raw){
  const res = await fetch(path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: raw, credentials:'same-origin' });
  return res.json();
}

/* Validate a payload (paste or file text) and stage a preview. */
async function stageImport(raw){
  raw = (raw || '').trim();
  if(!raw){ alert('Paste some JSON or choose a file first.'); return; }
  if(backend){
    let res;
    try{ res = await apiPost('./api/validate', raw); }
    catch(e){ alert('Could not reach the server to validate.'); return; }
    pendingImport = { raw, summary: res.summary, errors: res.errors || [], warnings: res.warnings || [] };
  }else{
    let j;
    try{ j = JSON.parse(raw); }
    catch(e){ pendingImport = { raw, errors: ['Invalid JSON: ' + e.message], warnings: [], summary: null }; switchView('load'); return; }
    const errs = validateDeckClient(j);
    pendingImport = { raw, incoming: j, errors: errs, warnings: [], summary: errs.length ? null : mergeDecks(DATA, j).summary };
  }
  switchView('load');
}

/* Commit the staged import: 'merge' into the deck, or 'replace' it. */
async function applyImport(mode){
  if(!pendingImport || (pendingImport.errors && pendingImport.errors.length)) return;
  if(backend){
    let res;
    try{ res = await apiPost('./api/ingest?mode=' + encodeURIComponent(mode), pendingImport.raw); }
    catch(e){ alert('Could not reach the server.'); return; }
    if(!res.ok){ alert('Ingest rejected:\n' + (res.errors || ['unknown error']).join('\n')); return; }
    DATA = res.deck; dataSource = 'server-db'; buildDeck(); pendingImport = null;
    alert('Saved to the server database — ' + summaryText(res.summary));
    switchView('dashboard');
  }else{
    const base = mode === 'replace' ? { meta: pendingImport.incoming.meta || {}, topics: [] } : DATA;
    const { deck, summary } = mergeDecks(base, pendingImport.incoming);
    DATA = deck; persistDeck(); buildDeck(); pendingImport = null;
    alert('Saved in this browser — ' + summaryText(summary));
    switchView('dashboard');
  }
}

/* Read a dropped/picked file and stage it (same path as pasting). */
function readFile(file){
  const r = new FileReader();
  r.onload = () => stageImport(r.result);
  r.readAsText(file);
}

/* Persist the working deck to the browser (no-backend path only). */
function persistDeck(){
  store.set('nephron-data', DATA);
  dataSource = 'browser';
}

/* Reload the authoritative deck: from the server DB, or the static file. */
function resetToServer(){
  if(backend){
    fetch('./api/deck', { cache:'no-store' }).then(r => r.json()).then(j => {
      if(j && j.topics){ DATA = j; dataSource = 'server-db'; buildDeck(); switchView('load'); }
    });
    return;
  }
  store.set('nephron-data', null);
  loadServerData().then(() => { buildDeck(); switchView('load'); });
}

function exportData(){
  const blob = new Blob([JSON.stringify(DATA,null,2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
}

/* Copy text to the clipboard (with a file:// / older-browser fallback),
   then briefly reveal the element with id `flagId`. */
function copyText(text, flagId){
  const done = () => { const el = document.getElementById(flagId); if(el){ el.hidden = false; setTimeout(() => { el.hidden = true; }, 1500); } };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try{ document.execCommand('copy'); done(); }
    catch(e){ alert('Copy failed — select the prompt text manually.'); }
    document.body.removeChild(ta);
  };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

/* ================= THEME ================= */
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('.sw').forEach(s => {
    const on = s.dataset.t === t;
    s.classList.toggle('on', on);
    s.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  store.set('nephron-theme', t);
}

/* ================= EVENTS ================= */
function wireChrome(){
  document.getElementById('swatches').addEventListener('click', e => {
    const sw = e.target.closest('.sw');
    if(sw) setTheme(sw.dataset.t);
  });
  document.getElementById('nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if(b) switchView(b.dataset.view);
  });
  document.getElementById('fileinput').addEventListener('change', e => {
    if(e.target.files[0]) readFile(e.target.files[0]);
  });
  document.getElementById('signout').addEventListener('click', logout);
  document.addEventListener('keydown', e => {
    if(VIEW !== 'flashcards' || !deck.length || deckPos >= deck.length) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea') return;
    if(e.code === 'Space'){ e.preventDefault(); flipped = !flipped; paint(); }
    else if(flipped && ['1','2','3'].includes(e.key)) gradeCard(+e.key - 1);
  });
}

/* Load the authoritative static deck, falling back to the embedded sample
   when ./data.json is unreachable (sandbox / file:// / offline). */
async function loadServerData(){
  try{
    const res = await fetch('./data.json', { cache:'no-store' });
    if(res.ok){ const j = await res.json(); if(j.topics){ DATA = j; dataSource = 'server'; return; } }
  }catch(e){ /* offline — fall through */ }
  DATA = EMBEDDED; dataSource = 'embedded';
}

/* Detect the API (present only when served by server.py) and current auth. */
async function detectBackend(){
  try{
    const res = await fetch('./api/health', { cache:'no-store', credentials:'same-origin' });
    if(res.ok){ const h = await res.json(); if(h && h.backend){ backend = true; authRequired = !!h.authRequired; authed = !!h.authed; return true; } }
  }catch(e){ /* static host — no backend */ }
  return false;
}

/* Load the deck from the server DB (session already valid). */
async function loadServerDeck(){
  try{
    const res = await fetch('./api/deck', { cache:'no-store', credentials:'same-origin' });
    if(res.ok){ const j = await res.json(); if(j && j.topics){ DATA = j; dataSource = 'server-db'; return; } }
  }catch(e){ /* fall through */ }
  await loadServerData();
}

/* ================= LOGIN GATE ================= */
function showLogin(errMsg){
  let el = document.getElementById('login-overlay');
  if(!el){ el = document.createElement('div'); el.id = 'login-overlay'; document.body.appendChild(el); }
  el.innerHTML = `
    <form class="login-card" id="login-form" autocomplete="on">
      <div class="brand"><span class="mark">Ne</span><div><span class="name">Nephron</span><span class="sub">ESENeph Deck</span></div></div>
      <label>Username<input id="login-user" name="username" autocomplete="username" value="admin" autofocus></label>
      <label>Password<input id="login-pass" name="password" type="password" autocomplete="current-password"></label>
      <label class="remember"><input type="checkbox" id="login-remember" checked> Remember me on this device</label>
      ${errMsg ? `<div class="login-err">${esc(errMsg)}</div>` : ''}
      <button class="btn primary" id="login-btn" type="submit">Sign in</button>
      <div class="login-note">Remember me keeps you signed in for weeks; unticked ends after a few hours.</div>
    </form>`;
  const form = document.getElementById('login-form');
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    let res;
    try{
      res = await fetch('./api/login', { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ user: document.getElementById('login-user').value, password: document.getElementById('login-pass').value, remember: document.getElementById('login-remember').checked }),
        credentials:'same-origin' });
    }catch(_){ showLogin('Could not reach the server.'); return; }
    if(res.ok){ location.reload(); }        // reload → health reports authed → app renders
    else showLogin('Incorrect username or password.');
  };
}

async function logout(){
  try{ await fetch('./api/logout', { method:'POST', credentials:'same-origin' }); }catch(e){}
  location.reload();
}

/* ================= BOOT ================= */
async function boot(){
  wireChrome();
  const savedTheme = store.get('nephron-theme');
  if(savedTheme) setTheme(savedTheme);
  if(await detectBackend()){
    if(authRequired && !authed){ showLogin(); return; }   // gate the whole app behind login
    document.getElementById('signout').hidden = false;
    await loadServerDeck();
  }else{
    // Static/offline: a browser-ingested deck wins, else the served file.
    const stored = store.get('nephron-data');
    if(stored && stored.topics && stored.topics.length){ DATA = stored; dataSource = 'browser'; }
    else await loadServerData();
  }
  buildDeck();
  paint();
}

boot();
