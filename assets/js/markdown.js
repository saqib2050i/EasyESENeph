/* markdown.js — tiny inline renderer + HTML-escape helpers.
   md() supports **bold**, *italic*, `code`, and single-level bullet
   lists. Everything is HTML-escaped first, so it is always safe to
   feed user/deck content into it. */

/* Escape for text nodes. */
function esc(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
/* Escape for use inside a double-quoted HTML attribute. */
function escAttr(s){
  return esc(s).replace(/"/g,'&quot;');
}

function md(src){
  if(!src) return '';
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>');
  const blocks = src.split(/\n{2,}/), out = [];
  for(const b of blocks){
    const lines = b.split('\n');
    if(lines.every(l => /^\s*[-*]\s+/.test(l))){
      out.push('<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-*]\s+/,'')) + '</li>').join('') + '</ul>');
    }else{
      out.push('<p>' + lines.map(inline).join('<br>') + '</p>');
    }
  }
  return out.join('');
}

/* Render a single inline fragment (strips the wrapping <p>), used for
   list items that are one line of markdown. */
function mdInline(src){
  return md(src).replace(/^<p>|<\/p>$/g,'');
}
