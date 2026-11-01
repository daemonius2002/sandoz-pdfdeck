import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
import { t, lang, locale, applyI18n, mountSwitches, eventLabel, issueText, itemText, detailText, wireEyes, setPasswordVisible } from '/i18n.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ROLES = ['viewer', 'editor', 'admin'];
const atLeast = (role) => me && ROLES.indexOf(me.role) >= ROLES.indexOf(role);
let me = null, siteName = 'SANDOZ PRESENTING DECK', currentTab = 'decks';
let decks = [];

function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.method && opts.method !== 'GET') headers['X-PDFDeck'] = '1';
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent('/admin' + location.hash); throw new Error('auth'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && data.error === 'password_change') { location.hash = 'account'; throw new Error(data.message); }
  if (!res.ok) throw new Error(data.error || t('common.error'));
  return data;
}

// Password rule (same as the server): 8+ characters, lowercase, capital, special character
const PW_RULES = [
  ['pw.len', (p) => p.length >= 8], ['pw.lower', (p) => /[a-z]/.test(p)],
  ['pw.upper', (p) => /[A-Z]/.test(p)], ['pw.special', (p) => /[^A-Za-z0-9]/.test(p)],
];
const pwOk = (p) => PW_RULES.every(([, test]) => test(p));
// Live checklist under a password field; `extra` adds rules such as "typed twice the same".
function pwChecklist(input, box, extra = []) {
  const draw = () => {
    const p = input.value;
    const rules = [...PW_RULES.map(([k, test]) => [k, test(p)]), ...extra.map(([k, test]) => [k, test(p)])];
    box.innerHTML = `<li class="ttl">${t('pw.title')}</li>` + rules.map(([k, ok]) => `<li class="${ok ? 'ok' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span> ${t(k)}</li>`).join('');
  };
  input.addEventListener('input', draw);
  window.addEventListener('langchange', draw);
  draw();
  return draw;
}

function genPassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789', special = '@#!$%&*';
  const all = lower + upper + digits + special;
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(lower), pick(upper), pick(special), pick(digits)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); } catch { prompt(t('common.copy'), text); }
}

// ================================================================== shell
applyI18n();
wireEyes();
mountSwitches($('switches'));
window.addEventListener('langchange', () => { renderHeader(); route(); });

function renderHeader() {
  $('site').textContent = siteName;
  document.title = `${siteName} — ${t('app.admin')}`;
  if (!me) return;
  $('me-name').textContent = me.name || me.username;
  $('me-role').textContent = t('role.' + me.role);
  $('me-role').className = 'role ' + me.role;
}

async function init() {
  const m = await fetch('/api/me').then((r) => r.json());
  if (!m.user) { location.href = '/login?next=/admin'; return; }
  me = m.user;
  siteName = m.siteName || siteName;
  renderHeader();
  document.querySelectorAll('#tabs a').forEach((a) => { a.hidden = a.dataset.min ? !atLeast(a.dataset.min) : false; });
  $('editor-tools').hidden = !atLeast('editor');
  route();
}
$('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; });

function route() {
  if (!me) return;
  let tab = location.hash.slice(1) || 'decks';
  if (me.mustChangePassword) tab = 'account';
  const link = document.querySelector(`#tabs a[data-tab="${tab}"]`);
  if (!link || link.hidden) tab = 'decks';
  currentTab = tab;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.querySelectorAll('section[id^="t-"]').forEach((s) => { s.hidden = s.id !== 't-' + tab; });
  $('tabs').style.display = me.mustChangePassword ? 'none' : '';
  ({ decks: loadDecks, stats: loadStats, users: loadUsers, log: () => loadLog(true), settings: loadSettings, backup: loadBackups, account: loadAccount })[tab]?.();
}
window.addEventListener('hashchange', route);

// ================================================================== presentations
const PRESENTER_UI = [
  ['swipe', 'checkbox'], ['tapZones', 'checkbox'], ['resetOnPageEnter', 'checkbox'], ['pageIndicator', 'checkbox'],
  ['transition', 'select', ['slide', 'fade', 'none']], ['background', 'color'], ['publicLink', 'checkbox'],
];
const presenterControls = (values, attr) => PRESENTER_UI.map(([k, type, opts]) => type === 'checkbox'
  ? `<label><input type="checkbox" ${attr}="${k}" ${values[k] ? 'checked' : ''}> ${t('ps.' + k)}</label>`
  : type === 'select'
    ? `<label>${t('ps.' + k)} <select ${attr}="${k}">${opts.map((v) => `<option value="${v}" ${values[k] === v ? 'selected' : ''}>${t('ps.' + v)}</option>`).join('')}</select></label>`
    : `<label><input type="color" ${attr}="${k}" value="${esc(values[k])}"> ${t('ps.' + k)}</label>`).join('');

async function loadDecks() {
  try { decks = await api('/api/decks'); renderDecks(); } catch (e) { if (e.message !== 'auth') $('list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function renderDecks() {
  const list = $('list');
  const canEdit = atLeast('editor');
  if (!decks.length) { list.innerHTML = `<div class="empty">${t(canEdit ? 'decks.emptyEditor' : 'decks.empty')}</div>`; return; }
  const origin = decks[0].url.replace(/\/p\/[^/]+$/, '');
  const catalogs = [...new Set(decks.map((d) => d.catalog))].sort((a, b) => a.localeCompare(b));
  $('up-catalogs').innerHTML = catalogs.map((c) => `<option value="${esc(c)}">`).join('');
  const order = { DE: 0, FR: 1, IT: 2, EN: 3, RO: 4, XX: 5 };
  list.innerHTML = catalogs.map((cat) => `<h2 class="cat">${esc(cat)}</h2>` + decks.filter((d) => d.catalog === cat)
    .sort((a, b) => (order[a.lang] ?? 9) - (order[b.lang] ?? 9)).map((d) => {
      const errs = (d.issues || []).filter((g) => g.severity === 'error').reduce((n, g) => n + g.count, 0);
      const warns = (d.issues || []).filter((g) => g.severity === 'warning').reduce((n, g) => n + g.count, 0);
      const meta = t('deck.meta', { pages: d.pages, buttons: d.buttonCount, size: fmtSize(d.size), version: d.version, date: fmtDate(d.updatedAt), views: d.stats?.views || 0 })
        + (d.stats?.lastViewedAt ? t('deck.lastView', { date: fmtDate(d.stats.lastViewedAt), who: esc(d.stats.lastViewedBy === 'link public' ? t('deck.public') : d.stats.lastViewedBy) }) : '');
      return `<article class="deck" data-id="${d.id}">
      <a class="thumb" href="${esc(d.url)}" target="_blank" style="${d.hasThumb ? `background-image:url('/thumbs/${d.id}.png?v=${d.thumbVersion}')` : ''}" aria-label="${t('deck.present')}"></a>
      <div style="min-width:0">
        <h3><span class="lang">${esc(d.lang)}</span>${canEdit ? `<input type="text" data-f="title" value="${esc(d.title)}" aria-label="${t('deck.title')}">` : `<span class="t">${esc(d.title)}</span>`}
          ${d.reference ? `<span class="chip">${t('deck.reference')}</span>` : ''}${d.settings?.publicLink ? `<span class="chip pub">${t('deck.publicLink')}</span>` : ''}</h3>
        <div class="meta">${meta}
          ${errs ? `<br><span class="e">${errs === 1 ? t('deck.error1') : t('deck.errors', { n: errs })}</span>` : ''}
          ${warns ? `<br><span class="w">${t('deck.warnings', { n: warns })}</span>` : ''}
          ${!d.buttonCount ? `<br><span class="w">${t('deck.noButtons')}</span>` : ''}</div>
        <div class="url"><span class="base">${esc(origin)}/p/</span>${canEdit ? `<input type="text" data-f="slug" value="${esc(d.slug)}" aria-label="${t('deck.address')}">` : `<b>${esc(d.slug)}</b>`}</div>
        <div class="row">
          <a class="btn primary" href="${esc(d.url)}" target="_blank">${t('deck.play')}</a>
          <button data-a="report">${t('deck.report')}</button>
          <button data-a="copy">${t('deck.copy')}</button>
          <button data-a="qr">${t('deck.qr')}</button>
          ${canEdit ? `<button data-a="replace">${t('deck.replace')}</button><button data-a="delete" class="danger">${t('common.delete')}</button>` : ''}
        </div>
        ${canEdit ? `<details><summary>${t('deck.settings')}</summary>
          <div class="settings">
            <label>${t('deck.catalog')} <input type="text" data-f="catalog" value="${esc(d.catalog)}" list="up-catalogs"></label>
            <label>${t('deck.lang')} <select data-f="lang">${['DE', 'FR', 'IT', 'EN', 'RO', 'XX'].map((l) => `<option value="${l}" ${d.lang === l ? 'selected' : ''}>${l === 'XX' ? t('lang.XX') : l}</option>`).join('')}</select></label>
            <label><input type="checkbox" data-f="reference" ${d.reference ? 'checked' : ''}> ${t('deck.isReference')}</label>
            ${presenterControls(d.settings || {}, 'data-s')}
          </div></details>` : ''}
      </div></article>`;
    }).join('')).join('');
}

const deckOf = (el) => decks.find((d) => d.id === el.closest('.deck')?.dataset.id);
$('list').addEventListener('change', async (e) => {
  const d = deckOf(e.target); if (!d) return;
  const el = e.target;
  let body;
  if (el.dataset.f) body = { [el.dataset.f]: el.type === 'checkbox' ? el.checked : el.value };
  else if (el.dataset.s) body = { settings: { [el.dataset.s]: el.type === 'checkbox' ? el.checked : el.value } };
  else return;
  try {
    const upd = await api(`/api/decks/${d.id}`, { method: 'PATCH', json: body });
    Object.assign(d, upd);
    if (el.dataset.f === 'reference' || el.dataset.f === 'catalog') await loadDecks();
    else if (el.dataset.f || el.dataset.s === 'publicLink') renderDecks();
    toast(t('common.saved'));
  } catch (err) { if (err.message !== 'auth') { toast(err.message); renderDecks(); } }
});
$('list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur(); });
$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const d = deckOf(b);
  switch (b.dataset.a) {
    case 'report': openReport(d); break;
    case 'copy': copy(d.url, t('deck.copied')); break;
    case 'qr':
      $('qr-title').textContent = d.title;
      $('qr-img').src = `/api/decks/${d.id}/qr.svg?s=${encodeURIComponent(d.slug)}`;
      $('qr').showModal();
      break;
    case 'replace': {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/pdf,.pdf' });
      inp.onchange = () => inp.files[0] && uploadFile(inp.files[0], d);
      inp.click();
      break;
    }
    case 'delete':
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t('common.confirmDelete'); setTimeout(() => { b.dataset.confirm = ''; b.textContent = t('common.delete'); }, 5000); return; }
      try { await api(`/api/decks/${d.id}`, { method: 'DELETE' }); toast(t('deck.deleted')); loadDecks(); } catch (err) { toast(err.message); }
      break;
  }
});

// upload
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => [...e.dataTransfer.files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf').forEach((f) => uploadFile(f)));
$('file').addEventListener('change', (e) => { [...e.target.files].forEach((f) => uploadFile(f)); e.target.value = ''; });

function uploadFile(file, replacing) {
  const row = document.createElement('div');
  row.className = 'up';
  row.innerHTML = `${t(replacing ? 'up.replacing' : 'up.uploading')} <b>${esc(file.name)}</b> <span class="st"></span><div class="bar"><i></i></div>`;
  $('uploads').prepend(row);
  const fd = new FormData();
  fd.append('pdf', file);
  if (!replacing) { fd.append('catalog', $('up-catalog').value.trim()); if ($('up-lang').value) fd.append('lang', $('up-lang').value); }
  const xhr = new XMLHttpRequest();
  xhr.open(replacing ? 'PUT' : 'POST', replacing ? `/api/decks/${replacing.id}/file` : '/api/decks');
  xhr.setRequestHeader('X-PDFDeck', '1');
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    row.querySelector('i').style.width = (e.loaded / e.total * 100) + '%';
    if (e.loaded === e.total) row.querySelector('.st').textContent = t('up.analyzing');
  };
  xhr.onload = async () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status === 401) { location.href = '/login?next=/admin'; return; }
    if (xhr.status >= 300) { row.classList.add('err'); row.querySelector('.st').textContent = '— ' + (data.error || t('common.error')); return; }
    row.querySelector('.st').textContent = t('up.thumb');
    await makeThumb(file, data.id).catch(() => {});
    row.remove();
    await loadDecks();
    toast(t(replacing ? 'up.replaced' : 'up.done'));
    const fresh = decks.find((x) => x.id === data.id);
    if (fresh) openReport(fresh);
  };
  xhr.onerror = () => { row.classList.add('err'); row.querySelector('.st').textContent = t('up.cut'); };
  xhr.send(fd);
}

// Page 1 rendered into a square: used in this list and as the iPad home-screen icon.
async function makeThumb(file, id) {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const S = 512;
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(S / vp1.width, S / vp1.height) });
  const pc = document.createElement('canvas');
  pc.width = Math.ceil(vp.width); pc.height = Math.ceil(vp.height);
  await page.render({ canvas: pc, viewport: vp }).promise;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(24px) brightness(.7)';
  const cover = Math.max(S / pc.width, S / pc.height);
  ctx.drawImage(pc, (S - pc.width * cover) / 2, (S - pc.height * cover) / 2, pc.width * cover, pc.height * cover);
  ctx.filter = 'none';
  ctx.drawImage(pc, (S - pc.width) / 2, (S - pc.height) / 2);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch(`/api/decks/${id}/thumb`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-PDFDeck': '1' }, body: blob });
  task.destroy().catch(() => {});
}

// report
const countOf = (issues, sev) => (issues || []).filter((g) => g.severity === sev).reduce((n, g) => n + g.items.length, 0);
function groupsHtml(list, url, refLang) {
  return list.map((g) => {
    const { title, advice } = issueText(g, refLang);
    return `<details class="issue ${g.severity}" ${g.severity === 'error' ? 'open' : ''}>
    <summary><span class="sev">${t('sev.' + g.severity)}</span><span class="it">${esc(title)}</span><span class="n">${g.items.length}</span></summary>
    <p class="advice">${esc(advice)}</p>
    <ul>${g.items.slice(0, 200).map((it) => `<li>${it.page ? `<a class="pg" href="${esc(url)}#${it.page}" target="_blank">${t('rep.page', { n: it.page })}</a>` : ''}<span>${esc(itemText(it.text))}</span></li>`).join('')}
    ${g.items.length > 200 ? `<li>${t('rep.more', { n: g.items.length - 200 })}</li>` : ''}</ul></details>`;
  }).join('');
}
let reportDeck = null;
async function openReport(d) {
  reportDeck = d;
  const dlg = $('report'), body = $('report-body');
  body.innerHTML = `<p>${t('common.loading')}</p>`;
  if (!dlg.open) dlg.showModal();
  try {
    const r = await api(`/api/decks/${d.id}/report`);
    const e = countOf(r.issues, 'error'), w = countOf(r.issues, 'warning'), i = countOf(r.issues, 'info');
    const verdict = t(e ? 'rep.verdictError' : w ? 'rep.verdictWarn' : 'rep.verdictOk');
    let cmp = '';
    if (r.comparison) {
      cmp = `<h3>${t('rep.compare', { lang: esc(r.comparison.lang) })}</h3>` + (r.comparison.issues.length
        ? groupsHtml(r.comparison.issues, d.url, r.comparison.lang)
        : `<p class="okline">${t('rep.compareOk')}</p>`);
    }
    body.innerHTML = `
      <div class="rhead"><div><div class="eyebrow">${esc(d.catalog)} · ${esc(d.lang)}</div><h2>${esc(d.title)}</h2>
        <div class="meta">${t('rep.meta', { pages: r.pageCount, buttons: r.buttonCount })}</div></div>
        <a class="btn primary" href="${esc(d.url)}" target="_blank">${t('deck.play')}</a></div>
      <div class="tiles" style="margin-top:14px"><div class="tile ${e ? 'err' : 'ok'}"><b>${e}</b>${t('rep.errors')}</div><div class="tile ${w ? 'warnt' : 'ok'}"><b>${w}</b>${t('rep.warnings')}</div><div class="tile"><b>${i}</b>${t('rep.infos')}</div></div>
      <p class="verdict">${verdict}</p>${cmp}
      <h3>${t('rep.check')}</h3>${r.issues.length ? groupsHtml(r.issues, d.url) : `<p class="okline">${t('rep.none')}</p>`}`;
  } catch (err) { if (err.message !== 'auth') body.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
$('report-close').addEventListener('click', () => { reportDeck = null; $('report').close(); });
window.addEventListener('langchange', () => { if ($('report').open && reportDeck) openReport(reportDeck); });

// ================================================================== statistics
async function loadStats() {
  try {
    const [s, list] = await Promise.all([api('/api/stats'), api('/api/decks')]);
    decks = list;
    $('st-tiles').innerHTML = `
      <div class="tile"><b>${s.views30}</b>${t('st.views')}</div>
      <div class="tile"><b>${s.logins30}</b>${t('st.logins')}</div>
      <div class="tile ${s.failed30 ? 'warnt' : ''}"><b>${s.failed30}</b>${t('st.failed')}</div>
      <div class="tile"><b>${s.users}</b>${t('st.users')}</div>
      <div class="tile"><b>${s.activeSessions}</b>${t('st.sessions')}</div>`;
    const who = (x) => (!x || x === 'link public' ? t('st.public') : x);
    $('st-decks').innerHTML = decks.length ? `<tr><th>${t('st.col.deck')}</th><th>${t('st.col.lang')}</th><th class="num">${t('st.col.30')}</th><th class="num">${t('st.col.total')}</th><th>${t('st.col.last')}</th></tr>` +
      [...decks].sort((a, b) => (s.perDeck[b.slug] || 0) - (s.perDeck[a.slug] || 0)).map((d) => `<tr>
        <td>${esc(d.title)}</td><td>${esc(d.lang)}</td><td class="num">${s.perDeck[d.slug] || 0}</td><td class="num">${d.stats?.views || 0}</td>
        <td class="nowrap">${d.stats?.lastViewedAt ? `${fmtDate(d.stats.lastViewedAt)} · ${esc(who(d.stats.lastViewedBy))}` : '—'}</td></tr>`).join('')
      : `<tr><td class="muted">${t('st.noDecks')}</td></tr>`;
    $('st-recent').innerHTML = s.recentViews.length ? `<tr><th>${t('st.col.when')}</th><th>${t('st.col.who')}</th><th>${t('st.col.deck')}</th><th>${t('st.col.ip')}</th></tr>` + s.recentViews.map((v) => `<tr>
        <td class="nowrap">${fmtDate(v.at)}</td><td>${esc(v.user?.username || t('st.public'))}</td><td>${esc(v.target)}</td><td class="nowrap muted">${esc(v.ip || '')}</td></tr>`).join('')
      : `<tr><td class="muted">${t('st.noViews')}</td></tr>`;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}

// ================================================================== users
let groupData = { groups: [], catalogs: [], langs: [] }, userList = [];
async function loadUsers() {
  try {
    const [users, sessions, g] = await Promise.all([api('/api/users'), api('/api/sessions'), api('/api/groups')]);
    groupData = g; userList = users;
    renderGroups();
    $('users').innerHTML = `<tr><th>${t('us.col.user')}</th><th>${t('us.col.name')}</th><th>${t('us.col.role')}</th><th>${t('us.col.access')}</th><th>${t('us.col.status')}</th><th>${t('us.col.lastLogin')}</th><th class="num">${t('us.col.sessions')}</th><th></th></tr>` + users.map((u) => {
      const self = u.id === me.id;
      const access = u.role !== 'viewer' ? `<span class="muted small">${t('us.allByRole')}</span>`
        : u.allDecks !== false ? `<span class="small">${t('us.allDecks')}</span>`
        : `<div class="pillset">${(u.groups || []).map((id) => groupData.groups.find((x) => x.id === id)).filter(Boolean).map((x) => `<span>${esc(x.name)}</span>`).join('') || `<span>${t('us.noGroup')}</span>`}</div>`;
      return `<tr data-uid="${u.id}" data-username="${esc(u.username)}">
        <td><b>${esc(u.username)}</b>${self ? ` <span class="muted small">${t('us.you')}</span>` : ''}${u.email ? `<div class="small muted">${esc(u.email)}</div>` : ''}</td>
        <td><input type="text" data-u="name" value="${esc(u.name)}" style="width:150px"></td>
        <td><select data-u="role" ${self ? 'disabled' : ''}>${ROLES.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('role.' + r)}</option>`).join('')}</select></td>
        <td>${access}${u.role === 'viewer' ? ` <button class="ghost small" data-ua="access">${t('us.edit')}</button>` : ''}</td>
        <td>${u.disabled ? `<span class="status off">${t('us.disabled')}</span>` : u.mustChangePassword ? `<span class="status must">${t('us.mustChange')}</span>` : `<span class="status">${t('us.active')}</span>`}</td>
        <td class="nowrap">${fmtDate(u.lastLoginAt)}</td>
        <td class="num">${u.activeSessions}</td>
        <td><div class="uact">${self ? '' : `<button data-ua="reset">${t('us.reset')}</button>
          <button data-ua="${u.disabled ? 'enable' : 'disable'}">${t(u.disabled ? 'us.enable' : 'us.disable')}</button>
          <button data-ua="delete" class="danger">${t('common.delete')}</button>`}</div></td></tr>`;
    }).join('');
    $('sessions').innerHTML = sessions.length ? `<tr><th>${t('us.col.user')}</th><th>${t('us.col.device')}</th><th>${t('us.col.ip')}</th><th>${t('us.col.lastSeen')}</th><th>${t('us.col.expires')}</th><th></th></tr>` + sessions.map((s) => `<tr>
        <td><b>${esc(s.username || '?')}</b></td><td class="small">${esc(deviceName(s.ua))}</td><td class="nowrap muted">${esc(s.ip || '')}</td>
        <td class="nowrap">${fmtDate(s.lastSeen)}</td><td class="nowrap">${fmtDate(s.expiresAt)}</td>
        <td><button data-sid="${esc(s.id)}">${t('us.closeSession')}</button></td></tr>`).join('') : `<tr><td class="muted">${t('us.noSessions')}</td></tr>`;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
function deviceName(ua = '') {
  const dev = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : t('common.device');
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${dev} · ${br}` : dev;
}

const drawNewUserRules = pwChecklist($('nu-password'), $('nu-rules'));
$('nu-gen').addEventListener('click', () => { $('nu-password').value = genPassword(); $('nu-err').textContent = ''; drawNewUserRules(); });
// usernames keep their capital letters; accents and spaces are converted as the admin types
$('nu-username').addEventListener('input', (e) => {
  const v = e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.');
  if (v !== e.target.value) e.target.value = v;
});
function newUserProblem(username, pw) {
  if (!username) return t('us.err.noUser');
  if (username.length < 3) return t('us.err.short');
  if (!/^[A-Za-z0-9._-]+$/.test(username)) return t('us.err.chars');
  if (!pw) return t('us.err.noPw');
  if (!pwOk(pw)) return t('us.err.pwRules');
  return null;
}
$('nu-access').addEventListener('change', () => { $('nu-groups').hidden = $('nu-access').value !== 'groups'; });
$('nu').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('nu-err').textContent = '';
  const pw = $('nu-password').value;
  const problem = newUserProblem($('nu-username').value.trim(), pw);
  if (problem) { $('nu-err').textContent = problem; return; }
  try {
    const u = await api('/api/users', { method: 'POST', json: {
      username: $('nu-username').value.trim(), name: $('nu-name').value, email: $('nu-email').value,
      role: $('nu-role').value, password: pw, mustChangePassword: $('nu-must').checked,
      allDecks: $('nu-access').value === 'all',
      groups: [...$('nu-groups').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('nu-groups').hidden = true;
    $('nu').reset(); drawNewUserRules();
    showSecret(t('us.created', { u: u.username }), t('us.createdText'), u.username, pw);
    loadUsers();
  } catch (err) { if (err.message !== 'auth') $('nu-err').textContent = err.message; }
});

function showSecret(title, text, username, password) {
  const dlg = $('report'), body = $('report-body');
  reportDeck = null;
  body.innerHTML = `<h2 style="margin:0 0 8px">${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="grid2"><div class="field">${t('us.loginAddress')}<div class="secret">${esc(location.origin)}/login</div></div>
    <div class="field">${t('login.user')}<div class="secret">${esc(username)}</div></div>
    <div class="field">${t('login.password')}<div class="secret">${esc(password)}</div></div></div>
    <div class="row" style="margin-top:12px"><button class="primary" id="secret-copy" type="button">${t('us.copyCreds')}</button></div>`;
  if (!dlg.open) dlg.showModal();
  $('secret-copy').onclick = () => copy(t('us.credsText', { url: `${location.origin}/login`, u: username, p: password }), t('us.credsCopied'));
}

$('users').addEventListener('change', async (e) => {
  const tr = e.target.closest('tr[data-uid]'); if (!tr || !e.target.dataset.u) return;
  try { await api(`/api/users/${tr.dataset.uid}`, { method: 'PATCH', json: { [e.target.dataset.u]: e.target.value } }); toast(t('common.saved')); loadUsers(); }
  catch (err) { toast(err.message); loadUsers(); }
});
$('users').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-ua]'); if (!b) return;
  const tr = b.closest('tr'), id = tr.dataset.uid, username = tr.dataset.username;
  try {
    if (b.dataset.ua === 'access') { openAccess(userList.find((x) => x.id === id)); return; }
    if (b.dataset.ua === 'reset') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t('us.confirmReset'); return; }
      const pw = genPassword();
      await api(`/api/users/${id}`, { method: 'PATCH', json: { password: pw } });
      showSecret(t('us.resetTitle', { u: username }), t('us.resetText'), username, pw);
    } else if (b.dataset.ua === 'disable' || b.dataset.ua === 'enable') {
      const disable = b.dataset.ua === 'disable';
      await api(`/api/users/${id}`, { method: 'PATCH', json: { disabled: disable } });
      toast(t(disable ? 'us.disabledToast' : 'us.enabledToast'));
    } else if (b.dataset.ua === 'delete') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t('common.confirmDelete'); return; }
      await api(`/api/users/${id}`, { method: 'DELETE' });
      toast(t('us.deletedToast'));
    }
    loadUsers();
  } catch (err) { toast(err.message); loadUsers(); }
});
$('sessions').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-sid]'); if (!b) return;
  try { await api(`/api/sessions/${b.dataset.sid}`, { method: 'DELETE' }); toast(t('us.sessionClosed')); loadUsers(); } catch (err) { toast(err.message); }
});

// access groups
const checks = (name, items, selected = []) => items.map(([v, label]) => `<label><input type="checkbox" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
function renderGroups() {
  const { groups, catalogs, langs } = groupData;
  $('groups').innerHTML = groups.length ? `<tr><th>${t('gr.col.group')}</th><th>${t('gr.col.catalogs')}</th><th>${t('gr.col.langs')}</th><th class="num">${t('gr.col.decks')}</th><th>${t('gr.col.members')}</th><th></th></tr>` + groups.map((g) => `<tr data-gid="${g.id}">
      <td><input type="text" data-g="name" value="${esc(g.name)}" style="width:150px"></td>
      <td><div class="groupchecks">${checks('cat', catalogs.map((c) => [c, c]), g.catalogs)}</div>${!g.catalogs.length ? `<div class="small muted">${t('common.all')}</div>` : ''}</td>
      <td><div class="groupchecks">${checks('lang', langs.map((l) => [l, l]), g.langs)}</div>${!g.langs.length ? `<div class="small muted">${t('common.all')}</div>` : ''}</td>
      <td class="num">${g.decks}</td>
      <td class="small">${g.members.length ? g.members.map(esc).join(', ') : '<span class="muted">—</span>'}</td>
      <td><button class="danger" data-gdel>${t('common.delete')}</button></td></tr>`).join('')
    : `<tr><td class="muted">${t('gr.none')}</td></tr>`;
  $('ng-catalogs').innerHTML = catalogs.length ? checks('ngc', catalogs.map((c) => [c, c])) : `<span class="small muted">${t('gr.uploadFirst')}</span>`;
  $('ng-langs').innerHTML = checks('ngl', langs.filter((l) => l !== 'XX').map((l) => [l, l]));
  $('nu-groups').innerHTML = groups.length ? checks('nug', groups.map((g) => [g.id, g.name])) : `<span class="small muted">${t('gr.createFirst')}</span>`;
}
$('ng').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('ng-err').textContent = '';
  try {
    await api('/api/groups', { method: 'POST', json: {
      name: $('ng-name').value,
      catalogs: [...$('ng-catalogs').querySelectorAll('input:checked')].map((x) => x.value),
      langs: [...$('ng-langs').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('ng').reset(); toast(t('gr.created')); loadUsers();
  } catch (err) { if (err.message !== 'auth') $('ng-err').textContent = err.message; }
});
$('groups').addEventListener('change', async (e) => {
  const tr = e.target.closest('tr[data-gid]'); if (!tr) return;
  const body = e.target.dataset.g === 'name' ? { name: e.target.value }
    : { catalogs: [...tr.querySelectorAll('input[name=cat]:checked')].map((x) => x.value), langs: [...tr.querySelectorAll('input[name=lang]:checked')].map((x) => x.value) };
  try { await api(`/api/groups/${tr.dataset.gid}`, { method: 'PATCH', json: body }); toast(t('gr.saved')); loadUsers(); } catch (err) { toast(err.message); loadUsers(); }
});
$('groups').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-gdel]'); if (!b) return;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t('common.confirm'); return; }
  try { await api(`/api/groups/${b.closest('tr').dataset.gid}`, { method: 'DELETE' }); toast(t('gr.deleted')); loadUsers(); } catch (err) { toast(err.message); }
});

let accessUser = null;
function openAccess(u) {
  accessUser = u;
  $('ac-user').textContent = `${u.name} (${u.username})`;
  document.querySelector(`input[name=ac][value=${u.allDecks !== false ? 'all' : 'groups'}]`).checked = true;
  $('ac-groups').innerHTML = groupData.groups.length ? checks('acg', groupData.groups.map((g) => [g.id, g.name]), u.groups || []) : `<span class="small muted">${t('gr.noGroups')}</span>`;
  $('access').showModal();
}
$('ac-cancel').addEventListener('click', () => $('access').close());
$('ac-save').addEventListener('click', async () => {
  try {
    await api(`/api/users/${accessUser.id}`, { method: 'PATCH', json: {
      allDecks: document.querySelector('input[name=ac]:checked').value === 'all',
      groups: [...$('ac-groups').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('access').close(); toast(t('ac.saved')); loadUsers();
  } catch (err) { toast(err.message); }
});

// ================================================================== log
let logLimit = 200, logRows = [];
async function loadLog(reset) {
  if (reset) logLimit = 200;
  const q = new URLSearchParams({ limit: logLimit, type: $('lg-type').value, user: $('lg-user').value.trim(), q: $('lg-q').value.trim() });
  try {
    const r = await api('/api/logs?' + q);
    logRows = r.rows;
    $('log').innerHTML = logRows.length ? `<tr><th>${t('lg.col.when')}</th><th>${t('lg.col.event')}</th><th>${t('lg.col.user')}</th><th>${t('lg.col.target')}</th><th>${t('lg.col.detail')}</th><th>${t('lg.col.ip')}</th></tr>` + logRows.map((x) => `<tr class="${x.ok === false ? 'fail' : ''}">
        <td class="nowrap">${fmtDate(x.at)}</td><td class="nowrap">${esc(eventLabel(x.type))}</td><td>${esc(x.user?.username || '—')}</td>
        <td>${esc(x.target || '')}</td><td class="small">${esc(detailText(x.detail || ''))}</td><td class="nowrap muted small">${esc(x.ip || '')}</td></tr>`).join('')
      : `<tr><td class="muted">${t('lg.none')}</td></tr>`;
    $('lg-more').hidden = logRows.length < logLimit;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('lg-go').addEventListener('click', () => loadLog(true));
['lg-user', 'lg-q'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLog(true); }));
$('lg-type').addEventListener('change', () => loadLog(true));
$('lg-more').addEventListener('click', () => { logLimit += 300; loadLog(false); });
$('lg-csv').addEventListener('click', () => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [t('lg.csvHead')]
    .concat(logRows.map((x) => [x.at, eventLabel(x.type), x.user?.username, x.target, detailText(x.detail), x.ip, t(x.ok === false ? 'lg.no' : 'lg.yes')].map(cell).join(',')));
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: `${lang === 'ro' ? 'jurnal' : 'activity-log'}-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ================================================================== settings
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    $('s-siteName').value = s.siteName; $('s-access').value = s.access; $('s-logViews').checked = s.logViews;
    $('s-sessionDays').value = s.security.sessionDays; $('s-maxAttempts').value = s.security.maxAttempts; $('s-lockMinutes').value = s.security.lockMinutes;
    $('s-presenter').innerHTML = presenterControls(s.presenter, 'data-p');
    const n = await api('/api/notify');
    $('n-status').className = 'banner ' + (n.configured ? 'ok' : 'warn');
    $('n-status').innerHTML = n.configured ? esc(t('se.smtpOk', { host: n.host, from: n.from })) : t('se.smtpMissing');
    $('n-recipients').value = (n.settings.recipients || []).join('\n');
    $('n-events').innerHTML = Object.keys(n.events).map((k) => `<label class="check"><input type="checkbox" data-ev="${k}" ${n.settings.events[k] ? 'checked' : ''}> ${esc(t('ev.' + k))}</label>`).join('');
    $('n-test').disabled = !n.configured;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('n-test').addEventListener('click', async () => {
  $('n-test-msg').textContent = t('se.sending');
  try {
    await saveSettings(true);
    const r = await api('/api/notify/test', { method: 'POST', json: {} });
    $('n-test-msg').textContent = t('se.sent', { to: r.to.join(', ') });
  } catch (err) { $('n-test-msg').textContent = err.message; }
});
$('sf').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(false).catch(() => {}); });
async function saveSettings(quiet) {
  $('s-err').textContent = '';
  const recipients = $('n-recipients').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const bad = recipients.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (bad.length) { $('s-err').textContent = t('se.badEmail', { list: bad.join(', ') }); throw new Error('bad email'); }
  const events = {};
  $('n-events').querySelectorAll('[data-ev]').forEach((el) => { events[el.dataset.ev] = el.checked; });
  const presenter = {};
  $('s-presenter').querySelectorAll('[data-p]').forEach((el) => { presenter[el.dataset.p] = el.type === 'checkbox' ? el.checked : el.value; });
  try {
    const s = await api('/api/settings', { method: 'PATCH', json: {
      siteName: $('s-siteName').value, access: $('s-access').value, logViews: $('s-logViews').checked,
      security: { sessionDays: $('s-sessionDays').value, maxAttempts: $('s-maxAttempts').value, lockMinutes: $('s-lockMinutes').value },
      presenter, notify: { recipients, events },
    } });
    siteName = s.siteName; renderHeader();
    if (!quiet) toast(t('se.saved'));
  } catch (err) { if (err.message !== 'auth') $('s-err').textContent = err.message; throw err; }
}

// ================================================================== backups
async function loadBackups() {
  try {
    const r = await api('/api/backups');
    $('b-auto').checked = r.settings.auto; $('b-keep').value = r.settings.keep;
    $('b-total').textContent = r.list.length ? t('bk.total', { n: r.list.length, size: fmtSize(r.totalBytes) }) : '';
    $('b-list').innerHTML = r.list.length ? `<tr><th>${t('bk.col.created')}</th><th>${t('bk.col.kind')}</th><th class="num">${t('bk.col.size')}</th><th></th></tr>` + r.list.map((b) => `<tr data-name="${esc(b.name)}">
        <td class="nowrap">${fmtDate(b.createdAt)}</td><td><span class="kind ${b.kind}">${t('bk.kind.' + b.kind)}</span></td>
        <td class="num">${fmtSize(b.size)}</td>
        <td class="nowrap"><a class="btn" href="/api/backups/${encodeURIComponent(b.name)}" download>${t('bk.download')}</a>
          <button data-b="restore">${t('bk.restore')}</button> <button data-b="delete" class="danger">${t('common.delete')}</button></td></tr>`).join('')
      : `<tr><td class="muted">${t('bk.none')}</td></tr>`;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('b-save').addEventListener('click', async () => {
  try { await api('/api/settings', { method: 'PATCH', json: { backup: { auto: $('b-auto').checked, keep: $('b-keep').value } } }); toast(t('common.saved')); }
  catch (err) { toast(err.message); }
});
$('b-now').addEventListener('click', async () => {
  const b = $('b-now'); b.disabled = true; b.textContent = t('bk.creating');
  try { const r = await api('/api/backups', { method: 'POST' }); toast(t('bk.created', { size: fmtSize(r.size) })); loadBackups(); }
  catch (err) { toast(err.message); }
  finally { b.disabled = false; b.textContent = t('bk.now'); }
});
$('b-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-b]'); if (!b) return;
  const name = b.closest('tr').dataset.name;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t(b.dataset.b === 'restore' ? 'bk.confirmRestore' : 'common.confirmDelete'); return; }
  if (b.dataset.b === 'delete') {
    try { await api(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }); toast(t('bk.deleted')); loadBackups(); } catch (err) { toast(err.message); }
  } else {
    b.disabled = true; b.textContent = t('bk.restoring');
    try { await api(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }); afterRestore(); }
    catch (err) { toast(err.message); loadBackups(); }
  }
});
$('r-file').addEventListener('change', () => { $('r-go').disabled = !$('r-file').files[0]; $('r-go').dataset.confirm = ''; $('r-go').textContent = t('bk.fromFileGo'); });
$('r-go').addEventListener('click', () => {
  const btn = $('r-go'), f = $('r-file').files[0]; if (!f) return;
  $('r-err').textContent = '';
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = t('bk.fromFileConfirm'); return; }
  btn.disabled = true; btn.textContent = t('bk.uploading', { p: 0 });
  const fd = new FormData(); fd.append('backup', f);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/restore'); xhr.setRequestHeader('X-PDFDeck', '1');
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) btn.textContent = t('bk.uploading', { p: Math.round(e.loaded / e.total * 100) }); };
  xhr.onload = () => {
    let d = {}; try { d = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status >= 300) { $('r-err').textContent = d.error || t('bk.failed'); btn.disabled = false; btn.dataset.confirm = ''; btn.textContent = t('bk.fromFileGo'); return; }
    afterRestore();
  };
  xhr.onerror = () => { $('r-err').textContent = t('bk.cut'); btn.disabled = false; };
  xhr.send(fd);
});
function afterRestore() {
  document.body.innerHTML = `<div class="login-page"><div class="login-card"><h1>${t('bk.doneTitle')}</h1><p>${t('bk.doneText')}</p></div></div>`;
  const wait = async () => { try { const r = await fetch('/api/me'); if (r.ok) { location.href = '/login'; return; } } catch {} setTimeout(wait, 2000); };
  setTimeout(wait, 4000);
}

// ================================================================== my account
const drawAccountRules = pwChecklist($('pw-new'), $('pw-rules'), [['pw.match', (p) => p.length > 0 && p === $('pw-new2').value]]);
$('pw-new2').addEventListener('input', () => drawAccountRules());
// an old error disappears as soon as the user edits the passwords again
['pw-cur', 'pw-new', 'pw-new2'].forEach((id) => $(id).addEventListener('input', () => { $('pw-err').textContent = ''; }));
['nu-username', 'nu-password'].forEach((id) => $(id).addEventListener('input', () => { $('nu-err').textContent = ''; }));
$('pw-gen').addEventListener('click', () => {
  const p = genPassword();
  $('pw-new').value = p; $('pw-new2').value = p;
  setPasswordVisible($('pw-new'), true); setPasswordVisible($('pw-new2'), true);
  $('pw-gen-note').hidden = false;
  $('pw-err').textContent = '';
  drawAccountRules();
});
function loadAccount() {
  $('must-banner').hidden = !me.mustChangePassword;
  $('pw-user').value = me.username;
  $('acc-info').innerHTML = `
    <div class="field">${t('acc.user')}<b>${esc(me.username)}</b></div>
    <div class="field">${t('acc.name')}<b>${esc(me.name)}</b></div>
    <div class="field">${t('acc.role')}<b>${t('role.' + me.role)}</b></div>
    <div class="field">${t('acc.lastLogin')}<b>${fmtDate(me.lastLoginAt)}</b></div>`;
}
$('pw').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pw-err').textContent = '';
  if (!pwOk($('pw-new').value)) { $('pw-err').textContent = t('pw.notMet'); $('pw-new').focus(); return; }
  if ($('pw-new').value !== $('pw-new2').value) { $('pw-err').textContent = t('acc.mismatch'); $('pw-new2').focus(); return; }
  try {
    const r = await api('/api/me/password', { method: 'POST', json: { current: $('pw-cur').value, next: $('pw-new').value } });
    me = r.user;
    $('pw').reset(); drawAccountRules();
    $('pw-gen-note').hidden = true;
    ['pw-cur', 'pw-new', 'pw-new2'].forEach((id) => setPasswordVisible($(id), false));
    toast(t('acc.changed'));
    if (!me.mustChangePassword) { $('must-banner').hidden = true; location.hash = 'decks'; init(); }
  } catch (err) { if (err.message !== 'auth') $('pw-err').textContent = err.message; }
});

init();
