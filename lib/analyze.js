// Reads an interactive PDF (e.g. exported from InDesign) and extracts every
// clickable area with the actions behind it, in a form the web viewer can run.
//
// Why server-side: PDF.js only reads a button's /A action. InDesign puts most
// button actions in /AA (On Release / On Click), chains several actions via
// /Next and implements Show/Hide with JavaScript or /Hide actions — none of
// which PDF.js executes. So we resolve all of that here, once, at upload time.

import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFHexString,
  PDFNumber, PDFStream, PDFBool, decodePDFRawStream,
} from 'pdf-lib';

const NAMED = new Set(['NextPage', 'PrevPage', 'FirstPage', 'LastPage', 'GoBack', 'GoForward']);

// PDF.js identifies annotations by their object reference: "12R" / "12R3".
const refId = (ref) => (ref.generationNumber === 0 ? `${ref.objectNumber}R` : `${ref.objectNumber}R${ref.generationNumber}`);

export async function analyzePdf(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const ctx = doc.context;
  const L = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const str = (o) => {
    o = L(o);
    if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText();
    if (o instanceof PDFName) return o.decodeText();
    return null;
  };
  const num = (o) => { o = L(o); return o instanceof PDFNumber ? o.asNumber() : null; };
  const get = (dict, key) => (dict instanceof PDFDict ? L(dict.get(PDFName.of(key))) : undefined);

  const pages = doc.getPages();
  const pageIndexByRef = new Map();
  pages.forEach((p, i) => pageIndexByRef.set(refId(p.ref), i));

  // ---- named destinations (both the old /Dests dict and the /Names tree) ----
  const namedDests = new Map();
  const catalog = doc.catalog;
  const oldDests = get(catalog, 'Dests');
  if (oldDests instanceof PDFDict) {
    for (const [k, v] of oldDests.entries()) namedDests.set(k.decodeText(), v);
  }
  const walkNameTree = (node, depth = 0) => {
    node = L(node);
    if (!(node instanceof PDFDict) || depth > 40) return;
    const names = get(node, 'Names');
    if (names instanceof PDFArray) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        const k = str(names.get(i));
        if (k != null) namedDests.set(k, names.get(i + 1));
      }
    }
    const kids = get(node, 'Kids');
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walkNameTree(kids.get(i), depth + 1);
  };
  walkNameTree(get(get(catalog, 'Names'), 'Dests'));

  const resolveDest = (d, depth = 0) => {
    d = L(d);
    if (depth > 5 || d == null) return null;
    if (d instanceof PDFDict) return resolveDest(d.get(PDFName.of('D')), depth + 1);
    if (d instanceof PDFArray) {
      const target = d.get(0);
      if (target instanceof PDFRef) {
        const idx = pageIndexByRef.get(refId(target));
        return idx ?? null;
      }
      const n = num(target);
      return n != null && n >= 0 && n < pages.length ? n : null;
    }
    const name = str(d);
    if (name != null && namedDests.has(name)) return resolveDest(namedDests.get(name), depth + 1);
    return null;
  };

  // ---- fully-qualified field names ----
  const fieldName = (dict) => {
    const parts = [];
    let cur = dict;
    for (let i = 0; cur instanceof PDFDict && i < 30; i++) {
      const t = str(cur.get(PDFName.of('T')));
      if (t != null) parts.unshift(t);
      cur = get(cur, 'Parent');
    }
    return parts.length ? parts.join('.') : null;
  };

  // ---- JavaScript (InDesign Show/Hide + simple navigation) ----
  const jsText = (o) => {
    o = L(o);
    if (o instanceof PDFStream) {
      try { return new TextDecoder('latin1').decode(decodePDFRawStream(o).decode()); } catch { return ''; }
    }
    return str(o) || '';
  };
  const parseJs = (js) => {
    const out = [];
    const vars = new Map();
    const fieldRe = /getField\(\s*(["'])(.*?)\1\s*\)/;
    for (const raw of js.split(/;|\n/)) {
      const s = raw.trim();
      if (!s) continue;
      const assign = s.match(/^(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s*=\s*this\.getField\(\s*(["'])(.*?)\2\s*\)\s*$/);
      if (assign) { vars.set(assign[1], assign[3]); continue; }
      let field = null;
      const direct = s.match(fieldRe);
      if (direct) field = direct[2];
      else {
        const v = s.match(/^([A-Za-z_$][\w$]*)\s*\.\s*display/);
        if (v && vars.has(v[1])) field = vars.get(v[1]);
      }
      if (field != null && /\.display\s*=/.test(s)) {
        const vis = /display\.visible/.test(s);
        const hid = /display\.(hidden|noView)/.test(s);
        out.push({ type: 'visibility', fields: [field], mode: vis && hid ? 'toggle' : vis ? 'show' : 'hide' });
        continue;
      }
      let m;
      if ((m = s.match(/pageNum\s*=\s*(\d+)/))) out.push({ type: 'goto', page: Number(m[1]) });
      else if (/pageNum\s*\+\+|pageNum\s*\+=\s*1|pageNum\s*=\s*this\.pageNum\s*\+\s*1/.test(s)) out.push({ type: 'named', name: 'NextPage' });
      else if (/pageNum\s*--|pageNum\s*-=\s*1|pageNum\s*=\s*this\.pageNum\s*-\s*1/.test(s)) out.push({ type: 'named', name: 'PrevPage' });
      else if ((m = s.match(/execMenuItem\(\s*["'](\w+)["']/)) && NAMED.has(m[1])) out.push({ type: 'named', name: m[1] });
      else if ((m = s.match(/launchURL\(\s*["']([^"']+)["']/))) out.push({ type: 'uri', url: m[1] });
    }
    return out;
  };

  // ---- one action dict (+ its /Next chain) -> list of viewer actions ----
  const parseAction = (a, seen = new Set()) => {
    a = L(a);
    const out = [];
    if (!(a instanceof PDFDict) || seen.has(a)) return out;
    seen.add(a);
    const S = str(a.get(PDFName.of('S')));
    switch (S) {
      case 'GoTo': {
        const D = a.get(PDFName.of('D'));
        const p = resolveDest(D);
        if (p != null) out.push({ type: 'goto', page: p });
        else out.push({ type: 'broken', what: str(D) != null ? `destinația „${str(D)}” nu există` : 'pagina destinație nu există' });
        break;
      }
      case 'Named': {
        const n = str(a.get(PDFName.of('N')));
        if (NAMED.has(n)) out.push({ type: 'named', name: n });
        else out.push({ type: 'unsupported', s: `Named:${n}` });
        break;
      }
      case 'URI': {
        const u = str(a.get(PDFName.of('URI')));
        if (u) out.push({ type: 'uri', url: u });
        break;
      }
      case 'Launch': case 'GoToR': {
        const f = a.get(PDFName.of('F'));
        const u = str(f) ?? str(get(L(f), 'F'));
        if (u && /^(https?:|mailto:|tel:)/i.test(u)) out.push({ type: 'uri', url: u });
        else out.push({ type: 'unsupported', s: S });
        break;
      }
      case 'Hide': {
        const H = L(a.get(PDFName.of('H')));
        const hide = !(H instanceof PDFBool) || H.asBoolean();
        const T = a.get(PDFName.of('T'));
        const items = L(T) instanceof PDFArray ? L(T).asArray() : [T];
        const fields = [], ids = [];
        for (const it of items) {
          if (it instanceof PDFRef) {
            // a field may be a parent whose /Kids are the actual widgets
            const stack = [it];
            for (let g = 0; stack.length && g < 200; g++) {
              const r = stack.pop();
              const kids = get(L(r), 'Kids');
              if (kids instanceof PDFArray) stack.push(...kids.asArray().filter((k) => k instanceof PDFRef));
              else ids.push(refId(r));
            }
          }
          else { const n = str(it); if (n != null) fields.push(n); }
        }
        out.push({ type: 'visibility', fields, ids, mode: hide ? 'hide' : 'show' });
        break;
      }
      case 'JavaScript': {
        const js = jsText(a.get(PDFName.of('JS')));
        const parsed = parseJs(js);
        if (parsed.length) out.push(...parsed);
        else if (js.trim()) out.push({ type: 'unsupported', s: 'JavaScript' });
        break;
      }
      default:
        if (S) out.push({ type: 'unsupported', s: S });
    }
    const next = L(a.get(PDFName.of('Next')));
    if (next instanceof PDFArray) for (const n of next.asArray()) out.push(...parseAction(n, seen));
    else if (next) out.push(...parseAction(next, seen));
    return out;
  };

  // ---- walk pages ----
  const result = { pageCount: pages.length, pages: [] };
  const byField = new Map(); // field name -> [annot ids]
  const unsupported = new Set();
  const raw = []; // per page: problems found while walking

  // fonts that are used but not embedded (iPad would substitute them)
  const STD14 = /^(Times|Helvetica|Courier|Symbol|ZapfDingbats|Arial)/i;
  const fontsSeen = new Map();
  const missingFonts = (resources, depth = 0, seen = new Set()) => {
    const out = new Set();
    resources = L(resources);
    if (!(resources instanceof PDFDict) || depth > 4 || seen.has(resources)) return out;
    seen.add(resources);
    const fonts = get(resources, 'Font');
    if (fonts instanceof PDFDict) {
      for (const [, fref] of fonts.entries()) {
        const key = fref instanceof PDFRef ? refId(fref) : null;
        if (key && fontsSeen.has(key)) { const n = fontsSeen.get(key); if (n) out.add(n); continue; }
        const f = L(fref);
        let bad = null;
        if (f instanceof PDFDict) {
          const subtype = str(f.get(PDFName.of('Subtype')));
          const base = (str(f.get(PDFName.of('BaseFont'))) || '?').replace(/^[A-Z]{6}\+/, '');
          let desc = get(f, 'FontDescriptor');
          if (subtype === 'Type0') { const df = get(f, 'DescendantFonts'); desc = df instanceof PDFArray ? get(L(df.get(0)), 'FontDescriptor') : null; }
          if (subtype !== 'Type3') {
            const embedded = desc instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc.has(PDFName.of(k)));
            if (!embedded && !STD14.test(base)) bad = base;
          }
        }
        if (key) fontsSeen.set(key, bad);
        if (bad) out.add(bad);
      }
    }
    const xo = get(resources, 'XObject');
    if (xo instanceof PDFDict) {
      for (const [, x] of xo.entries()) {
        const xs = L(x);
        if (xs instanceof PDFStream && str(xs.dict.get(PDFName.of('Subtype'))) === 'Form') {
          for (const n of missingFonts(xs.dict.get(PDFName.of('Resources')), depth + 1, seen)) out.add(n);
        }
      }
    }
    return out;
  };

  pages.forEach((page, pi) => {
    const { width, height } = page.getSize();
    const info = { width, height, hotspots: [], toggleable: [], transition: null };
    const pr = { broken: [], unsupported: new Set(), noAction: [], fonts: [] };
    raw[pi] = pr;
    try { pr.fonts = [...missingFonts(page.node.get(PDFName.of('Resources')))]; } catch { /* ignore */ }
    const trans = get(page.node, 'Trans');
    if (trans instanceof PDFDict) {
      const s = str(trans.get(PDFName.of('S'))) || 'R';
      const d = num(trans.get(PDFName.of('D')));
      const map = { Dissolve: 'fade', Fade: 'fade', Push: 'push', Cover: 'push', Uncover: 'push', Wipe: 'fade', Split: 'fade', Blinds: 'fade', Box: 'fade', Glitter: 'fade', Fly: 'push' };
      if (map[s]) info.transition = { type: map[s], duration: d ?? 0.5 };
    }
    const annots = L(page.node.get(PDFName.of('Annots')));
    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i);
        const dict = L(ref);
        if (!(dict instanceof PDFDict)) continue;
        const sub = str(dict.get(PDFName.of('Subtype')));
        if (sub !== 'Link' && sub !== 'Widget') continue;
        const rectArr = L(dict.get(PDFName.of('Rect')));
        if (!(rectArr instanceof PDFArray)) continue;
        const rect = rectArr.asArray().map(num);
        if (rect.some((v) => v == null)) continue;
        const F = num(dict.get(PDFName.of('F'))) || 0;
        const id = ref instanceof PDFRef ? refId(ref) : null;
        const name = sub === 'Widget' ? fieldName(dict) : null;
        if (name && id) {
          if (!byField.has(name)) byField.set(name, []);
          byField.get(name).push(id);
        }

        let actions = [];
        actions.push(...parseAction(dict.get(PDFName.of('A'))));
        const AA = get(dict, 'AA');
        if (AA instanceof PDFDict) {
          const up = parseAction(AA.get(PDFName.of('U')));
          actions.push(...(up.length ? up : parseAction(AA.get(PDFName.of('D')))));
        }
        if (!actions.length && sub === 'Link') {
          const p = resolveDest(dict.get(PDFName.of('Dest')));
          if (p != null) actions.push({ type: 'goto', page: p });
        }
        for (const a of actions) {
          if (a.type === 'unsupported') { unsupported.add(a.s); pr.unsupported.add(a.s); }
          if (a.type === 'broken') pr.broken.push({ name, rect, what: a.what });
        }
        actions = actions.filter((a) => a.type !== 'unsupported' && a.type !== 'broken');
        const isPush = sub === 'Widget' && ((num(dict.get(PDFName.of('Ff'))) ?? num(get(get(dict, 'Parent'), 'Ff')) ?? 0) & 65536) !== 0;
        if (!actions.length && isPush) pr.noAction.push({ id, name, rect });

        const hidden = (F & 2) !== 0 || (F & 32) !== 0;
        if (sub === 'Widget' && id) info.toggleable.push({ id, name, hidden });
        if (actions.length) info.hotspots.push({ id, name, kind: sub, rect, actions });
      }
    }
    result.pages[pi] = info;
  });

  // Resolve field names in visibility actions to annotation ids.
  const idsForField = (f) => {
    const out = [];
    for (const [n, ids] of byField) if (n === f || n.startsWith(f + '.')) out.push(...ids);
    return out;
  };
  let buttons = 0;
  for (const p of result.pages) {
    buttons += p.hotspots.length;
    for (const h of p.hotspots) {
      for (const a of h.actions) {
        if (a.type !== 'visibility') continue;
        const ids = new Set(a.ids || []);
        for (const f of a.fields || []) for (const id of idsForField(f)) ids.add(id);
        a.ids = [...ids];
        delete a.fields;
      }
    }
  }
  result.buttonCount = buttons;
  result.unsupported = [...unsupported];
  result.fileSize = bytes.length ?? bytes.byteLength;
  result.issues = buildIssues(result, raw);
  return result;
}

// ------------------------------------------------------------------ problem report
// iPad landscape viewport (CSS px) used to judge tap-target sizes
const IPAD = { w: 1180, h: 820 };
const MIN_TAP = 30; // px on screen; Apple recommends 44

function addIssue(list, severity, code, title, advice) {
  let g = list.find((x) => x.code === code);
  if (!g) { g = { severity, code, title, advice, items: [] }; list.push(g); }
  return (page, text) => g.items.push({ page, text });
}

export function buildIssues(r, raw) {
  const issues = [];
  const P = (i) => i + 1;
  const targetedIds = new Set();
  for (const p of r.pages) for (const h of p.hotspots) for (const a of h.actions) if (a.type === 'visibility') a.ids.forEach((id) => targetedIds.add(id));

  const broken = addIssue(issues, 'error', 'broken', 'Butoane care duc spre o pagină inexistentă',
    'În InDesign, verifică acțiunea butonului (Window → Interactive → Buttons and Forms) și refă legătura către pagina corectă.');
  const noTarget = addIssue(issues, 'error', 'vis-target', 'Show/Hide către butoane care nu există',
    'Butonul încearcă să arate sau să ascundă un element șters sau redenumit. Refă acțiunea Show/Hide în InDesign.');
  const unsup = addIssue(issues, 'warning', 'unsupported', 'Acțiuni care nu pot rula pe iPad',
    'Video, sunet, formulare sau JavaScript propriu nu sunt suportate. Înlocuiește-le cu un buton „Go To URL” sau cu o pagină separată.');
  const noAction = addIssue(issues, 'warning', 'no-action', 'Butoane fără nicio acțiune',
    'Butonul apare, dar nu face nimic la atingere. Adaugă o acțiune sau transformă-l înapoi în obiect simplu.');
  const self = addIssue(issues, 'info', 'self-link', 'Butoane care trimit pe aceeași pagină',
    'De obicei e fila activă dintr-un meniu și e în regulă. Dacă nu e cazul, verifică pagina destinație (greșeală tipică după duplicarea paginilor).');
  const overlap = addIssue(issues, 'warning', 'overlap', 'Butoane suprapuse cu acțiuni diferite',
    'La atingere câștigă butonul de deasupra. Mută sau micșorează unul dintre ele.');
  const small = addIssue(issues, 'warning', 'small', 'Butoane prea mici pentru deget',
    `Pe iPad apar sub ${MIN_TAP}px. Mărește zona butonului (poate fi transparentă) la cel puțin 1 cm.`);
  const fonts = addIssue(issues, 'warning', 'fonts', 'Fonturi neîncorporate',
    'iPad-ul le înlocuiește cu alt font. La export bifează „Embed fonts” sau transformă textul în contur.');
  const sizes = addIssue(issues, 'warning', 'sizes', 'Pagini cu dimensiuni diferite', 'Prezentarea va avea margini negre diferite de la o pagină la alta.');
  const unreachable = addIssue(issues, 'info', 'unreachable', 'Pagini la care nu duce niciun buton',
    'Se pot vedea doar prin glisare sau din meniul de pagini. E în regulă dacă e intenționat.');
  const deadEnd = addIssue(issues, 'info', 'dead-end', 'Pagini fără niciun buton', 'Prezentatorul poate ieși de pe ele doar prin glisare sau din meniu.');
  const external = addIssue(issues, 'info', 'external', 'Linkuri externe (necesită internet)', 'Pe iPad offline aceste linkuri nu se vor deschide.');
  const big = addIssue(issues, 'warning', 'big', 'Fișier mare', 'Peste 20 MB se încarcă greu pe iPad. Exportă cu imagini la 150–200 ppi.');

  const [w0, h0] = [r.pages[0]?.width, r.pages[0]?.height];
  const fontPages = new Map();
  const domains = new Map();
  r.pages.forEach((p, i) => {
    const pr = raw[i] || { broken: [], unsupported: new Set(), noAction: [], fonts: [] };
    for (const b of pr.broken) broken(P(i), `${b.name || 'Link'}: ${b.what}`);
    for (const s of pr.unsupported) unsup(P(i), s);
    for (const b of pr.noAction) if (!targetedIds.has(b.id)) noAction(P(i), b.name || 'buton fără nume');
    for (const f of pr.fonts) { if (!fontPages.has(f)) fontPages.set(f, []); fontPages.get(f).push(P(i)); }
    if (Math.abs(p.width - w0) > 1 || Math.abs(p.height - h0) > 1) sizes(P(i), `${Math.round(p.width)}×${Math.round(p.height)} pt (prima pagină: ${Math.round(w0)}×${Math.round(h0)})`);

    const scale = Math.min(IPAD.w / p.width, IPAD.h / p.height);
    const box = (rc) => ({ x1: Math.min(rc[0], rc[2]), y1: Math.min(rc[1], rc[3]), x2: Math.max(rc[0], rc[2]), y2: Math.max(rc[1], rc[3]) });
    const sig = (h) => JSON.stringify(h.actions);
    p.hotspots.forEach((h, k) => {
      const b = box(h.rect);
      const label = h.name || (h.kind === 'Link' ? 'Link' : 'buton');
      if (Math.min(b.x2 - b.x1, b.y2 - b.y1) * scale < MIN_TAP) small(P(i), `${label} (${Math.round((b.x2 - b.x1) * scale)}×${Math.round((b.y2 - b.y1) * scale)} px)`);
      for (const a of h.actions) {
        if (a.type === 'goto' && a.page === i) self(P(i), label);
        if (a.type === 'visibility' && !a.ids.length) noTarget(P(i), label);
        if (a.type === 'uri') {
          let d = a.url; try { d = new URL(a.url).hostname; } catch {}
          domains.set(d, (domains.get(d) || 0) + 1);
        }
      }
      for (let m = k + 1; m < p.hotspots.length; m++) {
        const o = p.hotspots[m];
        if (sig(o) === sig(h)) continue;
        const c = box(o.rect);
        const iw = Math.min(b.x2, c.x2) - Math.max(b.x1, c.x1), ih = Math.min(b.y2, c.y2) - Math.max(b.y1, c.y1);
        if (iw <= 0 || ih <= 0) continue;
        const smaller = Math.min((b.x2 - b.x1) * (b.y2 - b.y1), (c.x2 - c.x1) * (c.y2 - c.y1));
        if (iw * ih > 0.5 * smaller) overlap(P(i), `${label} și ${o.name || 'alt buton'}`);
      }
    });
  });
  for (const [f, pages] of fontPages) fonts(pages[0], `${f} (paginile ${compactPages(pages)})`);
  for (const [d, n] of domains) external(null, `${d}: ${n} ${n === 1 ? 'link' : 'linkuri'}`);
  if (r.fileSize > 20 * 1024 * 1024) big(null, `${(r.fileSize / 1048576).toFixed(1)} MB`);

  // reachability from page 1 through buttons
  const nav = (i) => {
    const out = new Set();
    for (const h of r.pages[i].hotspots) for (const a of h.actions) {
      if (a.type === 'goto') out.add(a.page);
      if (a.type === 'named') out.add({ NextPage: i + 1, PrevPage: i - 1, FirstPage: 0, LastPage: r.pageCount - 1 }[a.name]);
    }
    return [...out].filter((x) => x != null && x >= 0 && x < r.pageCount);
  };
  const seen = new Set([0]), queue = [0];
  while (queue.length) for (const n of nav(queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  const unr = [], dead = [];
  for (let i = 0; i < r.pageCount; i++) {
    if (!seen.has(i)) unr.push(P(i));
    if (!r.pages[i].hotspots.length) dead.push(P(i));
  }
  if (unr.length) unreachable(null, `paginile ${compactPages(unr)}`);
  if (dead.length) deadEnd(null, `paginile ${compactPages(dead)}`);

  const order = { error: 0, warning: 1, info: 2 };
  return issues.filter((g) => g.items.length).sort((a, b) => order[a.severity] - order[b.severity]);
}

export function compactPages(list) {
  const s = [...new Set(list)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(', ');
}

// ------------------------------------------------------------------ language variants
// Compares a translated version against the reference (e.g. DE): same pages,
// same buttons in the same places, leading to the same pages.
export function compareVariants(ref, other, refLabel = 'referință') {
  const issues = [];
  const pc = addIssue(issues, 'error', 'cmp-pages', `Număr de pagini diferit față de ${refLabel}`, 'Variantele trebuie să aibă aceleași pagini, în aceeași ordine.');
  const target = addIssue(issues, 'error', 'cmp-target', `Butoane care duc în altă parte decât în ${refLabel}`, 'Probabil o legătură greșită după traducere. Verifică butonul în InDesign.');
  const missing = addIssue(issues, 'warning', 'cmp-missing', `Butoane care lipsesc față de ${refLabel}`, 'Butonul există în referință, dar nu și aici (sau a fost mutat mult).');
  const extra = addIssue(issues, 'warning', 'cmp-extra', `Butoane în plus față de ${refLabel}`, 'Verifică dacă butonul trebuie să existe.');
  const urls = addIssue(issues, 'info', 'cmp-url', `Linkuri externe diferite față de ${refLabel}`, 'Normal dacă linkurile sunt localizate (de ex. pagini în franceză). Verifică doar că sunt cele corecte.');
  if (ref.pageCount !== other.pageCount) pc(null, `${refLabel}: ${ref.pageCount} pagini, aici: ${other.pageCount}`);
  const n = Math.min(ref.pageCount, other.pageCount);
  const dest = (h) => h.actions.map((a) => a.type === 'goto' ? `p${a.page + 1}` : a.type === 'named' ? a.name : a.type === 'uri' ? 'url' : a.type).join('+');
  const center = (h, p) => [((h.rect[0] + h.rect[2]) / 2) / p.width, ((h.rect[1] + h.rect[3]) / 2) / p.height];
  for (let i = 0; i < n; i++) {
    const pa = ref.pages[i], pb = other.pages[i];
    const used = new Set();
    for (const ha of pa.hotspots) {
      const [ax, ay] = center(ha, pa);
      let best = -1, bd = 0.04;
      pb.hotspots.forEach((hb, k) => {
        if (used.has(k)) return;
        const [bx, by] = center(hb, pb);
        const d = Math.hypot(ax - bx, ay - by);
        if (d < bd) { bd = d; best = k; }
      });
      if (best < 0) { missing(i + 1, `${ha.name || 'buton'} → ${dest(ha)}`); continue; }
      used.add(best);
      const hb = pb.hotspots[best];
      const da = dest(ha), db = dest(hb);
      if (da !== db) target(i + 1, `${hb.name || ha.name || 'buton'}: în ${refLabel} → ${da}, aici → ${db}`);
      const ua = ha.actions.find((a) => a.type === 'uri')?.url, ub = hb.actions.find((a) => a.type === 'uri')?.url;
      if (ua && ub && ua !== ub) urls(i + 1, `${ub} (în ${refLabel}: ${ua})`);
    }
    pb.hotspots.forEach((hb, k) => { if (!used.has(k)) extra(i + 1, `${hb.name || 'buton'} → ${dest(hb)}`); });
  }
  const order = { error: 0, warning: 1, info: 2 };
  return issues.filter((g) => g.items.length).sort((a, b) => order[a.severity] - order[b.severity]);
}
