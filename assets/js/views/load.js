/* views/load.js — the data hub: inspect the active deck, ingest a JSON
   batch (paste OR file) with a server-validated preview, export, reload,
   and copy the LLM prompt. With a backend, ingest is validated and saved
   server-side (shared DB); without one it merges into this browser. */

function renderLoad(){
  const m = DATA.meta || {};
  const srcLabel = dataSource === 'server-db' ? 'Server database — signed in; validated & saved on the server, shared across devices'
    : dataSource === 'browser' ? 'Saved in this browser (no server backend detected)'
    : dataSource === 'server' ? 'Static data.json (read-only — no write API detected)'
    : 'Built-in sample';
  const srcs = (m.sources||[]).map(s => `<div>• ${esc(s.name)} — ${esc(s.date)} · ${s.count} MCQs</div>`).join('')
    || '<div>No sources logged yet.</div>';

  const ingest = pendingImport ? renderImportResult() : `
    <textarea class="pastebox" id="pastebox" placeholder="Paste batch JSON here…" spellcheck="false"></textarea>
    <div class="or"><span>or</span></div>
    <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Choose a JSON file to ingest">
      <div class="di">Drop a <code>.json</code> file</div>
      <div class="ds">or click to browse</div>
    </div>
    <div class="btn-row"><button class="btn primary" id="preview">Validate &amp; preview</button></div>`;

  return `
  <div class="viewhead"><div class="eyebrow">Data</div><h1>Update your deck</h1>
    <p>Generate a JSON batch from new MCQs with the prompt below, then paste it or drop the file here.
    ${backend ? 'The <strong>server</strong> validates it and, if valid, merges it into the database by topic id — the change is saved and reflected immediately.'
              : 'The app validates it and merges it into your deck by topic id, remembered in this browser.'}</p></div>

  <div class="panel">
    <h2>Active deck</h2><div class="hint">${esc(srcLabel)}.</div>
    <div class="src-list"><div>Owner: ${esc(m.owner||'—')} · Exam: ${esc(m.exam||'—')} · Updated: ${esc(m.lastUpdated||'—')} · ${DATA.topics.length} topics · ${totals().mcqs} MCQs</div>${srcs}</div>
    <div class="btn-row">
      <button class="btn" id="export">Export data.json</button>
      <button class="btn" id="reset">Reload from ${backend ? 'server' : 'server file'}</button>
    </div>
  </div>

  <div class="panel">
    <h2>Ingest a batch</h2><div class="hint">Paste JSON or drop a file — merges by id, so re-ingesting the same batch won't double-count.</div>
    ${ingest}
  </div>

  <div class="panel">
    <h2>Prompt for your LLM</h2>
    <div class="hint">Copy this, paste it into a fresh chat with an LLM, and attach your MCQ PDF/DOCX. It returns the batch JSON to ingest above.</div>
    <div class="btn-row"><button class="btn primary" id="copyprompt">Copy prompt</button><span class="copied" id="copied" hidden>Copied ✓</span></div>
    <pre class="promptbox" id="promptbox">${esc(INGEST_PROMPT)}</pre>
  </div>

  <div class="panel">
    <h2>Prompt for knowledge-base articles</h2>
    <div class="hint">Give an LLM this prompt plus one or more topic names to generate teaching articles for the <strong>Knowledge</strong> tab. Ingest the JSON the same way as above.</div>
    <div class="btn-row"><button class="btn primary" id="copykbprompt">Copy KB prompt</button><span class="copied" id="copied-kb" hidden>Copied ✓</span></div>
    <pre class="promptbox" id="kbpromptbox">${esc(KB_PROMPT)}</pre>
  </div>`;
}

function renderImportResult(){
  const p = pendingImport;
  const warn = (p.warnings||[]).length ? `<ul class="warns">${p.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  if(p.errors && p.errors.length){
    return `<div class="confirm bad">
      <div class="di">Can't ingest — ${p.errors.length} problem${p.errors.length!=1?'s':''} found</div>
      <ul class="errs">${p.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${warn}
      <div class="btn-row"><button class="btn" id="do-cancel">Back</button></div>
    </div>`;
  }
  const s = p.summary || { topicsAdded:0, topicsUpdated:0, encountersAdded:0, cardsAdded:0 };
  const plural = (n, w) => `${n} ${w}${n!=1?'s':''}`;
  return `<div class="confirm">
    <div class="di">Valid ✓ — ready to ingest</div>
    <div class="import-summary">
      <span class="ic-chip add">${plural(s.topicsAdded,'new topic')}</span>
      <span class="ic-chip upd">${s.topicsUpdated} updated</span>
      <span class="ic-chip">${plural(s.encountersAdded,'new MCQ attempt')}</span>
      <span class="ic-chip">${plural(s.cardsAdded,'new card')}</span>
      ${(s.kbAdded||s.kbUpdated)?`<span class="ic-chip add">${plural(s.kbAdded,'new article')}</span><span class="ic-chip upd">${s.kbUpdated||0} article(s) updated</span>`:''}
    </div>
    ${warn}
    <div class="btn-row">
      <button class="btn primary" id="do-merge">${backend ? 'Merge &amp; save to server' : 'Merge &amp; save'}</button>
      <button class="btn" id="do-replace">Replace entire deck</button>
      <button class="btn" id="do-cancel">Cancel</button>
    </div>
    <div class="datanote">Merge keeps existing topics and adds/updates from the batch. Replace discards the current deck and keeps only this batch.${backend ? ' Changes are written to the server database.' : ' Saved in this browser — Export to persist to the server file.'}</div>
  </div>`;
}

function bindLoad(){
  if(pendingImport){
    const merge = document.getElementById('do-merge');
    const replace = document.getElementById('do-replace');
    if(merge) merge.onclick = () => applyImport('merge');
    if(replace) replace.onclick = () => applyImport('replace');
    document.getElementById('do-cancel').onclick = () => { pendingImport = null; paint(); };
  }else{
    const dz = document.getElementById('dropzone');
    const pick = () => document.getElementById('fileinput').click();
    dz.onclick = pick;
    dz.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } };
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = () => dz.classList.remove('drag');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); if(e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    document.getElementById('preview').onclick = () => stageImport(document.getElementById('pastebox').value);
  }
  document.getElementById('export').onclick = exportData;
  document.getElementById('reset').onclick = () => {
    if(backend || confirm('Discard the browser-saved deck and reload data.json from the server?')) resetToServer();
  };
  const cp = document.getElementById('copyprompt');
  if(cp) cp.onclick = () => copyText(INGEST_PROMPT, 'copied');
  const kp = document.getElementById('copykbprompt');
  if(kp) kp.onclick = () => copyText(KB_PROMPT, 'copied-kb');
}
