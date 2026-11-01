import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
import { t, lang, locale, applyI18n, mountSwitches, eventLabel, issueText, itemText, detailText, wireEyes, setPasswordVisible } from '/i18n.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtAgo = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  if (s < 60) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 7) return rtf.format(-Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short' });
};
const ROLES = ['viewer', 'editor', 'admin'];
const atLeast = (role) => me && ROLES.indexOf(me.role) >= ROLES.indexOf(role);
let needCurrent = true;
let me = null, siteName = 'SANDOZ PRESENTING DECK', currentTab = 'decks';
let decks = [];

// small line icons (one stroke style everywhere)
const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  login: '<path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  device: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M11 18h2"/>',
  deck: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ICONS.dot}</svg>`;
const initials = (s) => (String(s || '?').trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

// location: "🇩🇪 München, Germania" — country names come from the browser, in the interface language
const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
function countryName(cc, fallback) {
  try { return new Intl.DisplayNames([locale()], { type: 'region' }).of(cc) || fallback || cc; } catch { return fallback || cc || ''; }
}
function placeText(g) {
  if (!g) return '';
  if (g.local) return t('geo.local');
  return [g.city, g.cc ? countryName(g.cc, g.country) : g.country].filter(Boolean).join(', ');
}
function placeHtml(g) {
  if (!g) return `<span class="muted">${t('geo.unknown')}</span>`;
  if (g.local) return `<span class="place muted">${t('geo.local')}</span>`;
  return `<span class="place"><span class="flag" aria-hidden="true">${flag(g.cc)}</span>${esc(placeText(g))}</span>`;
}
function evtHtml(type, ok, label = true) {
  const kind = ok === false || type === 'auth.login_failed' || type === 'auth.locked' ? 'bad'
    : type.startsWith('auth.') || type.startsWith('session.') ? 'auth'
    : type.startsWith('deck.') ? 'deck' : type.startsWith('user.') ? 'user' : type.startsWith('group.') ? 'group' : '';
  const ic = kind === 'bad' ? 'alert' : kind === 'auth' ? 'login' : type === 'deck.view' ? 'eye' : kind === 'deck' ? 'doc' : kind === 'user' || kind === 'group' ? 'user' : type.startsWith('backup.') ? 'box' : 'gear';
  return `<span class="evt ${kind}"><span class="dot">${icon(ic)}</span>${label ? esc(eventLabel(type)) : ''}</span>`;
}

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
  if (!res.ok) { const e = new Error(data.error || t('common.error')); e.code = data.code; throw e; }
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
mountSwitches($('mswitches'));
window.addEventListener('langchange', () => { renderHeader(); route(); });
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog')?.close(); });
// a click on the dimmed background closes a dialog
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  $('menu-toggle').setAttribute('aria-expanded', String(open));
}
$('menu-toggle').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
$('mnav').addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

function renderHeader() {
  $('site').textContent = siteName;
  document.title = `${siteName} — ${t('app.admin')}`;
  $('logout').title = t('top.logout');
  if (!me) return;
  $('me-name').textContent = me.name || me.username;
  $('me-av').textContent = initials(me.name || me.username);
  $('me-link').title = `${me.name || me.username} · ${t('role.' + me.role)}`;
  const links = [...document.querySelectorAll('#nav a')].filter((a) => !a.hidden);
  $('mnav').innerHTML = links.map((a) => `<a href="${a.getAttribute('href')}" data-tab="${a.dataset.tab}">${esc(a.textContent)}</a>`).join('')
    + `<a href="#account" data-tab="account">${t('nav.account')}</a>`;
}

async function init() {
  const m = await fetch('/api/me').then((r) => r.json());
  if (!m.user) { location.href = '/login?next=/admin'; return; }
  me = m.user;
  needCurrent = m.currentPasswordNeeded !== false;
  siteName = m.siteName || siteName;
  document.querySelectorAll('[data-min]').forEach((a) => { a.hidden = !atLeast(a.dataset.min); });
  renderHeader();
  $('editor-tools').hidden = !atLeast('editor');
  route();
}
const logout = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; };
$('logout').addEventListener('click', logout);
$('mlogout').addEventListener('click', logout);

function route() {
  if (!me) return;
  let tab = location.hash.slice(1) || (atLeast('editor') ? 'home' : 'decks');
  if (me.mustChangePassword) tab = 'account';
  const link = document.querySelector(`#nav a[data-tab="${tab}"]`);
  if (tab !== 'account' && (!link || link.hidden)) tab = 'decks';
  currentTab = tab;
  document.querySelectorAll('#nav a, #mnav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.querySelectorAll('section[id^="t-"]').forEach((s) => { s.hidden = s.id !== 't-' + tab; });
  $('nav').style.visibility = me.mustChangePassword ? 'hidden' : '';
  $('menu-toggle').hidden = !!me.mustChangePassword;
  setMenu(false);
  window.scrollTo(0, 0);
  ({ home: loadHome, decks: loadDecks, users: loadUsers, log: () => loadLog(true), settings: loadSettings, backup: loadBackups, account: loadAccount })[tab]?.();
}
window.addEventListener('hashchange', route);

// ================================================================== dashboard
let stats = null, map = null, mapLayer = null, tiles = null, mapFilter = 'all', L = null;
async function loadHome() {
  try {
    const [s, list] = await Promise.all([api('/api/stats'), api('/api/decks')]);
    stats = s; decks = list;
    $('kpis').innerHTML = [
      ['eye', s.views30, 'st.views', ''], ['login', s.logins30, 'st.logins', ''],
      ['alert', s.failed30, 'st.failed', s.failed30 ? 'bad' : ''], ['users', s.users, 'st.users', ''], ['device', s.activeSessions, 'st.sessions', ''],
    ].map(([ic, n, k, cls]) => `<div class="kpi ${cls}"><div class="ic">${icon(ic)}</div><b>${n}</b><span>${t(k)}</span></div>`).join('');
    renderPlaces();
    renderActivity();
    const who = (x) => (!x || x === 'link public' ? t('st.public') : x);
    $('st-decks').innerHTML = decks.length ? `<tr><th>${t('st.col.deck')}</th><th>${t('st.col.lang')}</th><th class="num">${t('st.col.30')}</th><th class="num">${t('st.col.total')}</th><th>${t('st.col.last')}</th></tr>` +
      [...decks].sort((a, b) => (s.perDeck[b.slug] || 0) - (s.perDeck[a.slug] || 0)).map((d) => `<tr>
        <td><b>${esc(d.title)}</b></td><td>${esc(d.lang)}</td><td class="num">${s.perDeck[d.slug] || 0}</td><td class="num">${d.stats?.views || 0}</td>
        <td class="nowrap">${d.stats?.lastViewedAt ? `${fmtDate(d.stats.lastViewedAt)} · ${esc(who(d.stats.lastViewedBy))}` : '—'}</td></tr>`).join('')
      : `<tr><td class="muted">${t('st.noDecks')}</td></tr>`;
    await drawMap();
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}

function renderPlaces() {
  const rows = stats.places || [];
  $('places').innerHTML = rows.length ? `<tr><th>${t('places.col.place')}</th><th class="num">${t('places.col.views')}</th><th class="num">${t('places.col.logins')}</th><th class="num">${t('places.col.failed')}</th></tr>`
    + rows.slice(0, 40).map((p) => `<tr><td>${placeHtml(p)}</td><td class="num">${p.views}</td><td class="num">${p.logins}</td><td class="num" ${p.failed ? 'style="color:var(--danger);font-weight:600"' : ''}>${p.failed}</td></tr>`).join('')
    : `<tr><td class="muted">${t('map.empty')}</td></tr>`;
}

async function renderActivity() {
  let rows = (stats.recentViews || []).map((v) => ({ ...v, type: 'deck.view' }));
  if (atLeast('admin')) {
    try { rows = (await api('/api/logs?limit=12')).rows.filter((x) => x.type !== 'system.start'); } catch {}
  }
  $('activity').innerHTML = rows.length ? rows.slice(0, 10).map((x) => `<div class="a">${evtHtml(x.type, x.ok, false)}
      <div class="what">${esc(x.user?.username || (x.type === 'deck.view' ? t('st.public') : x.target || '—'))}<small>${esc(x.type === 'deck.view' ? x.target : eventLabel(x.type))}${x.geo && !x.geo.local ? ' · ' + esc(placeText(x.geo)) : ''}</small></div>
      <span class="when">${esc(fmtAgo(x.at))}</span></div>`).join('')
    : `<div class="empty">${icon('inbox')}${t('home.noActivity')}</div>`;
}

// OpenStreetMap tiles: free, no key or account. Night mode darkens them with a CSS filter (admin.css).
const tileUrl = () => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
async function drawMap() {
  if (!L) L = await import('/vendor/leaflet/leaflet-src.esm.js');
  $('map-ready').hidden = !(stats.geo?.enabled && !stats.geo?.ready);
  if (!map) {
    map = L.map('map', { worldCopyJump: true, scrollWheelZoom: false, attributionControl: true }).setView([48, 12], 4);
    map.attributionControl.setPrefix(false);
    tiles = L.tileLayer(tileUrl(), { maxZoom: 18, className: 'osm-tiles', referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · <a href="https://db-ip.com" target="_blank">IP Geolocation by DB-IP</a>' }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.on('click', () => map.scrollWheelZoom.enable());
    window.addEventListener('themechange', () => drawPoints());
  } else {
    map.invalidateSize();
  }
  drawPoints(true);
}
function drawPoints(fit = false) {
  if (!map || !stats) return;
  mapLayer.clearLayers();
  const pts = (stats.places || []).filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({ p, n: mapFilter === 'all' ? p.views + p.logins + p.failed : p[mapFilter] })).filter((x) => x.n > 0);
  const max = Math.max(1, ...pts.map((x) => x.n));
  const colorOf = (p) => (mapFilter === 'failed' || (mapFilter === 'all' && p.failed && !p.views && !p.logins) ? css('--danger')
    : mapFilter === 'logins' || (mapFilter === 'all' && !p.views) ? css('--ok') : css('--brand'));
  for (const { p, n } of pts) {
    const c = colorOf(p);
    L.circleMarker([p.lat, p.lon], { radius: 7 + 17 * Math.sqrt(n / max), color: c, weight: 2, fillColor: c, fillOpacity: 0.35 })
      .bindPopup(`<b>${flag(p.cc)} ${esc(p.city || countryName(p.cc, p.country))}</b><br>${esc(p.region ? p.region + ', ' : '')}${esc(countryName(p.cc, p.country))}<br><br>
        ${t('map.views')}: <b>${p.views}</b> · ${t('map.logins')}: <b>${p.logins}</b>${p.failed ? ` · <span style="color:var(--danger)">${t('map.failed')}: <b>${p.failed}</b></span>` : ''}
        ${p.users?.length ? `<br>${t('map.users')}: ${p.users.map(esc).join(', ')}` : ''}
        ${p.decks?.length ? `<br>${t('map.decks')}: ${p.decks.map(esc).join(', ')}` : ''}
        <br><span style="color:var(--muted)">${t('map.last')}: ${fmtDate(p.last)}</span>`)
      .addTo(mapLayer);
  }
  if (fit && pts.length) {
    const b = L.latLngBounds(pts.map(({ p }) => [p.lat, p.lon]));
    map.fitBounds(b.pad(0.3), { maxZoom: 6 });
  }
  const notes = [t('map.attrib')];
  if (!pts.length && !(stats.geo?.enabled && !stats.geo?.ready)) notes.push(t('map.empty'));
  if (stats.placesLocal) notes.push(t('map.localNote', { n: stats.placesLocal }));
  $('map-note').textContent = notes.join(' ');
}
$('map-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mf]'); if (!b) return;
  mapFilter = b.dataset.mf;
  $('map-filter').querySelectorAll('[data-mf]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  drawPoints(true);
});

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

let query = '', langFilter = '';
async function loadDecks() {
  try { decks = await api('/api/decks'); renderDecks(); } catch (e) { if (e.message !== 'auth') $('list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const LANG_ORDER = { DE: 0, FR: 1, IT: 2, EN: 3, RO: 4, XX: 5 };
const errCount = (d) => (d.issues || []).filter((g) => g.severity === 'error').reduce((n, g) => n + g.count, 0);
const warnCount = (d) => (d.issues || []).filter((g) => g.severity === 'warning').reduce((n, g) => n + g.count, 0);

function renderDecks() {
  const list = $('list');
  const canEdit = atLeast('editor');
  const catalogs = [...new Set(decks.map((d) => d.catalog))].sort((a, b) => a.localeCompare(b));
  $('up-catalogs').innerHTML = catalogs.map((c) => `<option value="${esc(c)}">`).join('');
  const langs = [...new Set(decks.map((d) => d.lang))].sort((a, b) => (LANG_ORDER[a] ?? 9) - (LANG_ORDER[b] ?? 9));
  $('toolbar').hidden = decks.length < 2;
  $('langchips').innerHTML = langs.length > 1 ? [['', t('decks.allLangs')], ...langs.map((l) => [l, l === 'XX' ? t('lang.XX') : l])]
    .map(([v, label]) => `<button class="chip" type="button" data-lf="${v}" aria-pressed="${langFilter === v}">${esc(label)}</button>`).join('') : '';
  if (!decks.length) {
    list.innerHTML = `<div class="card empty">${icon('deck')}${t(canEdit ? 'decks.emptyEditor' : 'decks.empty')}</div>`;
    if (canEdit) $('uploader').hidden = false;
    return;
  }
  const q = query.toLowerCase();
  const shown = decks.filter((d) => (!langFilter || d.lang === langFilter) && (!q || `${d.title} ${d.catalog} ${d.slug}`.toLowerCase().includes(q)));
  if (!shown.length) { list.innerHTML = `<div class="empty">${icon('deck')}${t('decks.noMatch')}</div>`; return; }
  list.innerHTML = catalogs.map((cat) => {
    const items = shown.filter((d) => d.catalog === cat).sort((a, b) => (LANG_ORDER[a.lang] ?? 9) - (LANG_ORDER[b.lang] ?? 9));
    if (!items.length) return '';
    const nLang = new Set(decks.filter((d) => d.catalog === cat).map((d) => d.lang)).size;
    return `<h2 class="cat">${esc(cat)}${nLang > 1 ? `<span>${t('deck.inLangs', { n: nLang })}</span>` : ''}</h2><div class="gallery">${items.map(deckCard).join('')}</div>`;
  }).join('');
}

function deckCard(d) {
  const canEdit = atLeast('editor');
  const e = errCount(d), w = warnCount(d);
  const kicker = e ? `<span class="kicker bad">${e === 1 ? t('deck.kErr1') : t('deck.kErr', { n: e })}</span>`
    : !d.buttonCount ? `<span class="kicker">${t('deck.kNoBtn')}</span>`
    : w ? `<span class="kicker">${t('deck.kWarn', { n: w })}</span>` : `<span class="kicker ok">${t('deck.ok')}</span>`;
  const tags = [d.reference ? `<span class="tag">${t('deck.reference')}</span>` : '', d.settings?.publicLink ? `<span class="tag pub">${t('deck.publicLink')}</span>` : ''].join('');
  return `<article class="dcard" data-id="${d.id}">
    <a class="cover" href="${esc(d.url)}" target="_blank" style="${d.hasThumb ? `background-image:url('/thumbs/${d.id}.png?v=${d.thumbVersion}')` : ''}" aria-label="${t('deck.present')}: ${esc(d.title)}">
      <span class="lang">${esc(d.lang)}</span><span class="play">${icon('play')}</span></a>
    <div class="body">
      <div class="row" style="gap:8px">${kicker}${tags}</div>
      <div class="title">${esc(d.title)}</div>
      <div class="meta"><span>${t('deck.pages', { n: d.pages })}</span><span>${t('deck.buttons', { n: d.buttonCount })}</span><span>${t('deck.views', { n: d.stats?.views || 0 })}</span><span>v${d.version} · ${esc(fmtAgo(d.updatedAt))}</span></div>
      <div class="foot">
        <a class="btn primary" href="${esc(d.url)}" target="_blank">${t('deck.play')}</a>
        <button type="button" data-a="report">${t('deck.report')}</button>
        <span class="grow"></span>
        <button type="button" class="iconbtn" data-a="copy" title="${t('deck.copy')}" aria-label="${t('deck.copy')}">${icon('link')}</button>
        <button type="button" class="iconbtn" data-a="qr" title="${t('deck.qr')}" aria-label="${t('deck.qr')}">${icon('qr')}</button>
        ${canEdit ? `<button type="button" class="iconbtn" data-a="edit" title="${t('deck.more')}" aria-label="${t('deck.more')}">${icon('gear')}</button>` : ''}
      </div>
    </div></article>`;
}

$('q').addEventListener('input', (e) => { query = e.target.value.trim(); renderDecks(); });
$('langchips').addEventListener('click', (e) => { const b = e.target.closest('[data-lf]'); if (!b) return; langFilter = b.dataset.lf; renderDecks(); });
$('up-toggle').addEventListener('click', () => { $('uploader').hidden = !$('uploader').hidden; if (!$('uploader').hidden) $('uploader').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });

async function deckAction(action, d, b) {
  switch (action) {
    case 'report': openReport(d); break;
    case 'copy': copy(d.url, t('deck.copied')); break;
    case 'qr':
      $('qr-title').textContent = d.title;
      $('qr-img').src = `/api/decks/${d.id}/qr.svg?s=${encodeURIComponent(d.slug)}`;
      $('qr').showModal();
      break;
    case 'edit': openDeckSettings(d); break;
    case 'replace': {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/pdf,.pdf' });
      inp.onchange = () => { if (inp.files[0]) { $('deckdlg').close(); $('uploader').hidden = false; uploadFile(inp.files[0], d); } };
      inp.click();
      break;
    }
    case 'delete':
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = t('common.confirmDelete'); setTimeout(() => { b.dataset.confirm = ''; b.textContent = t('common.delete'); }, 5000); return; }
      try { await api(`/api/decks/${d.id}`, { method: 'DELETE' }); $('deckdlg').close(); toast(t('deck.deleted')); loadDecks(); } catch (err) { toast(err.message); }
      break;
  }
}
$('list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const d = decks.find((x) => x.id === b.closest('.dcard')?.dataset.id);
  if (d) deckAction(b.dataset.a, d, b);
});

let editDeck = null;
function openDeckSettings(d) {
  editDeck = d;
  const origin = d.url.replace(/\/p\/[^/]+$/, '');
  $('deckdlg-body').innerHTML = `
    <div class="grid2">
      <label class="field"><span>${t('deck.title')}</span><input type="text" data-f="title" value="${esc(d.title)}"></label>
      <label class="field"><span>${t('deck.catalog')}</span><input type="text" data-f="catalog" value="${esc(d.catalog)}" list="up-catalogs"></label>
      <label class="field"><span>${t('deck.lang')}</span><select data-f="lang">${['DE', 'FR', 'IT', 'EN', 'RO', 'XX'].map((l) => `<option value="${l}" ${d.lang === l ? 'selected' : ''}>${l === 'XX' ? t('lang.XX') : l}</option>`).join('')}</select></label>
      <div class="field"><span class="small muted">${t('deck.address')}</span><div class="url"><span class="base">${esc(origin)}/p/</span><input type="text" data-f="slug" value="${esc(d.slug)}"></div></div>
    </div>
    <label class="check" style="margin-top:16px"><input type="checkbox" data-f="reference" ${d.reference ? 'checked' : ''}> ${t('deck.isReference')}</label>
    <h3>${t('deck.settings')}</h3>
    <div class="settings">${presenterControls(d.settings || {}, 'data-s')}</div>
    <h3>${t('deck.actions')}</h3>
    <div class="row">
      <a class="btn primary" href="${esc(d.url)}" target="_blank">${t('deck.play')}</a>
      <button type="button" data-a="report">${t('deck.report')}</button>
      <button type="button" data-a="copy">${t('deck.copy')}</button>
      <button type="button" data-a="qr">${t('deck.qr')}</button>
      <button type="button" data-a="replace">${t('deck.replace')}</button>
      <button type="button" data-a="delete" class="danger">${t('common.delete')}</button>
    </div>`;
  if (!$('deckdlg').open) $('deckdlg').showModal();
}
$('deckdlg-body').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]'); if (!b || !editDeck) return;
  if (b.dataset.a === 'report' || b.dataset.a === 'qr') $('deckdlg').close();
  deckAction(b.dataset.a, editDeck, b);
});
$('deckdlg-body').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) { e.preventDefault(); e.target.blur(); } });
$('deckdlg-body').addEventListener('change', async (e) => {
  const d = editDeck, el = e.target; if (!d) return;
  let body;
  if (el.dataset.f) body = { [el.dataset.f]: el.type === 'checkbox' ? el.checked : el.value };
  else if (el.dataset.s) body = { settings: { [el.dataset.s]: el.type === 'checkbox' ? el.checked : el.value } };
  else return;
  try {
    const upd = await api(`/api/decks/${d.id}`, { method: 'PATCH', json: body });
    Object.assign(d, upd);
    if (el.dataset.f === 'reference' || el.dataset.f === 'catalog') { await loadDecks(); editDeck = decks.find((x) => x.id === d.id) || d; }
    else renderDecks();
    if (el.dataset.f === 'slug') openDeckSettings(editDeck);
    toast(t('common.saved'));
  } catch (err) { if (err.message !== 'auth') { toast(err.message); openDeckSettings(d); } }
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
      <div class="tiles3"><div class="${e ? 'err' : 'ok'}"><b>${e}</b>${t('rep.errors')}</div><div class="${w ? 'warnt' : 'ok'}"><b>${w}</b>${t('rep.warnings')}</div><div><b>${i}</b>${t('rep.infos')}</div></div>
      <p class="verdict">${verdict}</p>${cmp}
      <h3>${t('rep.check')}</h3>${r.issues.length ? groupsHtml(r.issues, d.url) : `<p class="okline">${t('rep.none')}</p>`}`;
  } catch (err) { if (err.message !== 'auth') body.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
$('report-close').addEventListener('click', () => { reportDeck = null; $('report').close(); });
window.addEventListener('langchange', () => { if ($('report').open && reportDeck) openReport(reportDeck); });

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
        <td><div class="usercell"><span class="avatar">${esc(initials(u.name || u.username))}</span><div><b>${esc(u.username)}${self ? ` <span class="muted small" style="font-weight:400">${t('us.you')}</span>` : ''}</b>${u.email ? `<span class="small muted">${esc(u.email)}</span>` : ''}</div></div></td>
        <td><input type="text" data-u="name" value="${esc(u.name)}" style="width:160px"></td>
        <td><select data-u="role" ${self ? 'disabled' : ''}>${ROLES.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('role.' + r)}</option>`).join('')}</select></td>
        <td>${access}${u.role === 'viewer' ? ` <button class="ghost small" data-ua="access">${t('us.edit')}</button>` : ''}</td>
        <td>${u.disabled ? `<span class="status off">${t('us.disabled')}</span>` : u.mustChangePassword ? `<span class="status must">${t('us.mustChange')}</span>` : `<span class="status">${t('us.active')}</span>`}</td>
        <td class="nowrap">${fmtDate(u.lastLoginAt)}</td>
        <td class="num">${u.activeSessions}</td>
        <td><div class="uact">${self ? '' : `<button data-ua="reset">${t('us.reset')}</button>
          <button data-ua="${u.disabled ? 'enable' : 'disable'}">${t(u.disabled ? 'us.enable' : 'us.disable')}</button>
          <button data-ua="delete" class="danger">${t('common.delete')}</button>`}</div></td></tr>`;
    }).join('');
    $('sessions').innerHTML = sessions.length ? `<tr><th>${t('us.col.user')}</th><th>${t('us.col.device')}</th><th>${t('geo.col')}</th><th>${t('us.col.ip')}</th><th>${t('us.col.lastSeen')}</th><th>${t('us.col.expires')}</th><th></th></tr>` + sessions.map((s) => `<tr>
        <td><b>${esc(s.username || '?')}</b></td><td class="nowrap">${esc(deviceName(s.ua))}</td><td>${placeHtml(s.geo)}</td><td class="nowrap muted small">${esc(s.ip || '')}</td>
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
$('nu-open').addEventListener('click', () => { $('nu-err').textContent = ''; $('nudlg').showModal(); $('nu-username').focus(); });
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
    $('nudlg').close();
    showSecret(t('us.created', { u: u.username }), t('us.createdText'), u.username, pw);
    loadUsers();
  } catch (err) { if (err.message !== 'auth') $('nu-err').textContent = err.message; }
});

function showSecret(title, text, username, password) {
  const dlg = $('report'), body = $('report-body');
  reportDeck = null;
  body.innerHTML = `<h2 style="margin:0 0 8px;font-size:26px">${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div style="display:grid;gap:14px;margin-top:18px"><div class="field"><span class="small muted">${t('us.loginAddress')}</span><div class="secret">${esc(location.origin)}/login</div></div>
    <div class="field"><span class="small muted">${t('login.user')}</span><div class="secret">${esc(username)}</div></div>
    <div class="field"><span class="small muted">${t('login.password')}</span><div class="secret">${esc(password)}</div></div></div>
    <div class="row" style="margin-top:20px"><button class="primary" id="secret-copy" type="button">${t('us.copyCreds')}</button></div>`;
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
// sign-ins store the browser's user agent: show it as "iPad · Safari", the full text on hover
const logDetail = (x) => (/^(Mozilla|curl|Opera)\//.test(x.detail || '')
  ? `<span title="${esc(x.detail)}">${esc(deviceName(x.detail))}</span>` : esc(detailText(x.detail || '')));
let logLimit = 200, logRows = [];
async function loadLog(reset) {
  if (reset) logLimit = 200;
  const q = new URLSearchParams({ limit: logLimit, type: $('lg-type').value, user: $('lg-user').value.trim(), q: $('lg-q').value.trim() });
  try {
    const r = await api('/api/logs?' + q);
    logRows = r.rows;
    $('log').innerHTML = logRows.length ? `<tr><th>${t('lg.col.when')}</th><th>${t('lg.col.event')}</th><th>${t('lg.col.user')}</th><th>${t('lg.col.target')}</th><th>${t('geo.col')}</th><th>${t('lg.col.detail')}</th><th>${t('lg.col.ip')}</th></tr>` + logRows.map((x) => `<tr class="${x.ok === false ? 'fail' : ''}">
        <td class="nowrap">${fmtDate(x.at)}</td><td>${evtHtml(x.type, x.ok)}</td><td>${esc(x.user?.username || '—')}</td>
        <td class="tgt">${esc(x.target || '')}</td><td>${x.ip ? placeHtml(x.geo) : ''}</td><td class="small detail">${logDetail(x)}</td><td class="nowrap muted small">${esc(x.ip || '')}</td></tr>`).join('')
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
  const lines = [t('lg.csvHead') + ',' + cell(t('geo.col'))]
    .concat(logRows.map((x) => [x.at, eventLabel(x.type), x.user?.username, x.target, detailText(x.detail), x.ip, t(x.ok === false ? 'lg.no' : 'lg.yes'), placeText(x.geo)].map(cell).join(',')));
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
  // right after the first sign-in the current password is not asked again (the browser could fill in someone else's)
  $('pw-cur-field').hidden = !needCurrent;
  if (!needCurrent) $('pw-cur').value = '';
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
    const r = await api('/api/me/password', { method: 'POST', json: { current: needCurrent ? $('pw-cur').value : undefined, next: $('pw-new').value } });
    me = r.user;
    $('pw').reset(); drawAccountRules();
    $('pw-gen-note').hidden = true;
    ['pw-cur', 'pw-new', 'pw-new2'].forEach((id) => setPasswordVisible($(id), false));
    toast(t('acc.changed'));
    if (!me.mustChangePassword) { $('must-banner').hidden = true; location.hash = 'decks'; init(); }
  } catch (err) {
    if (err.message === 'auth') return;
    $('pw-err').textContent = err.message;
    if (err.code === 'current_required') { needCurrent = true; $('pw-cur-field').hidden = false; $('pw-cur').focus(); }
  }
});

init();
