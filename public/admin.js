import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
let decks = [];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (res.status === 401) { showLogin(); throw new Error('auth'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Eroare');
  return data;
}

// ------------------------------------------------------------------ auth
function showLogin() { $('app').hidden = true; $('login').hidden = false; $('pw').focus(); }
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) });
  if (!res.ok) { $('login-err').textContent = 'Parolă greșită.'; return; }
  $('login').hidden = true; init();
});
$('logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); });

async function init() {
  const me = await fetch('/api/me').then((r) => r.json());
  if (!me.ok) return showLogin();
  $('logout').hidden = !me.authRequired;
  $('app').hidden = false;
  await refresh();
}

async function refresh() {
  decks = await api('/api/decks');
  render();
}

// ------------------------------------------------------------------ list
const SETTINGS_UI = [
  ['swipe', 'checkbox', 'Swipe stânga/dreapta schimbă pagina'],
  ['tapZones', 'checkbox', 'Atingere pe marginea stângă/dreaptă schimbă pagina'],
  ['resetOnPageEnter', 'checkbox', 'Pop-up-urile (show/hide) se închid la schimbarea paginii'],
  ['pageIndicator', 'checkbox', 'Afișează numărul paginii'],
  ['transition', 'select', 'Tranziție', [['slide', 'Glisare'], ['fade', 'Estompare'], ['none', 'Fără']]],
  ['background', 'color', 'Culoare fundal'],
];

function render() {
  $('count').textContent = decks.length ? `· ${decks.length}` : '';
  const list = $('list');
  if (!decks.length) { list.innerHTML = '<div class="empty">Nicio prezentare încă. Încarcă primul PDF mai sus.</div>'; return; }
  const origin = decks[0].url.replace(/\/p\/[^/]+$/, '');
  $('up-catalogs').innerHTML = [...new Set(decks.map((d) => d.catalog))].map((c) => `<option value="${esc(c)}">`).join('');
  const catalogs = [...new Set(decks.map((d) => d.catalog))].sort((a, b) => a.localeCompare(b));
  const order = { DE: 0, FR: 1, IT: 2, EN: 3, RO: 4, XX: 5 };
  list.innerHTML = catalogs.map((cat) => `<h2 class="cat">${esc(cat)}</h2>` + decks.filter((d) => d.catalog === cat)
    .sort((a, b) => (order[a.lang] ?? 9) - (order[b.lang] ?? 9)).map((d) => `
    <article class="deck" data-id="${d.id}">
      <a class="thumb" href="${esc(d.url)}" target="_blank" style="${d.hasThumb ? `background-image:url('/thumbs/${d.id}.png?v=${d.thumbVersion}')` : ''}"></a>
      <div>
        <h2><span class="lang">${esc(d.lang)}</span><input type="text" data-f="title" value="${esc(d.title)}" aria-label="Titlu">${d.reference ? '<span class="refchip">referință</span>' : ''}</h2>
        <div class="meta">
          ${d.pages} pagini · ${d.buttonCount} butoane/linkuri · ${fmtSize(d.size)} · actualizat ${new Date(d.updatedAt).toLocaleString('ro-RO')}
          ${d.buttonCount === 0 ? '<br><span class="warn">⚠ Nu am găsit butoane. Exportă din InDesign ca „Adobe PDF (Interactive)”.</span>' : ''}
          ${(d.issues || []).filter((g) => g.severity !== 'info').map((g) => `<br><span class="warn">${g.severity === 'error' ? '✖' : '⚠'} ${esc(g.title)}: ${g.count}</span>`).join('')}
          ${d.unsupported?.length ? `<br><span class="warn">⚠ Acțiuni ignorate (nu se pot rula pe iPad): ${esc(d.unsupported.join(', '))}</span>` : ''}
        </div>
        <div class="url"><span class="base">${esc(origin)}/p/</span><input type="text" data-f="slug" value="${esc(d.slug)}" aria-label="Adresă"></div>
        <div class="actions">
          <a class="btn primary" href="${esc(d.url)}" target="_blank">▶ PLAY</a>
          <button data-a="report">Raport</button>
          <button data-a="copy">Copiază link</button>
          <button data-a="qr">Cod QR</button>
          <button data-a="replace">Înlocuiește PDF-ul</button>
          <button data-a="delete" class="danger">Șterge</button>
        </div>
        <details>
          <summary>Setări prezentare</summary>
          <div class="settings">
            <label>Catalog <input type="text" data-f="catalog" value="${esc(d.catalog)}" list="up-catalogs"></label>
            <label>Limba <select data-f="lang">${['DE', 'FR', 'IT', 'EN', 'RO', 'XX'].map((l) => `<option ${d.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label><input type="checkbox" data-f="reference" ${d.reference ? 'checked' : ''}> Referință pentru comparația între limbi</label>
            ${SETTINGS_UI.map(([k, type, label, opts]) => type === 'checkbox'
              ? `<label><input type="checkbox" data-s="${k}" ${d.settings[k] ? 'checked' : ''}> ${label}</label>`
              : type === 'select'
                ? `<label>${label} <select data-s="${k}">${opts.map(([v, t]) => `<option value="${v}" ${d.settings[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
                : `<label><input type="color" data-s="${k}" value="${esc(d.settings[k])}"> ${label}</label>`).join('')}
          </div>
        </details>
      </div>
    </article>`).join('')).join('');
}

const deckOf = (el) => decks.find((d) => d.id === el.closest('.deck')?.dataset.id);

$('list').addEventListener('change', async (e) => {
  const d = deckOf(e.target); if (!d) return;
  const t = e.target;
  try {
    let body;
    if (t.dataset.f) body = { [t.dataset.f]: t.type === 'checkbox' ? t.checked : t.value };
    else if (t.dataset.s) body = { settings: { [t.dataset.s]: t.type === 'checkbox' ? t.checked : t.value } };
    else return;
    const upd = await api(`/api/decks/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    Object.assign(d, upd);
    if (t.dataset.f) render();
    toast('Salvat');
  } catch (err) { if (err.message !== 'auth') { toast(err.message); render(); } }
});
$('list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur(); });

$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const d = deckOf(b);
  switch (b.dataset.a) {
    case 'report':
      openReport(d);
      break;
    case 'copy':
      try { await navigator.clipboard.writeText(d.url); toast('Link copiat'); } catch { prompt('Copiază linkul:', d.url); }
      break;
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
      if (!confirm(`Ștergi „${d.title}”? Linkul nu va mai funcționa.`)) return;
      await api(`/api/decks/${d.id}`, { method: 'DELETE' });
      await refresh();
      toast('Șters');
      break;
  }
});

// ------------------------------------------------------------------ upload
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
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    row.querySelector('i').style.width = (e.loaded / e.total * 100) + '%';
    if (e.loaded === e.total) row.querySelector('.st').textContent = '— analizez butoanele…';
  };
  xhr.onload = async () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status === 401) return showLogin();
    if (xhr.status >= 300) { row.classList.add('err'); row.querySelector('.st').textContent = '— ' + (data.error || 'eroare'); return; }
    row.querySelector('.st').textContent = '— generez miniatura…';
    await makeThumb(file, data.id).catch(() => {});
    row.remove();
    await refresh();
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
  const S = 512, pad = 0;
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min((S - pad * 2) / vp1.width, (S - pad * 2) / vp1.height);
  const vp = page.getViewport({ scale });
  const pc = document.createElement('canvas');
  pc.width = Math.ceil(vp.width); pc.height = Math.ceil(vp.height);
  await page.render({ canvas: pc, viewport: vp }).promise;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  // fill the square with a blurred, enlarged copy, then the page on top
  ctx.filter = 'blur(24px) brightness(.7)';
  const cover = Math.max(S / pc.width, S / pc.height);
  ctx.drawImage(pc, (S - pc.width * cover) / 2, (S - pc.height * cover) / 2, pc.width * cover, pc.height * cover);
  ctx.filter = 'none';
  ctx.drawImage(pc, (S - pc.width) / 2, (S - pc.height) / 2);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch(`/api/decks/${id}/thumb`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  task.destroy().catch(() => {});
}

init();


// ------------------------------------------------------------------ report
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
  dlg.showModal();
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
      <div class="tiles"><div class="tile ${e ? 'err' : 'ok'}"><b>${e}</b>erori</div><div class="tile ${w ? 'warnt' : 'ok'}"><b>${w}</b>avertismente</div><div class="tile"><b>${i}</b>informații</div></div>
      <p class="verdict">${verdict}</p>${cmp}
      <h3>Verificarea PDF-ului</h3>${r.issues.length ? groupsHtml(r.issues, d.url) : '<p class="okline">Nicio problemă găsită.</p>'}`;
  } catch (err) { if (err.message !== 'auth') body.innerHTML = `<p class="danger">${esc(err.message)}</p>`; }
}
$('report-close').addEventListener('click', () => $('report').close());
