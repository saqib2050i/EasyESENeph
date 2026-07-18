/* store.js — safe key/value storage.
   Wraps localStorage in try/catch and falls back to an in-memory
   object, so the app also works in a sandbox / file:// / private mode.
   Never call localStorage directly elsewhere — always go through `store`.
   Keys in use: nephron-theme, nephron-srs. */
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return this._m?.[k] ?? null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ (this._m || (this._m = {}))[k] = v; } },
  _m:{}
};
