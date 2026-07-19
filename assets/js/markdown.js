/* markdown.js — tiny inline renderer + HTML-escape helpers.
   md() supports **bold**, *italic*, `code`, single-level bullet lists,
   GitHub-style pipe tables, and [[kb-id|label]] internal links. Everything
   is HTML-escaped first, so it is always safe to feed user/deck content in. */

/* Escape for text nodes. */
function esc(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
/* Escape for use inside a double-quoted HTML attribute. */
function escAttr(s){
  return esc(s).replace(/"/g,'&quot;');
}

/* Inline formatting (input is already escaped upstream). */
function _inline(s){
  return esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>')
    // [[kb-id]] or [[kb-id|Label]] → clickable knowledge-base link
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (m, id, label) => `<a class="kblink" data-kb="${escAttr(id.trim())}">${_inline((label||id).trim())}</a>`);
}

/* Is this block a pipe table? First line has a pipe, second line is a
   separator row of dashes/colons/pipes. */
function _isTable(lines){
  return lines.length >= 2 && lines[0].includes('|') &&
    /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[1]) && lines[1].includes('-');
}
function _cells(row){
  let r = row.trim();
  if(r.startsWith('|')) r = r.slice(1);
  if(r.endsWith('|')) r = r.slice(0, -1);
  return r.split('|').map(c => c.trim());
}
function _table(lines){
  const head = _cells(lines[0]).map(c => `<th>${_inline(c)}</th>`).join('');
  const body = lines.slice(2).filter(l => l.trim()).map(row =>
    '<tr>' + _cells(row).map(c => `<td>${_inline(c)}</td>`).join('') + '</tr>').join('');
  return `<div class="tablewrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function md(src){
  if(!src) return '';
  const blocks = src.split(/\n{2,}/), out = [];
  for(const b of blocks){
    const lines = b.split('\n');
    if(_isTable(lines)){
      out.push(_table(lines));
    }else if(lines.every(l => /^\s*[-*]\s+/.test(l))){
      out.push('<ul>' + lines.map(l => '<li>' + _inline(l.replace(/^\s*[-*]\s+/,'')) + '</li>').join('') + '</ul>');
    }else{
      out.push('<p>' + lines.map(_inline).join('<br>') + '</p>');
    }
  }
  return out.join('');
}

/* Render a single inline fragment (strips the wrapping <p>). */
function mdInline(src){
  return md(src).replace(/^<p>|<\/p>$/g,'');
}
