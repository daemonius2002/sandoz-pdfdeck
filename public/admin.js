import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ROLE_LABEL = { admin: 'Administrator', editor: 'Editor', viewer: 'Prezentator' };
const ROLES = ['viewer', 'editor', 'admin'];
const atLeast = (role) => me && ROLES.indexOf(me.role) >= ROLES.indexOf(role);
let me = null;
let decks = [];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.method && opts.method !== 'GET') headers['X-PDFDeck'] = '1';
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent('/admin' + location.hash); throw new Error('auth'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && data.error === 'password_change') { location.hash = 'account'; throw new Error(data.message); }
  if (!res.ok) throw new Error(data.error || 'Eroare');
  return data;
}

function genPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789', all = letters + digits + '-_';
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); } catch { prompt('Copiază:', text); }
}

// ================================================================== shell
async function init() {
  const m = await fetch('/api/me').then((r) => r.json());
  if (!m.user) { location.href = '/login?next=/admin'; return; }
  me = m.user;
  $('site').textContent = m.siteName || 'PDF Deck';
  document.title = `${m.siteName || 'PDF Deck'} — Administrare`;
  $('me-name').textContent = me.name || me.username;
  $('me-role').textContent = ROLE_LABEL[me.role];
  $('me-role').className = 'role ' + me.role;
  document.querySelectorAll('#tabs a').forEach((a) => { a.hidden = a.dataset.min ? !atLeast(a.dataset.min) : false; });
  $('editor-tools').hidden = !atLeast('editor');
  route();
}
$('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; });

function route() {
  let tab = location.hash.slice(1) || 'decks';
  if (me.mustChangePassword) tab = 'account';
  const link = document.querySelector(`#tabs a[data-tab="${tab}"]`);
  if (!link || link.hidden) tab = 'decks';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.querySelectorAll('section[id^="t-"]').forEach((s) => { s.hidden = s.id !== 't-' + tab; });
  $('tabs').style.display = me.mustChangePassword ? 'none' : '';
  ({ decks: loadDecks, stats: loadStats, users: loadUsers, log: () => loadLog(true), settings: loadSettings, backup: loadBackups, account: loadAccount })[tab]?.();
}
window.addEventListener('hashchange', route);

// ================================================================== presentations
const PRESENTER_UI = [
  ['swipe', 'checkbox', 'Swipe stânga/dreapta schimbă pagina'],
  ['tapZones', 'checkbox', 'Atingere pe marginea stângă/dreaptă schimbă pagina'],
  ['resetOnPageEnter', 'checkbox', 'Pop-up-urile (show/hide) se închid la schimbarea paginii'],
  ['pageIndicator', 'checkbox', 'Afișează numărul paginii'],
  ['transition', 'select', 'Tranziție', [['slide', 'Glisare'], ['fade', 'Estompare'], ['none', 'Fără']]],
  ['background', 'color', 'Culoare fundal'],
  ['publicLink', 'checkbox', 'Link public (se deschide fără cont)'],
];
const presenterControls = (values, attr) => PRESENTER_UI.map(([k, type, label, opts]) => type === 'checkbox'
  ? `<label><input type="checkbox" ${attr}="${k}" ${values[k] ? 'checked' : ''}> ${label}</label>`
  : type === 'select'
    ? `<label>${label} <select ${attr}="${k}">${opts.map(([v, t]) => `<option value="${v}" ${values[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
    : `<label><input type="color" ${attr}="${k}" value="${esc(values[k])}"> ${label}</label>`).join('');

async function loadDecks() {
  try { decks = await api('/api/decks'); renderDecks(); } catch (e) { if (e.message !== 'auth') $('list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function renderDecks() {
  const list = $('list');
  const canEdit = atLeast('editor');
  if (!decks.length) {
    list.innerHTML = `<div class="empty">${canEdit ? 'Nicio prezentare încă. Încarcă primul PDF mai sus.' : 'Nu există încă prezentări.'}</div>`;
    return;
  }
  const origin = decks[0].url.replace(/\/p\/[^/]+$/, '');
  const catalogs = [...new Set(decks.map((d) => d.catalog))].sort((a, b) => a.localeCompare(b));
  $('up-catalogs').innerHTML = catalogs.map((c) => `<option value="${esc(c)}">`).join('');
  const order = { DE: 0, FR: 1, IT: 2, EN: 3, RO: 4, XX: 5 };
  list.innerHTML = catalogs.map((cat) => `<h2 class="cat">${esc(cat)}</h2>` + decks.filter((d) => d.catalog === cat)
    .sort((a, b) => (order[a.lang] ?? 9) - (order[b.lang] ?? 9)).map((d) => {
      const errs = (d.issues || []).filter((g) => g.severity === 'error').reduce((n, g) => n + g.count, 0);
      const warns = (d.issues || []).filter((g) => g.severity === 'warning').reduce((n, g) => n + g.count, 0);
      return `<article class="deck" data-id="${d.id}">
      <a class="thumb" href="${esc(d.url)}" target="_blank" style="${d.hasThumb ? `background-image:url('/thumbs/${d.id}.png?v=${d.thumbVersion}')` : ''}" aria-label="Prezintă"></a>
      <div style="min-width:0">
        <h3><span class="lang">${esc(d.lang)}</span>${canEdit ? `<input type="text" data-f="title" value="${esc(d.title)}" aria-label="Titlu">` : `<span class="t">${esc(d.title)}</span>`}
          ${d.reference ? '<span class="chip">referință</span>' : ''}${d.settings?.publicLink ? '<span class="chip pub">link public</span>' : ''}</h3>
        <div class="meta">${d.pages} pagini · ${d.buttonCount} butoane/linkuri · ${fmtSize(d.size)} · v${d.version} · ${fmtDate(d.updatedAt)}
          · ${d.stats?.views || 0} deschideri${d.stats?.lastViewedAt ? ` (ultima: ${fmtDate(d.stats.lastViewedAt)}, ${esc(d.stats.lastViewedBy)})` : ''}
          ${errs ? `<br><span class="e">✖ ${errs} ${errs === 1 ? 'eroare' : 'erori'} — vezi raportul</span>` : ''}
          ${warns ? `<br><span class="w">⚠ ${warns} avertismente</span>` : ''}
          ${!d.buttonCount ? '<br><span class="w">⚠ Nu am găsit butoane. Exportă din InDesign ca „Adobe PDF (Interactive)”.</span>' : ''}</div>
        <div class="url"><span class="base">${esc(origin)}/p/</span>${canEdit ? `<input type="text" data-f="slug" value="${esc(d.slug)}" aria-label="Adresă">` : `<b>${esc(d.slug)}</b>`}</div>
        <div class="row">
          <a class="btn primary" href="${esc(d.url)}" target="_blank">▶ PLAY</a>
          <button data-a="report">Raport</button>
          <button data-a="copy">Copiază link</button>
          <button data-a="qr">Cod QR</button>
          ${canEdit ? '<button data-a="replace">Înlocuiește PDF-ul</button><button data-a="delete" class="danger">Șterge</button>' : ''}
        </div>
        ${canEdit ? `<details><summary>Setări prezentare</summary>
          <div class="settings">
            <label>Catalog <input type="text" data-f="catalog" value="${esc(d.catalog)}" list="up-catalogs"></label>
            <label>Limba <select data-f="lang">${['DE', 'FR', 'IT', 'EN', 'RO', 'XX'].map((l) => `<option ${d.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label><input type="checkbox" data-f="reference" ${d.reference ? 'checked' : ''}> Referință pentru comparația între limbi</label>
            ${presenterControls(d.settings || {}, 'data-s')}
          </div></details>` : ''}
      </div></article>`;
    }).join('')).join('');
}

const deckOf = (el) => decks.find((d) => d.id === el.closest('.deck')?.dataset.id);
$('list').addEventListener('change', async (e) => {
  const d = deckOf(e.target); if (!d) return;
  const t = e.target;
  let body;
  if (t.dataset.f) body = { [t.dataset.f]: t.type === 'checkbox' ? t.checked : t.value };
  else if (t.dataset.s) body = { settings: { [t.dataset.s]: t.type === 'checkbox' ? t.checked : t.value } };
  else return;
  try {
    const upd = await api(`/api/decks/${d.id}`, { method: 'PATCH', json: body });
    Object.assign(d, upd);
    if (t.dataset.f === 'reference') await loadDecks();
    else if (t.dataset.f || t.dataset.s === 'publicLink') renderDecks();
    toast('Salvat');
  } catch (err) { if (err.message !== 'auth') { toast(err.message); renderDecks(); } }
});
$('list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur(); });
$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const d = deckOf(b);
  switch (b.dataset.a) {
    case 'report': openReport(d); break;
    case 'copy': copy(d.url, 'Link copiat'); break;
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
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmi ștergerea?'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Șterge'; }, 5000); return; }
      try { await api(`/api/decks/${d.id}`, { method: 'DELETE' }); toast('Prezentarea a fost ștearsă'); loadDecks(); } catch (err) { toast(err.message); }
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
  row.innerHTML = `${replacing ? 'Înlocuiesc' : 'Încarc'} <b>${esc(file.name)}</b> <span class="st"></span><div class="bar"><i></i></div>`;
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
    if (e.loaded === e.total) row.querySelector('.st').textContent = '— analizez butoanele…';
  };
  xhr.onload = async () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status === 401) { location.href = '/login?next=/admin'; return; }
    if (xhr.status >= 300) { row.classList.add('err'); row.querySelector('.st').textContent = '— ' + (data.error || 'eroare'); return; }
    row.querySelector('.st').textContent = '— generez miniatura…';
    await makeThumb(file, data.id).catch(() => {});
    row.remove();
    await loadDecks();
    toast(replacing ? 'PDF înlocuit — linkul rămâne același' : 'Prezentare adăugată');
    const fresh = decks.find((x) => x.id === data.id);
    if (fresh) openReport(fresh);
  };
  xhr.onerror = () => { row.classList.add('err'); row.querySelector('.st').textContent = '— conexiune întreruptă'; };
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
const SEV = { error: 'Eroare', warning: 'Avertisment', info: 'Informație' };
const countOf = (issues, sev) => (issues || []).filter((g) => g.severity === sev).reduce((n, g) => n + g.items.length, 0);
function groupsHtml(list, url) {
  return list.map((g) => `<details class="issue ${g.severity}" ${g.severity === 'error' ? 'open' : ''}>
    <summary><span class="sev">${SEV[g.severity]}</span><span class="it">${esc(g.title)}</span><span class="n">${g.items.length}</span></summary>
    <p class="advice">${esc(g.advice)}</p>
    <ul>${g.items.slice(0, 200).map((it) => `<li>${it.page ? `<a class="pg" href="${esc(url)}#${it.page}" target="_blank">p. ${it.page}</a>` : ''}<span>${esc(it.text)}</span></li>`).join('')}
    ${g.items.length > 200 ? `<li>… încă ${g.items.length - 200}</li>` : ''}</ul></details>`).join('');
}
async function openReport(d) {
  const dlg = $('report'), body = $('report-body');
  body.innerHTML = '<p>Se încarcă raportul…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const r = await api(`/api/decks/${d.id}/report`);
    const e = countOf(r.issues, 'error'), w = countOf(r.issues, 'warning'), i = countOf(r.issues, 'info');
    const verdict = e ? 'Prezentarea are erori: unele butoane nu vor funcționa. Corectează-le în InDesign și încarcă din nou PDF-ul.'
      : w ? 'Prezentarea funcționează. Avertismentele de mai jos sunt lucruri de verificat.' : 'Prezentarea funcționează fără probleme pe iPad.';
    let cmp = '';
    if (r.comparison) {
      cmp = `<h3>Comparație cu varianta ${esc(r.comparison.lang)}</h3>` + (r.comparison.issues.length
        ? groupsHtml(r.comparison.issues, d.url)
        : '<p class="okline">Aceleași pagini și aceleași butoane, cu aceleași destinații ca în varianta de referință.</p>');
    }
    body.innerHTML = `
      <div class="rhead"><div><div class="eyebrow">${esc(d.catalog)} · ${esc(d.lang)}</div><h2>${esc(d.title)}</h2>
        <div class="meta">${r.pageCount} pagini · ${r.buttonCount} butoane și linkuri</div></div>
        <a class="btn primary" href="${esc(d.url)}" target="_blank">▶ PLAY</a></div>
      <div class="tiles" style="margin-top:14px"><div class="tile ${e ? 'err' : 'ok'}"><b>${e}</b>erori</div><div class="tile ${w ? 'warnt' : 'ok'}"><b>${w}</b>avertismente</div><div class="tile"><b>${i}</b>informații</div></div>
      <p class="verdict">${verdict}</p>${cmp}
      <h3>Verificarea PDF-ului</h3>${r.issues.length ? groupsHtml(r.issues, d.url) : '<p class="okline">Nicio problemă găsită.</p>'}`;
  } catch (err) { if (err.message !== 'auth') body.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
$('report-close').addEventListener('click', () => $('report').close());

// ================================================================== statistics
async function loadStats() {
  try {
    const [s, list] = await Promise.all([api('/api/stats'), api('/api/decks')]);
    decks = list;
    $('st-tiles').innerHTML = `
      <div class="tile"><b>${s.views30}</b>deschideri de prezentări (30 zile)</div>
      <div class="tile"><b>${s.logins30}</b>autentificări (30 zile)</div>
      <div class="tile ${s.failed30 ? 'warnt' : ''}"><b>${s.failed30}</b>autentificări eșuate (30 zile)</div>
      <div class="tile"><b>${s.users}</b>utilizatori</div>
      <div class="tile"><b>${s.activeSessions}</b>sesiuni active</div>`;
    $('st-decks').innerHTML = decks.length ? `<tr><th>Prezentare</th><th>Limba</th><th class="num">30 zile</th><th class="num">Total</th><th>Ultima deschidere</th></tr>` +
      [...decks].sort((a, b) => (s.perDeck[b.slug] || 0) - (s.perDeck[a.slug] || 0)).map((d) => `<tr>
        <td>${esc(d.title)}</td><td>${esc(d.lang)}</td><td class="num">${s.perDeck[d.slug] || 0}</td><td class="num">${d.stats?.views || 0}</td>
        <td class="nowrap">${d.stats?.lastViewedAt ? `${fmtDate(d.stats.lastViewedAt)} · ${esc(d.stats.lastViewedBy)}` : '—'}</td></tr>`).join('')
      : '<tr><td class="muted">Nu există încă prezentări.</td></tr>';
    $('st-recent').innerHTML = s.recentViews.length ? `<tr><th>Când</th><th>Cine</th><th>Prezentare</th><th>IP</th></tr>` + s.recentViews.map((v) => `<tr>
        <td class="nowrap">${fmtDate(v.at)}</td><td>${esc(v.user?.username || 'link public')}</td><td>${esc(v.target)}</td><td class="nowrap muted">${esc(v.ip || '')}</td></tr>`).join('')
      : '<tr><td class="muted">Nicio deschidere în ultimele 30 de zile.</td></tr>';
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}

// ================================================================== users
async function loadUsers() {
  try {
    const [users, sessions, g] = await Promise.all([api('/api/users'), api('/api/sessions'), api('/api/groups')]);
    groupData = g; userList = users;
    renderGroups();
    $('users').innerHTML = `<tr><th>Utilizator</th><th>Nume</th><th>Rol</th><th>Acces</th><th>Stare</th><th>Ultima logare</th><th class="num">Sesiuni</th><th></th></tr>` + users.map((u) => {
      const self = u.id === me.id;
      const access = u.role !== 'viewer' ? '<span class="muted small">toate (rol)</span>'
        : u.allDecks !== false ? '<span class="small">toate</span>'
        : `<div class="pillset">${(u.groups || []).map((id) => groupData.groups.find((x) => x.id === id)).filter(Boolean).map((x) => `<span>${esc(x.name)}</span>`).join('') || '<span>niciun grup</span>'}</div>`;
      return `<tr data-uid="${u.id}" data-username="${esc(u.username)}">
        <td><b>${esc(u.username)}</b>${self ? ' <span class="muted small">(tu)</span>' : ''}${u.email ? `<div class="small muted">${esc(u.email)}</div>` : ''}</td>
        <td><input type="text" data-u="name" value="${esc(u.name)}" style="width:150px"></td>
        <td><select data-u="role" ${self ? 'disabled' : ''}>${ROLES.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></td>
        <td>${access}${u.role === 'viewer' ? ` <button class="ghost small" data-ua="access">modifică</button>` : ''}</td>
        <td>${u.disabled ? '<span class="status off">dezactivat</span>' : u.mustChangePassword ? '<span class="status must">trebuie să schimbe parola</span>' : '<span class="status">activ</span>'}</td>
        <td class="nowrap">${fmtDate(u.lastLoginAt)}</td>
        <td class="num">${u.activeSessions}</td>
        <td><div class="uact">${self ? '' : `<button data-ua="reset">Resetează parola</button>
          <button data-ua="${u.disabled ? 'enable' : 'disable'}">${u.disabled ? 'Reactivează' : 'Dezactivează'}</button>
          <button data-ua="delete" class="danger">Șterge</button>`}</div></td></tr>`;
    }).join('');
    $('sessions').innerHTML = sessions.length ? `<tr><th>Utilizator</th><th>Dispozitiv</th><th>IP</th><th>Ultima activitate</th><th>Expiră</th><th></th></tr>` + sessions.map((s) => `<tr>
        <td><b>${esc(s.username || '?')}</b></td><td class="small">${esc(deviceName(s.ua))}</td><td class="nowrap muted">${esc(s.ip || '')}</td>
        <td class="nowrap">${fmtDate(s.lastSeen)}</td><td class="nowrap">${fmtDate(s.expiresAt)}</td>
        <td><button data-sid="${esc(s.id)}">Închide</button></td></tr>`).join('') : '<tr><td class="muted">Nicio sesiune activă.</td></tr>';
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
function deviceName(ua = '') {
  const dev = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispozitiv';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${dev} · ${br}` : dev;
}

$('nu-gen').addEventListener('click', () => { $('nu-password').value = genPassword(); });
$('nu').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('nu-err').textContent = '';
  const pw = $('nu-password').value;
  try {
    const u = await api('/api/users', { method: 'POST', json: {
      username: $('nu-username').value.trim().toLowerCase(), name: $('nu-name').value, email: $('nu-email').value,
      role: $('nu-role').value, password: pw, mustChangePassword: $('nu-must').checked,
      allDecks: $('nu-access').value === 'all',
      groups: [...$('nu-groups').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('nu-groups').hidden = true;
    $('nu').reset();
    showSecret(`Utilizatorul „${u.username}” a fost creat`, 'Trimite-i datele de logare pe un canal separat. Parola nu mai poate fi văzută după ce închizi această fereastră.', u.username, pw);
    loadUsers();
  } catch (err) { if (err.message !== 'auth') $('nu-err').textContent = err.message; }
});

function showSecret(title, text, username, password) {
  const dlg = $('report'), body = $('report-body');
  body.innerHTML = `<h2 style="margin:0 0 8px">${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="grid2"><div class="field">Adresa de logare<div class="secret">${esc(location.origin)}/login</div></div>
    <div class="field">Utilizator<div class="secret">${esc(username)}</div></div>
    <div class="field">Parolă<div class="secret">${esc(password)}</div></div></div>
    <div class="row" style="margin-top:12px"><button class="primary" id="secret-copy" type="button">Copiază datele de logare</button></div>`;
  if (!dlg.open) dlg.showModal();
  $('secret-copy').onclick = () => copy(`Adresa: ${location.origin}/login\nUtilizator: ${username}\nParolă: ${password}`, 'Datele de logare au fost copiate');
}

$('users').addEventListener('change', async (e) => {
  const tr = e.target.closest('tr[data-uid]'); if (!tr || !e.target.dataset.u) return;
  try { await api(`/api/users/${tr.dataset.uid}`, { method: 'PATCH', json: { [e.target.dataset.u]: e.target.value } }); toast('Salvat'); loadUsers(); }
  catch (err) { toast(err.message); loadUsers(); }
});
$('users').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-ua]'); if (!b) return;
  const tr = b.closest('tr'), id = tr.dataset.uid, username = tr.dataset.username;
  try {
    if (b.dataset.ua === 'access') { openAccess(userList.find((x) => x.id === id)); return; }
    if (b.dataset.ua === 'reset') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmi resetarea?'; return; }
      const pw = genPassword();
      await api(`/api/users/${id}`, { method: 'PATCH', json: { password: pw } });
      showSecret(`Parolă nouă pentru „${username}”`, 'Utilizatorul a fost deconectat de pe toate dispozitivele și își va alege o parolă nouă la prima logare.', username, pw);
    } else if (b.dataset.ua === 'disable' || b.dataset.ua === 'enable') {
      const disable = b.dataset.ua === 'disable';
      await api(`/api/users/${id}`, { method: 'PATCH', json: { disabled: disable } });
      toast(disable ? 'Cont dezactivat — utilizatorul a fost deconectat' : 'Cont reactivat');
    } else if (b.dataset.ua === 'delete') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmi ștergerea?'; return; }
      await api(`/api/users/${id}`, { method: 'DELETE' });
      toast('Utilizator șters');
    }
    loadUsers();
  } catch (err) { toast(err.message); loadUsers(); }
});
$('sessions').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-sid]'); if (!b) return;
  try { await api(`/api/sessions/${b.dataset.sid}`, { method: 'DELETE' }); toast('Sesiune închisă'); loadUsers(); } catch (err) { toast(err.message); }
});

// ================================================================== log
let logLimit = 200, logRows = [], logLabels = {};
async function loadLog(reset) {
  if (reset) logLimit = 200;
  const q = new URLSearchParams({ limit: logLimit, type: $('lg-type').value, user: $('lg-user').value.trim().toLowerCase(), q: $('lg-q').value.trim() });
  try {
    const r = await api('/api/logs?' + q);
    logRows = r.rows; logLabels = r.labels;
    $('log').innerHTML = logRows.length ? `<tr><th>Când</th><th>Eveniment</th><th>Utilizator</th><th>Țintă</th><th>Detalii</th><th>IP</th></tr>` + logRows.map((x) => `<tr class="${x.ok === false ? 'fail' : ''}">
        <td class="nowrap">${fmtDate(x.at)}</td><td class="nowrap">${esc(logLabels[x.type] || x.type)}</td><td>${esc(x.user?.username || '—')}</td>
        <td>${esc(x.target || '')}</td><td class="small">${esc(x.detail || '')}</td><td class="nowrap muted small">${esc(x.ip || '')}</td></tr>`).join('')
      : '<tr><td class="muted">Niciun eveniment găsit.</td></tr>';
    $('lg-more').hidden = logRows.length < logLimit;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('lg-go').addEventListener('click', () => loadLog(true));
['lg-user', 'lg-q'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLog(true); }));
$('lg-type').addEventListener('change', () => loadLog(true));
$('lg-more').addEventListener('click', () => { logLimit += 300; loadLog(false); });
$('lg-csv').addEventListener('click', () => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['data', 'eveniment', 'utilizator', 'tinta', 'detalii', 'ip', 'reusit'].join(',')]
    .concat(logRows.map((x) => [x.at, logLabels[x.type] || x.type, x.user?.username, x.target, x.detail, x.ip, x.ok === false ? 'nu' : 'da'].map(cell).join(',')));
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: `jurnal-${new Date().toISOString().slice(0, 10)}.csv` });
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
    $('n-status').innerHTML = n.configured
      ? `Serverul de email este configurat (${esc(n.host)}, expeditor ${esc(n.from)}).`
      : 'Serverul de email nu este configurat. Adaugă în Render, la Environment: <b>SMTP_HOST</b>, <b>SMTP_PORT</b>, <b>SMTP_USER</b>, <b>SMTP_PASS</b> și <b>SMTP_FROM</b>, apoi repornește serviciul.';
    $('n-recipients').value = (n.settings.recipients || []).join('\n');
    $('n-events').innerHTML = Object.entries(n.events).map(([k, label]) => `<label class="check"><input type="checkbox" data-ev="${k}" ${n.settings.events[k] ? 'checked' : ''}> ${esc(label)}</label>`).join('');
    $('n-test').disabled = !n.configured;
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('n-test').addEventListener('click', async () => {
  $('n-test-msg').textContent = 'Se trimite…';
  try {
    await saveSettings(true);
    const r = await api('/api/notify/test', { method: 'POST', json: {} });
    $('n-test-msg').textContent = `Trimis către ${r.to.join(', ')}. Verifică și folderul Spam.`;
  } catch (err) { $('n-test-msg').textContent = err.message; }
});
$('sf').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(false).catch(() => {}); });
async function saveSettings(quiet) {
  $('s-err').textContent = '';
  const recipients = $('n-recipients').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const bad = recipients.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (bad.length) { $('s-err').textContent = 'Adresă de email invalidă: ' + bad.join(', '); throw new Error('Adresă de email invalidă.'); }
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
    $('site').textContent = s.siteName;
    if (!quiet) toast('Setările au fost salvate');
  } catch (err) { if (err.message !== 'auth') $('s-err').textContent = err.message; throw err; }
}

// ================================================================== my account
function loadAccount() {
  $('must-banner').hidden = !me.mustChangePassword;
  $('pw-user').value = me.username;
  $('acc-info').innerHTML = `
    <div class="field">Utilizator<b>${esc(me.username)}</b></div>
    <div class="field">Nume<b>${esc(me.name)}</b></div>
    <div class="field">Rol<b>${ROLE_LABEL[me.role]}</b></div>
    <div class="field">Ultima logare<b>${fmtDate(me.lastLoginAt)}</b></div>`;
}
$('pw').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pw-err').textContent = '';
  if ($('pw-new').value !== $('pw-new2').value) { $('pw-err').textContent = 'Parolele noi nu coincid.'; return; }
  try {
    const r = await api('/api/me/password', { method: 'POST', json: { current: $('pw-cur').value, next: $('pw-new').value } });
    me = r.user;
    $('pw').reset();
    toast('Parola a fost schimbată');
    if (!me.mustChangePassword) { $('must-banner').hidden = true; location.hash = 'decks'; init(); }
  } catch (err) { if (err.message !== 'auth') $('pw-err').textContent = err.message; }
});

init();


// ================================================================== access groups
let groupData = { groups: [], catalogs: [], langs: [] }, userList = [];
const checks = (name, items, selected = []) => items.map(([v, label]) => `<label><input type="checkbox" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
function renderGroups() {
  const { groups, catalogs, langs } = groupData;
  $('groups').innerHTML = groups.length ? `<tr><th>Grup</th><th>Cataloage</th><th>Limbi</th><th class="num">Prezentări</th><th>Membri</th><th></th></tr>` + groups.map((g) => `<tr data-gid="${g.id}">
      <td><input type="text" data-g="name" value="${esc(g.name)}" style="width:150px"></td>
      <td><div class="groupchecks">${checks('cat', catalogs.map((c) => [c, c]), g.catalogs)}</div>${!g.catalogs.length ? '<div class="small muted">toate</div>' : ''}</td>
      <td><div class="groupchecks">${checks('lang', langs.map((l) => [l, l]), g.langs)}</div>${!g.langs.length ? '<div class="small muted">toate</div>' : ''}</td>
      <td class="num">${g.decks}</td>
      <td class="small">${g.members.length ? g.members.map(esc).join(', ') : '<span class="muted">—</span>'}</td>
      <td><button class="danger" data-gdel>Șterge</button></td></tr>`).join('')
    : '<tr><td class="muted">Niciun grup încă. Fără grupuri, toți prezentatorii văd toate prezentările.</td></tr>';
  $('ng-catalogs').innerHTML = catalogs.length ? checks('ngc', catalogs.map((c) => [c, c])) : '<span class="small muted">încarcă întâi o prezentare</span>';
  $('ng-langs').innerHTML = checks('ngl', langs.filter((l) => l !== 'XX').map((l) => [l, l]));
  $('nu-groups').innerHTML = groups.length ? checks('nug', groups.map((g) => [g.id, g.name])) : '<span class="small muted">Creează întâi un grup (mai jos).</span>';
}
$('nu-access').addEventListener('change', () => { $('nu-groups').hidden = $('nu-access').value !== 'groups'; });
$('ng').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('ng-err').textContent = '';
  try {
    await api('/api/groups', { method: 'POST', json: {
      name: $('ng-name').value,
      catalogs: [...$('ng-catalogs').querySelectorAll('input:checked')].map((x) => x.value),
      langs: [...$('ng-langs').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('ng').reset(); toast('Grup creat'); loadUsers();
  } catch (err) { if (err.message !== 'auth') $('ng-err').textContent = err.message; }
});
$('groups').addEventListener('change', async (e) => {
  const tr = e.target.closest('tr[data-gid]'); if (!tr) return;
  const body = e.target.dataset.g === 'name' ? { name: e.target.value }
    : { catalogs: [...tr.querySelectorAll('input[name=cat]:checked')].map((x) => x.value), langs: [...tr.querySelectorAll('input[name=lang]:checked')].map((x) => x.value) };
  try { await api(`/api/groups/${tr.dataset.gid}`, { method: 'PATCH', json: body }); toast('Grup salvat'); loadUsers(); } catch (err) { toast(err.message); loadUsers(); }
});
$('groups').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-gdel]'); if (!b) return;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmi?'; return; }
  try { await api(`/api/groups/${b.closest('tr').dataset.gid}`, { method: 'DELETE' }); toast('Grup șters'); loadUsers(); } catch (err) { toast(err.message); }
});

let accessUser = null;
function openAccess(u) {
  accessUser = u;
  $('ac-user').textContent = `${u.name} (${u.username})`;
  document.querySelector(`input[name=ac][value=${u.allDecks !== false ? 'all' : 'groups'}]`).checked = true;
  $('ac-groups').innerHTML = groupData.groups.length ? checks('acg', groupData.groups.map((g) => [g.id, g.name]), u.groups || []) : '<span class="small muted">Nu există încă grupuri.</span>';
  $('access').showModal();
}
$('ac-cancel').addEventListener('click', () => $('access').close());
$('ac-save').addEventListener('click', async () => {
  try {
    await api(`/api/users/${accessUser.id}`, { method: 'PATCH', json: {
      allDecks: document.querySelector('input[name=ac]:checked').value === 'all',
      groups: [...$('ac-groups').querySelectorAll('input:checked')].map((x) => x.value),
    } });
    $('access').close(); toast('Acces salvat'); loadUsers();
  } catch (err) { toast(err.message); }
});

// ================================================================== backups
async function loadBackups() {
  try {
    const r = await api('/api/backups');
    $('b-auto').checked = r.settings.auto; $('b-keep').value = r.settings.keep;
    $('b-total').textContent = r.list.length ? `${r.list.length} backup-uri · ${fmtSize(r.totalBytes)} pe disc` : '';
    $('b-list').innerHTML = r.list.length ? `<tr><th>Creat</th><th>Tip</th><th class="num">Mărime</th><th></th></tr>` + r.list.map((b) => `<tr data-name="${esc(b.name)}">
        <td class="nowrap">${fmtDate(b.createdAt)}</td><td><span class="kind ${b.kind}">${b.kind === 'auto' ? 'automat' : 'manual'}</span></td>
        <td class="num">${fmtSize(b.size)}</td>
        <td class="nowrap"><a class="btn" href="/api/backups/${encodeURIComponent(b.name)}" download>Descarcă</a>
          <button data-b="restore">Restaurează</button> <button data-b="delete" class="danger">Șterge</button></td></tr>`).join('')
      : '<tr><td class="muted">Niciun backup încă. Primul backup automat se face la câteva minute după pornirea serverului.</td></tr>';
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
$('b-save').addEventListener('click', async () => {
  try { await api('/api/settings', { method: 'PATCH', json: { backup: { auto: $('b-auto').checked, keep: $('b-keep').value } } }); toast('Salvat'); }
  catch (err) { toast(err.message); }
});
$('b-now').addEventListener('click', async () => {
  const b = $('b-now'); b.disabled = true; b.textContent = 'Se creează…';
  try { const r = await api('/api/backups', { method: 'POST' }); toast(`Backup creat (${fmtSize(r.size)})`); loadBackups(); }
  catch (err) { toast(err.message); }
  finally { b.disabled = false; b.textContent = 'Creează backup acum'; }
});
$('b-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-b]'); if (!b) return;
  const name = b.closest('tr').dataset.name;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = b.dataset.b === 'restore' ? 'Confirmi? Înlocuiește tot' : 'Confirmi ștergerea?'; return; }
  if (b.dataset.b === 'delete') {
    try { await api(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }); toast('Backup șters'); loadBackups(); } catch (err) { toast(err.message); }
  } else {
    b.disabled = true; b.textContent = 'Se restaurează…';
    try { await api(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }); afterRestore(); }
    catch (err) { toast(err.message); loadBackups(); }
  }
});
$('r-file').addEventListener('change', () => { $('r-go').disabled = !$('r-file').files[0]; $('r-go').dataset.confirm = ''; $('r-go').textContent = 'Restaurează din fișier'; });
$('r-go').addEventListener('click', () => {
  const btn = $('r-go'), f = $('r-file').files[0]; if (!f) return;
  $('r-err').textContent = '';
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Confirmi? Toate datele actuale vor fi înlocuite'; return; }
  btn.disabled = true; btn.textContent = 'Se încarcă…';
  const fd = new FormData(); fd.append('backup', f);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/restore'); xhr.setRequestHeader('X-PDFDeck', '1');
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) btn.textContent = `Se încarcă… ${Math.round(e.loaded / e.total * 100)}%`; };
  xhr.onload = () => {
    let d = {}; try { d = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status >= 300) { $('r-err').textContent = d.error || 'Restaurarea nu a reușit.'; btn.disabled = false; btn.dataset.confirm = ''; btn.textContent = 'Restaurează din fișier'; return; }
    afterRestore();
  };
  xhr.onerror = () => { $('r-err').textContent = 'Conexiunea s-a întrerupt.'; btn.disabled = false; };
  xhr.send(fd);
});
function afterRestore() {
  document.body.innerHTML = `<div class="login-page"><div class="login-card"><h1>Backup restaurat</h1>
    <p>Serverul repornește cu datele din backup. Te trimit la pagina de autentificare în câteva secunde…</p></div></div>`;
  const wait = async () => { try { const r = await fetch('/api/me'); if (r.ok) { location.href = '/login'; return; } } catch {} setTimeout(wait, 2000); };
  setTimeout(wait, 4000);
}
