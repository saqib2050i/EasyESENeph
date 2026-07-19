"""merge_engine.py — server-side validation + merge for Nephron.

Mirrors assets/js/merge.js exactly (keep the two in sync). Used by
server.py to (1) validate a pasted/uploaded JSON payload and (2) merge a
batch into the live deck by stable topic/flashcard id. Pure stdlib.
"""
import json
import copy
import datetime

VALID_STATUS = {"weak", "review", "mastered"}

TAXONOMY = {
    "Renal Physiology & Pathophysiology",
    "Fluid, Electrolyte & Acid–Base",
    "Acute Kidney Injury",
    "CKD, Complications & Progression",
    "Glomerular Diseases",
    "Tubulointerstitial & Drug-Induced Disease",
    "Hypertension & Renovascular Disease",
    "Inherited & Congenital Kidney Disease",
    "Systemic Disease & the Kidney",
    "Pregnancy & the Kidney",
    "Stones & Nephrocalcinosis",
    "Infection & the Kidney",
    "Haemodialysis",
    "Peritoneal Dialysis",
    "Transplantation",
    "Onconephrology & Critical Care",
    "Pharmacology & Prescribing",
    "Nutrition, Statistics & Research",
}


# ---------- derived-field helpers (mirror merge.js) ----------
def _enc_key(e):
    return "|".join([
        str(e.get("date", "")),
        str(e.get("source", "")),
        "1" if e.get("correct") else "0",
        str(e.get("note", "")),
    ])


def _recompute_stats(t):
    encs = t.get("encounters") or []
    if encs:
        t["stats"] = {"seen": len(encs), "correct": sum(1 for e in encs if e.get("correct"))}
    else:
        t["stats"] = t.get("stats") or {"seen": 0, "correct": 0}


def _recompute_status(t):
    encs = t.get("encounters") or []
    if not encs:
        return t.get("status", "review")
    correct = sum(1 for e in encs if e.get("correct"))
    wrong = len(encs) - correct
    last = encs[-1]
    if not last.get("correct") or wrong > correct:
        return "weak"
    recent = encs[-2:]
    if correct >= 2 and all(e.get("correct") for e in recent):
        return "mastered"
    return "review"


def _clamp_priority(status, p):
    if not isinstance(p, (int, float)):
        p = 4 if status == "weak" else 1 if status == "mastered" else 3
    if status == "weak":
        p = max(p, 4)
    if status == "mastered":
        p = min(p, 2)
    return max(1, min(5, int(p)))


def normalize_topic(t):
    t["encounters"] = t.get("encounters") or []
    t["flashcards"] = t.get("flashcards") or []
    _recompute_stats(t)
    t["status"] = _recompute_status(t)
    t["priority"] = _clamp_priority(t["status"], t.get("priority"))
    return t


def _merge_topic(base, inc):
    enc_added = cards_added = 0
    for k in ("title", "domain", "subtopic", "explainer"):
        if inc.get(k) not in (None, ""):
            base[k] = inc[k]
    for k in ("highYield", "pitfalls", "references"):
        if isinstance(inc.get(k), list) and inc[k]:
            base[k] = inc[k]
    base.setdefault("encounters", [])
    seen = {_enc_key(e) for e in base["encounters"]}
    for e in inc.get("encounters", []):
        k = _enc_key(e)
        if k not in seen:
            base["encounters"].append(e)
            seen.add(k)
            enc_added += 1
    base.setdefault("flashcards", [])
    by_id = {c.get("id"): c for c in base["flashcards"]}
    for c in inc.get("flashcards", []):
        if not c or not c.get("id"):
            continue
        if c["id"] in by_id:
            by_id[c["id"]].update(c)
        else:
            base["flashcards"].append(c)
            by_id[c["id"]] = c
            cards_added += 1
    _recompute_stats(base)
    base["status"] = _recompute_status(base)
    base["priority"] = _clamp_priority(base["status"], inc.get("priority", base.get("priority")))
    return enc_added, cards_added


# ---------- knowledge-base articles ----------
def normalize_article(a):
    a.setdefault("sections", [])
    a.setdefault("keyPoints", [])
    a.setdefault("flashcards", [])
    a.setdefault("references", [])
    a.setdefault("aliases", [])
    a.setdefault("links", {})
    a["links"].setdefault("topics", [])
    a["links"].setdefault("kb", [])
    return a


def _merge_article(base, inc):
    normalize_article(base)
    for k in ("title", "domain", "subtitle", "summary", "guideline", "lastUpdated"):
        if inc.get(k) not in (None, ""):
            base[k] = inc[k]
    for k in ("sections", "keyPoints", "references", "aliases"):
        if isinstance(inc.get(k), list) and inc[k]:
            base[k] = inc[k]
    if inc.get("links"):
        base["links"]["topics"] = list(dict.fromkeys((base["links"].get("topics") or []) + (inc["links"].get("topics") or [])))
        base["links"]["kb"] = list(dict.fromkeys((base["links"].get("kb") or []) + (inc["links"].get("kb") or [])))
    cby = {c.get("id"): c for c in base.get("flashcards", [])}
    for c in inc.get("flashcards", []):
        if not c or not c.get("id"):
            continue
        if c["id"] in cby:
            cby[c["id"]].update(c)
        else:
            base["flashcards"].append(c)
            cby[c["id"]] = c


def merge_decks(base, incoming):
    """Return (deck, summary). Does not mutate `base`."""
    deck = copy.deepcopy(base or {"meta": {}, "topics": []})
    deck.setdefault("meta", {})
    deck.setdefault("topics", [])
    summary = {"topicsAdded": 0, "topicsUpdated": 0, "encountersAdded": 0, "cardsAdded": 0,
               "sourcesAdded": 0, "kbAdded": 0, "kbUpdated": 0}
    by_id = {t["id"]: t for t in deck["topics"] if t.get("id")}

    for inc in incoming.get("topics", []):
        if not inc or not inc.get("id"):
            continue
        if inc["id"] in by_id:
            ea, ca = _merge_topic(by_id[inc["id"]], inc)
            summary["topicsUpdated"] += 1
            summary["encountersAdded"] += ea
            summary["cardsAdded"] += ca
        else:
            t = normalize_topic(copy.deepcopy(inc))
            deck["topics"].append(t)
            by_id[t["id"]] = t
            summary["topicsAdded"] += 1
            summary["encountersAdded"] += len(t["encounters"])
            summary["cardsAdded"] += len(t["flashcards"])

    if isinstance(incoming.get("knowledgeBase"), list):
        deck.setdefault("knowledgeBase", [])
        kb_id = {a["id"]: a for a in deck["knowledgeBase"] if a.get("id")}
        for inc in incoming["knowledgeBase"]:
            if not inc or not inc.get("id"):
                continue
            if inc["id"] in kb_id:
                _merge_article(kb_id[inc["id"]], inc)
                summary["kbUpdated"] += 1
            else:
                a = normalize_article(copy.deepcopy(inc))
                deck["knowledgeBase"].append(a)
                kb_id[a["id"]] = a
                summary["kbAdded"] += 1

    im = incoming.get("meta", {}) or {}
    deck["meta"]["exam"] = deck["meta"].get("exam") or im.get("exam") or "ESENeph"
    deck["meta"]["owner"] = deck["meta"].get("owner") or im.get("owner") or ""
    # Advance to the most recent date — never regress on an older-dated batch.
    dates = sorted([d for d in [deck["meta"].get("lastUpdated"), im.get("lastUpdated")] if d])
    deck["meta"]["lastUpdated"] = dates[-1] if dates else datetime.date.today().isoformat()
    deck["meta"].setdefault("sources", [])
    src_seen = {(s.get("name", ""), s.get("date", "")) for s in deck["meta"]["sources"]}
    for s in im.get("sources", []):
        k = (s.get("name", ""), s.get("date", ""))
        if k not in src_seen:
            deck["meta"]["sources"].append(s)
            src_seen.add(k)
            summary["sourcesAdded"] += 1
    deck["meta"]["totalMcqs"] = sum(len(t.get("encounters") or []) for t in deck["topics"]) or deck["meta"].get("totalMcqs", 0)
    return deck, summary


# ---------- validation ----------
def validate_payload(raw_text):
    """Parse + schema-check a pasted/uploaded payload.

    Returns { ok, errors[], warnings[], data }. `errors` block an ingest;
    `warnings` are advisory (the app reads fields defensively).
    """
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        return {"ok": False, "errors": [f"Invalid JSON at line {e.lineno}, column {e.colno}: {e.msg}."], "warnings": [], "data": None}

    errors, warnings = [], []
    if not isinstance(data, dict):
        return {"ok": False, "errors": ["Top level must be a JSON object with a \"topics\" array."], "warnings": [], "data": None}

    topics = data.get("topics")
    kb = data.get("knowledgeBase")
    has_topics = isinstance(topics, list) and len(topics) > 0
    has_kb = isinstance(kb, list) and len(kb) > 0
    if not has_topics and not has_kb:
        errors.append('Need a non-empty "topics" array and/or a "knowledgeBase" array.')
    if topics is not None and not isinstance(topics, list):
        errors.append('"topics" must be an array.')
        topics = []
    topics = topics if isinstance(topics, list) else []

    ids = set()
    card_ids = set()
    for i, t in enumerate(topics):
        where = f"topics[{i}]"
        if not isinstance(t, dict):
            errors.append(f"{where} must be an object.")
            continue
        tid = t.get("id")
        label = tid if isinstance(tid, str) else where
        if not isinstance(tid, str) or not tid.strip():
            errors.append(f'{where} needs a non-empty string "id".')
        elif tid in ids:
            errors.append(f'Duplicate topic id "{tid}".')
        else:
            ids.add(tid)
        for k in ("title", "domain"):
            v = t.get(k)
            if not isinstance(v, str) or not v.strip():
                errors.append(f'Topic "{label}" needs a "{k}".')
        dom = t.get("domain")
        if isinstance(dom, str) and dom.strip() and dom not in TAXONOMY:
            warnings.append(f'Topic "{label}" domain "{dom}" is not in the taxonomy (it will still load).')
        if "status" in t and t["status"] not in VALID_STATUS:
            warnings.append(f'Topic "{label}" status "{t.get("status")}" is unusual (expected weak/review/mastered).')
        enc = t.get("encounters")
        if enc is not None and not isinstance(enc, list):
            errors.append(f'Topic "{label}".encounters must be an array.')
        fc = t.get("flashcards")
        if fc is not None:
            if not isinstance(fc, list):
                errors.append(f'Topic "{label}".flashcards must be an array.')
            else:
                for j, c in enumerate(fc):
                    if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c["id"].strip():
                        errors.append(f'Topic "{label}".flashcards[{j}] needs a string "id".')
                    elif c["id"] in card_ids:
                        warnings.append(f'Flashcard id "{c["id"]}" appears more than once.')
                    else:
                        card_ids.add(c["id"])

    # knowledge-base articles (optional)
    kb_ids = set()
    for i, a in enumerate(kb if isinstance(kb, list) else []):
        where = f"knowledgeBase[{i}]"
        if not isinstance(a, dict):
            errors.append(f"{where} must be an object.")
            continue
        aid = a.get("id")
        label = aid if isinstance(aid, str) else where
        if not isinstance(aid, str) or not aid.strip():
            errors.append(f'{where} needs a non-empty string "id".')
        elif aid in kb_ids:
            errors.append(f'Duplicate knowledge-base id "{aid}".')
        else:
            kb_ids.add(aid)
        for k in ("title", "domain"):
            if not isinstance(a.get(k), str) or not a.get(k, "").strip():
                errors.append(f'Article "{label}" needs a "{k}".')
        dom = a.get("domain")
        if isinstance(dom, str) and dom.strip() and dom not in TAXONOMY:
            warnings.append(f'Article "{label}" domain "{dom}" is not in the taxonomy (it will still load).')
        secs = a.get("sections")
        if secs is not None:
            if not isinstance(secs, list):
                errors.append(f'Article "{label}".sections must be an array.')
            else:
                for j, s in enumerate(secs):
                    if not isinstance(s, dict) or not isinstance(s.get("heading"), str) or not isinstance(s.get("body"), str):
                        errors.append(f'Article "{label}".sections[{j}] needs "heading" and "body" strings.')
        fc = a.get("flashcards")
        if isinstance(fc, list):
            for j, c in enumerate(fc):
                if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c["id"].strip():
                    errors.append(f'Article "{label}".flashcards[{j}] needs a string "id".')

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "data": data}
