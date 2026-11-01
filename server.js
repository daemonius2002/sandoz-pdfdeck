import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { analyzePdf, compareVariants } from './lib/analyze.js';
import { JsonFile } from './lib/store.js';
import { Auth, ROLES, roleAtLeast } from './lib/auth.js';
import { Audit, EVENT_LABELS } from './lib/audit.js';
import { Backups } from './lib/backup.js';
import { Notifier, NOTIFY_EVENTS } from './lib/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 500);
const COOKIE = 'pdfdeck_sid';

const DIRS = { files: path.join(DATA_DIR, 'files'), analysis: path.join(DATA_DIR, 'analysis'), thumbs: path.join(DATA_DIR, 'thumbs'), tmp: path.join(DATA_DIR, 'tmp') };
for (const d of Object.values(DIRS)) fss.mkdirSync(d, { recursive: true });

// Presenter defaults for every new presentation (editable in Settings).
const PRESENTER_DEFAULTS = {
  swipe: true,              // swipe left/right to change page
  tapZones: false,          // tap left/right edge to change page
  resetOnPageEnter: true,   // pop-ups (show/hide) start closed every time you enter a page
  transition: 'slide',      // slide | fade | none (a transition set in the PDF wins)
  pageIndicator: false,     // small "3 / 12" in the corner
  background: '#000000',
  publicLink: false,        // this presentation opens without logging in
};

// ---------------- configuration ----------------
const DEFAULT_CONFIG = {
  siteName: 'PDF Deck',
  access: 'login',          // login: presentations need an account | public: anyone with the link
  logViews: true,
  security: { sessionDays: 30, maxAttempts: 5, lockMinutes: 15 },
  presenter: { ...PRESENTER_DEFAULTS },
  backup: { auto: true, keep: 7 },
  notify: { recipients: [], events: Object.fromEntries(Object.keys(NOTIFY_EVENTS).map((k) => [k, true])) },
};
const config = new JsonFile(path.join(DATA_DIR, 'settings.json'), DEFAULT_CONFIG);
config.data = {
  ...DEFAULT_CONFIG, ...config.data,
  security: { ...DEFAULT_CONFIG.security, ...config.data.security },
  presenter: { ...PRESENTER_DEFAULTS, ...config.data.presenter },
  backup: { ...DEFAULT_CONFIG.backup, ...config.data.backup },
  notify: { ...DEFAULT_CONFIG.notify, ...config.data.notify, events: { ...DEFAULT_CONFIG.notify.events, ...config.data.notify?.events } },
};
const settings = () => config.data;

const auth = new Auth(DATA_DIR, settings);
const audit = new Audit(DATA_DIR);
const backups = new Backups(DATA_DIR);
let lastBaseUrl = PUBLIC_URL;
const notifier = new Notifier(settings, () => PUBLIC_URL || lastBaseUrl);

// ---------------- access groups ----------------
// A group gives its members the presentations of some catalogues and/or languages
// (empty list = all). Users with "all presentations" ignore groups; editors and admins see everything.
const groupStore = new JsonFile(path.join(DATA_DIR, 'groups.json'), { groups: [] });
const groups = () => groupStore.data.groups;
const groupMatches = (g, deck) => (!g.catalogs?.length || g.catalogs.includes(deck.catalog)) && (!g.langs?.length || g.langs.includes(deck.lang));
function visibleTo(user, deck) {
  if (!user) return false;
  if (roleAtLeast(user.role, 'editor') || user.allDecks !== false) return true;
  return groups().some((g) => user.groups?.includes(g.id) && groupMatches(g, deck));
}

// ---------------- presentations ----------------
const store = new JsonFile(path.join(DATA_DIR, 'decks.json'), { decks: [] });
const db = store.data;
for (const d of db.decks) {
  d.catalog ??= d.title; d.lang ??= 'XX'; d.reference ??= false;
  d.settings = { ...PRESENTER_DEFAULTS, ...d.settings };
  d.stats ??= { views: 0, lastViewedAt: null, lastViewedBy: null };
}
const save = () => store.save();
const findDeck = (id) => db.decks.find((d) => d.id === id);
const findSlug = (slug) => db.decks.find((d) => d.slug === slug);

const LANGS = ['DE', 'FR', 'IT', 'EN', 'RO', 'XX'];
function guessLang(name) {
  const n = name.toLowerCase();
  const t = (re) => new RegExp(`(^|[_\\-\\s.])(${re})([_\\-\\s.]|$)`).test(n);
  if (t('ger|de|deu|deutsch')) return 'DE';
  if (t('fr|fra|fre|franz|francais')) return 'FR';
  if (t('it|ita|ital|italiano')) return 'IT';
  if (t('en|eng|english')) return 'EN';
  if (t('ro|rum|romana')) return 'RO';
  return 'XX';
}
const referenceOf = (deck) => {
  const list = db.decks.filter((d) => d.catalog === deck.catalog && d.id !== deck.id);
  return list.find((d) => d.reference) || list.find((d) => d.lang === 'DE') || null;
};
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'prezentare';
const uniqueSlug = (base, exceptId) => {
  let s = base, i = 2;
  while (db.decks.some((d) => d.slug === s && d.id !== exceptId)) s = `${base}-${i++}`;
  return s;
};

// ---------------- app ----------------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'self'" });
  next();
});

const cookieOf = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const ipOf = (req) => req.ip || req.socket.remoteAddress;
app.use((req, _res, next) => { if (!PUBLIC_URL && req.get('host')) lastBaseUrl = `${req.protocol}://${req.get('host')}`; next(); });
app.use((req, _res, next) => {
  const token = cookieOf(req, COOKIE);
  const s = auth.sessionFor(token);
  req.token = token;
  req.user = s?.user || null;
  next();
});
// Requests that change something must come from our own pages (blocks cross-site form posts).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-PDFDeck') !== '1') return res.status(403).json({ error: 'Cerere respinsă.' });
  next();
});
const need = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'auth' });
  if (req.user.mustChangePassword) return res.status(403).json({ error: 'password_change', message: 'Schimbă parola înainte de a continua.' });
  if (!roleAtLeast(req.user.role, role)) return res.status(403).json({ error: 'Nu ai drepturi pentru această acțiune.' });
  next();
};
const meta = (req) => ({ user: req.user, ip: ipOf(req) });

const upload = multer({
  dest: DIRS.tmp,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /pdf$/i.test(file.mimetype) || /\.pdf$/i.test(file.originalname)),
});
const baseUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const publicDeck = (d, req) => ({ ...d, url: `${baseUrl(req)}/p/${d.slug}` });
const setCookie = (req, res, value, maxAge) => res.setHeader('Set-Cookie',
  `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);

function notifyUpload(req, deck, isNewVersion) {
  const errs = (deck.issues || []).filter((g) => g.severity === 'error').reduce((n, g) => n + g.count, 0);
  const warns = (deck.issues || []).filter((g) => g.severity === 'warning').reduce((n, g) => n + g.count, 0);
  notifier.event('upload', `${isNewVersion ? 'Versiune nouă' : 'Prezentare nouă'}: ${deck.title} (${deck.lang})`, [
    `${req.user.username} a încărcat ${isNewVersion ? `versiunea ${deck.version} pentru` : 'prezentarea'} „${deck.title}” (${deck.catalog} · ${deck.lang}).`,
    `${deck.pages} pagini, ${deck.buttonCount} butoane. Raport: ${errs} erori, ${warns} avertismente.`,
    `Link: ${baseUrl(req)}/p/${deck.slug}`,
  ]);
}

async function ingest(file, deck) {
  const bytes = await fs.readFile(file.path);
  if (bytes.subarray(0, 1024).indexOf('%PDF') === -1) throw new Error('Fișierul nu pare a fi un PDF.');
  const analysis = await analyzePdf(bytes);
  const version = (deck.version || 0) + 1;
  const name = `${deck.id}-${version}.pdf`;
  await fs.rename(file.path, path.join(DIRS.files, name)).catch(async () => {
    await fs.copyFile(file.path, path.join(DIRS.files, name)); await fs.unlink(file.path);
  });
  if (deck.file) await fs.unlink(path.join(DIRS.files, deck.file)).catch(() => {});
  await fs.writeFile(path.join(DIRS.analysis, `${deck.id}.json`), JSON.stringify(analysis));
  Object.assign(deck, {
    file: name, version, size: bytes.length, originalName: file.originalname,
    pages: analysis.pageCount, buttonCount: analysis.buttonCount, unsupported: analysis.unsupported,
    issues: (analysis.issues || []).map((g) => ({ severity: g.severity, title: g.title, count: g.items.length })),
    updatedAt: new Date().toISOString(), hasThumb: false,
  });
  await fs.unlink(path.join(DIRS.thumbs, `${deck.id}.png`)).catch(() => {});
  return deck;
}

// ================= account =================
app.get('/api/me', (req, res) => res.json({
  user: req.user ? auth.publicUser(req.user) : null,
  siteName: settings().siteName,
  needsSetup: !auth.activeAdmins().length,
}));

const failureTimes = [];
app.post('/api/login', express.json(), async (req, res) => {
  const { username, password } = req.body || {};
  const r = await auth.login(username, password, { ip: ipOf(req), ua: req.get('user-agent') });
  if (!r.ok) {
    if (r.locked && !r.reason) {
      return res.status(429).json({ error: `Prea multe încercări greșite. Încearcă din nou după ${new Date(r.locked).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })}.` });
    }
    const who = String(username || '').slice(0, 60);
    audit.log('auth.login_failed', { ip: ipOf(req), target: who, detail: r.reason === 'disabled' ? 'cont dezactivat' : 'utilizator sau parolă greșită', ok: false });
    if (r.locked) {
      audit.log('auth.locked', { ip: ipOf(req), target: who, ok: false });
      notifier.event('locked', `Cont blocat: ${who}`, [`Contul „${who}” a fost blocat temporar după prea multe parole greșite.`, `Adresa IP: ${ipOf(req)}`, `Dacă nu a fost chiar utilizatorul, verifică Jurnalul.`], { throttleKey: who });
    }
    failureTimes.push(Date.now());
    while (failureTimes.length && failureTimes[0] < Date.now() - 3600e3) failureTimes.shift();
    if (failureTimes.length >= 20) {
      notifier.event('failedBurst', 'Multe autentificări eșuate', [`${failureTimes.length} autentificări eșuate în ultima oră.`, `Ultima: utilizatorul „${who}” de la adresa ${ipOf(req)}.`, 'Poate fi o încercare de ghicire a parolelor. Verifică Jurnalul.'], { throttleKey: 'global', throttleMin: 120 });
    }
    return res.status(r.locked ? 429 : 401).json({ error: r.reason === 'disabled' ? 'Contul este dezactivat. Contactează administratorul.' : r.locked ? 'Prea multe încercări greșite. Contul este blocat temporar.' : 'Utilizator sau parolă greșită.' });
  }
  setCookie(req, res, r.token, r.maxAge);
  audit.log('auth.login', { user: r.user, ip: ipOf(req), detail: String(req.get('user-agent') || '').slice(0, 120) });
  res.json({ ok: true, user: auth.publicUser(r.user) });
});

app.post('/api/logout', async (req, res) => {
  if (req.user) audit.log('auth.logout', meta(req));
  await auth.logout(req.token);
  setCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.post('/api/me/password', express.json(), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth' });
  try {
    await auth.changeOwnPassword(req.user.id, req.body?.current, req.body?.next, req.token);
    audit.log('auth.password_changed', meta(req));
    res.json({ ok: true, user: auth.publicUser(req.user) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ================= users (admin) =================
app.get('/api/users', need('admin'), (_req, res) => res.json(auth.list()));
const validGroups = (list) => (Array.isArray(list) ? list.filter((id) => groups().some((g) => g.id === id)) : undefined);
app.post('/api/users', need('admin'), express.json(), async (req, res) => {
  try {
    if (req.body) req.body.groups = validGroups(req.body.groups) || [];
    const u = await auth.create(req.body || {});
    audit.log('user.create', { ...meta(req), target: u.username, detail: `rol: ${u.role}` });
    notifier.event('users', `Utilizator nou: ${u.username}`, [`${req.user.username} a creat contul „${u.username}” (${u.name}), rol: ${u.role}.`]);
    res.json(auth.publicUser(u));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/users/:id', need('admin'), express.json(), async (req, res) => {
  try {
    if (req.body?.groups) req.body.groups = validGroups(req.body.groups);
    const { user, changes } = await auth.update(req.params.id, req.body || {}, req.user.id);
    if (changes.length) audit.log('user.update', { ...meta(req), target: user.username, detail: changes.join(', ') });
    if (changes.some((c) => c === 'dezactivat' || c.startsWith('rol'))) notifier.event('users', `Cont modificat: ${user.username}`, [`${req.user.username} a modificat contul „${user.username}”: ${changes.join(', ')}.`]);
    res.json(auth.publicUser(user));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/users/:id', need('admin'), async (req, res) => {
  try {
    const u = await auth.remove(req.params.id, req.user.id);
    audit.log('user.delete', { ...meta(req), target: u.username });
    notifier.event('users', `Utilizator șters: ${u.username}`, [`${req.user.username} a șters contul „${u.username}”.`]);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/sessions', need('admin'), (_req, res) => res.json(auth.listSessions().map(({ userId, ...s }) => s)));
app.delete('/api/sessions/:id', need('admin'), (req, res) => {
  const s = auth.revokeSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sesiunea nu mai există.' });
  audit.log('session.revoke', { ...meta(req), target: auth.byId(s.userId)?.username, detail: s.ip });
  res.json({ ok: true });
});

// ================= log & stats =================
app.get('/api/logs', need('admin'), async (req, res) => {
  const limit = Math.min(1000, Number(req.query.limit) || 200);
  const rows = await audit.query({ limit, type: String(req.query.type || ''), user: String(req.query.user || ''), q: String(req.query.q || '') });
  res.json({ labels: EVENT_LABELS, rows });
});
app.get('/api/stats', need('editor'), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const views = await audit.query({ type: 'deck.view', since, limit: 5000 });
  const logins = await audit.query({ type: 'auth.login', since, limit: 5000 });
  const failed = await audit.query({ type: 'auth.login_failed', since, limit: 5000 });
  const perDeck = {};
  for (const v of views) perDeck[v.target] = (perDeck[v.target] || 0) + 1;
  res.json({
    views30: views.length, logins30: logins.length, failed30: failed.length,
    users: auth.list().length, activeSessions: auth.listSessions().length,
    perDeck, recentViews: views.slice(0, 15),
  });
});

// ================= settings (admin) =================
app.get('/api/settings', need('admin'), (_req, res) => res.json(settings()));
app.patch('/api/settings', need('admin'), express.json(), async (req, res) => {
  const b = req.body || {}, s = settings(), changed = [];
  if (typeof b.siteName === 'string' && b.siteName.trim()) { s.siteName = b.siteName.trim().slice(0, 60); changed.push('nume'); }
  if (b.access === 'login' || b.access === 'public') { s.access = b.access; changed.push('acces: ' + b.access); }
  if (typeof b.logViews === 'boolean') { s.logViews = b.logViews; changed.push('jurnal vizualizări'); }
  const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v))));
  if (b.security) {
    if (b.security.sessionDays != null) s.security.sessionDays = clampInt(b.security.sessionDays, 1, 365);
    if (b.security.maxAttempts != null) s.security.maxAttempts = clampInt(b.security.maxAttempts, 3, 20);
    if (b.security.lockMinutes != null) s.security.lockMinutes = clampInt(b.security.lockMinutes, 1, 1440);
    changed.push('securitate');
  }
  if (b.backup) {
    if (typeof b.backup.auto === 'boolean') s.backup.auto = b.backup.auto;
    if (b.backup.keep != null) s.backup.keep = clampInt(b.backup.keep, 1, 60);
    changed.push('backup');
  }
  if (b.notify) {
    if (Array.isArray(b.notify.recipients)) {
      s.notify.recipients = [...new Set(b.notify.recipients.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))].slice(0, 20);
    }
    if (b.notify.events) for (const k of Object.keys(NOTIFY_EVENTS)) if (typeof b.notify.events[k] === 'boolean') s.notify.events[k] = b.notify.events[k];
    changed.push('notificări');
  }
  if (b.presenter) {
    for (const k of Object.keys(PRESENTER_DEFAULTS)) if (k in b.presenter && typeof b.presenter[k] === typeof PRESENTER_DEFAULTS[k]) s.presenter[k] = b.presenter[k];
    changed.push('setări implicite prezentare');
  }
  await config.save();
  audit.log('settings.update', { ...meta(req), detail: changed.join(', ') });
  res.json(s);
});

// ================= access groups (admin) =================
const cleanGroup = (b, g = {}) => {
  if (typeof b.name === 'string') { if (!b.name.trim()) throw new Error('Grupul trebuie să aibă un nume.'); g.name = b.name.trim().slice(0, 60); }
  if (Array.isArray(b.catalogs)) g.catalogs = [...new Set(b.catalogs.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
  if (Array.isArray(b.langs)) g.langs = [...new Set(b.langs.filter((x) => LANGS.includes(x)))];
  return g;
};
app.get('/api/groups', need('admin'), (_req, res) => res.json({
  groups: groups().map((g) => ({ ...g, members: auth.users.data.users.filter((u) => u.groups?.includes(g.id)).map((u) => u.username),
    decks: db.decks.filter((d) => groupMatches(g, d)).length })),
  catalogs: [...new Set(db.decks.map((d) => d.catalog))].sort(), langs: LANGS,
}));
app.post('/api/groups', need('admin'), express.json(), async (req, res) => {
  try {
    const g = cleanGroup(req.body || {}, { id: 'g_' + crypto.randomBytes(5).toString('hex'), catalogs: [], langs: [] });
    if (!g.name) throw new Error('Grupul trebuie să aibă un nume.');
    groups().push(g); await groupStore.save();
    audit.log('group.create', { ...meta(req), target: g.name, detail: describeGroup(g) });
    res.json(g);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/groups/:id', need('admin'), express.json(), async (req, res) => {
  const g = groups().find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupul nu există.' });
  try {
    cleanGroup(req.body || {}, g); await groupStore.save();
    audit.log('group.update', { ...meta(req), target: g.name, detail: describeGroup(g) });
    res.json(g);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/groups/:id', need('admin'), async (req, res) => {
  const g = groups().find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupul nu există.' });
  groupStore.data.groups = groups().filter((x) => x !== g);
  await groupStore.save();
  await auth.removeGroupEverywhere(g.id);
  audit.log('group.delete', { ...meta(req), target: g.name });
  res.json({ ok: true });
});
function describeGroup(g) {
  return `cataloage: ${g.catalogs.length ? g.catalogs.join(', ') : 'toate'}; limbi: ${g.langs.length ? g.langs.join(', ') : 'toate'}`;
}

// ================= backups (admin) =================
async function runAutoBackup() {
  const cfg = settings().backup;
  if (!cfg.auto) return;
  const last = await backups.lastAuto();
  if (last && Date.now() - Date.parse(last.createdAt) < 23.5 * 3600e3) return;
  try {
    const b = await backups.create('auto', cfg.keep);
    audit.log('backup.create', { target: b.name, detail: `automat · ${(b.size / 1048576).toFixed(1)} MB` });
  } catch (e) {
    audit.log('backup.create', { detail: 'automat · eșuat: ' + e.message, ok: false });
    notifier.event('backupFailed', 'Backup-ul automat nu a reușit', [`Eroare: ${e.message}`, 'Verifică spațiul pe disc al serverului.'], { throttleKey: 'auto', throttleMin: 720 });
  }
}
app.get('/api/backups', need('admin'), async (_req, res) => {
  const list = await backups.list();
  res.json({ list, totalBytes: list.reduce((n, b) => n + b.size, 0), settings: settings().backup });
});
app.post('/api/backups', need('admin'), async (req, res) => {
  try {
    const b = await backups.create('manual');
    audit.log('backup.create', { ...meta(req), target: b.name, detail: `manual · ${(b.size / 1048576).toFixed(1)} MB` });
    res.json(b);
  } catch (e) { res.status(500).json({ error: 'Backup-ul nu a reușit: ' + e.message }); }
});
app.get('/api/backups/:name', need('admin'), (req, res) => {
  const p = backups.pathOf(req.params.name);
  if (!p || !fss.existsSync(p)) return res.status(404).json({ error: 'Backup-ul nu există.' });
  audit.log('backup.download', { ...meta(req), target: req.params.name });
  res.download(p);
});
app.delete('/api/backups/:name', need('admin'), async (req, res) => {
  try { await backups.remove(req.params.name); audit.log('backup.delete', { ...meta(req), target: req.params.name }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
const zipUpload = multer({ dest: DIRS.tmp, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });
async function restoreFrom(req, res, zipPath, label) {
  try {
    const r = await backups.restore(zipPath);
    audit.log('backup.restore', { ...meta(req), target: label, detail: `copie de siguranță înainte: ${r.safetyBackup || '—'}` });
    await audit.queue;
    res.json({ ok: true, restarting: true, safetyBackup: r.safetyBackup });
    // everything in memory is now stale: restart (Render / Docker start the server again automatically)
    setTimeout(() => process.exit(0), 600);
  } catch (e) { res.status(400).json({ error: e.message }); }
}
app.post('/api/backups/:name/restore', need('admin'), async (req, res) => {
  const p = backups.pathOf(req.params.name);
  if (!p || !fss.existsSync(p)) return res.status(404).json({ error: 'Backup-ul nu există.' });
  restoreFrom(req, res, p, req.params.name);
});
app.post('/api/restore', need('admin'), zipUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Alege fișierul de backup (.zip).' });
  await restoreFrom(req, res, req.file.path, req.file.originalname);
  fs.unlink(req.file.path).catch(() => {});
});

// ================= notifications (admin) =================
app.get('/api/notify', need('admin'), (_req, res) => res.json({ ...notifier.status(), events: NOTIFY_EVENTS, settings: settings().notify }));
app.post('/api/notify/test', need('admin'), express.json(), async (req, res) => {
  try {
    const to = (req.body?.to ? [req.body.to] : notifier.recipients());
    await notifier.send('Email de test', ['Acesta este un email de test.', `Trimis de ${req.user.username} din pagina de Setări.`, 'Dacă îl primești, notificările funcționează.'], { to });
    audit.log('notify.test', { ...meta(req), target: to.join(', ') });
    res.json({ ok: true, to });
  } catch (e) { res.status(400).json({ error: 'Emailul nu a putut fi trimis: ' + e.message }); }
});

// ================= presentations =================
app.get('/api/decks', need('viewer'), (req, res) => {
  res.json([...db.decks].filter((d) => visibleTo(req.user, d)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((d) => publicDeck(d, req)));
});

app.post('/api/decks', need('editor'), upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Alege un fișier PDF.' });
  const base = req.file.originalname.replace(/\.pdf$/i, '');
  const title = (req.body.title || base.replace(/_+/g, ' ')).trim();
  const catalog = (req.body.catalog || '').trim() || db.decks[0]?.catalog || base;
  const lang = LANGS.includes(req.body.lang) ? req.body.lang : guessLang(base);
  // same catalog + language again => new version of that presentation (same link)
  const existing = db.decks.find((d) => d.catalog === catalog && d.lang === lang);
  if (existing) {
    try {
      await ingest(req.file, existing); await save();
      audit.log('deck.replace', { ...meta(req), target: existing.slug, detail: `${req.file.originalname} · v${existing.version}` });
      notifyUpload(req, existing, true);
      return res.json(publicDeck(existing, req));
    } catch (e) { await fs.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message }); }
  }
  const deck = {
    id: crypto.randomBytes(6).toString('hex'), title, catalog, lang, reference: false,
    slug: uniqueSlug(slugify(`${catalog}-${lang}`)),
    createdAt: new Date().toISOString(), createdBy: req.user.username,
    settings: { ...settings().presenter }, stats: { views: 0, lastViewedAt: null, lastViewedBy: null },
  };
  try {
    await ingest(req.file, deck);
    db.decks.push(deck); await save();
    audit.log('deck.upload', { ...meta(req), target: deck.slug, detail: req.file.originalname });
    notifyUpload(req, deck, false);
    res.json(publicDeck(deck, req));
  } catch (e) {
    await fs.unlink(req.file.path).catch(() => {});
    res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message });
  }
});

app.put('/api/decks/:id/file', need('editor'), upload.single('pdf'), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !req.file) { if (req.file) await fs.unlink(req.file.path).catch(() => {}); return res.status(404).json({ error: 'Nu există' }); }
  try {
    await ingest(req.file, deck); await save();
    audit.log('deck.replace', { ...meta(req), target: deck.slug, detail: `${req.file.originalname} · v${deck.version}` });
    notifyUpload(req, deck, true);
    res.json(publicDeck(deck, req));
  } catch (e) { await fs.unlink(req.file.path).catch(() => {}); res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message }); }
});

app.patch('/api/decks/:id', need('editor'), express.json(), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Nu există' });
  const { title, slug, settings: st, catalog, lang, reference } = req.body || {};
  const changed = [];
  if (typeof title === 'string' && title.trim()) { deck.title = title.trim().slice(0, 200); changed.push('titlu'); }
  if (typeof catalog === 'string' && catalog.trim()) { deck.catalog = catalog.trim().slice(0, 120); changed.push('catalog'); }
  if (typeof lang === 'string' && LANGS.includes(lang)) { deck.lang = lang; changed.push('limbă'); }
  if (reference === true) { for (const d of db.decks) if (d.catalog === deck.catalog) d.reference = false; deck.reference = true; changed.push('referință'); }
  if (reference === false) deck.reference = false;
  if (typeof slug === 'string') {
    const s = slugify(slug);
    if (db.decks.some((d) => d.slug === s && d.id !== deck.id)) return res.status(409).json({ error: 'Adresa este deja folosită.' });
    if (s !== deck.slug) changed.push(`adresă: ${s}`);
    deck.slug = s;
  }
  if (st && typeof st === 'object') {
    for (const k of Object.keys(PRESENTER_DEFAULTS)) if (k in st && typeof st[k] === typeof PRESENTER_DEFAULTS[k]) { deck.settings[k] = st[k]; changed.push(k); }
  }
  deck.updatedAt = new Date().toISOString();
  await save();
  if (changed.length) audit.log('deck.update', { ...meta(req), target: deck.slug, detail: changed.join(', ') });
  res.json(publicDeck(deck, req));
});

app.get('/api/decks/:id/report', need('viewer'), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !visibleTo(req.user, deck)) return res.status(404).json({ error: 'Nu există' });
  const read = async (d) => JSON.parse(await fs.readFile(path.join(DIRS.analysis, `${d.id}.json`), 'utf8'));
  const a = await read(deck);
  const ref = referenceOf(deck);
  let comparison = null;
  if (ref) { try { comparison = { lang: ref.lang, title: ref.title, issues: compareVariants(await read(ref), a, ref.lang) }; } catch {} }
  res.json({ slug: deck.slug, buttonCount: a.buttonCount, pageCount: a.pageCount, issues: a.issues || [], comparison });
});

app.delete('/api/decks/:id', need('editor'), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Nu există' });
  db.decks.splice(db.decks.indexOf(deck), 1);
  await save();
  await Promise.all([
    fs.unlink(path.join(DIRS.files, deck.file)), fs.unlink(path.join(DIRS.analysis, `${deck.id}.json`)),
    fs.unlink(path.join(DIRS.thumbs, `${deck.id}.png`)),
  ].map((p) => p.catch(() => {})));
  audit.log('deck.delete', { ...meta(req), target: deck.slug, detail: deck.title });
  notifier.event('delete', `Prezentare ștearsă: ${deck.title}`, [`${req.user.username} a șters prezentarea „${deck.title}” (${deck.catalog} · ${deck.lang}).`, 'Dacă a fost o greșeală, o poți recupera din Backup.']);
  res.json({ ok: true });
});

app.post('/api/decks/:id/thumb', need('editor'), express.raw({ type: 'image/png', limit: '5mb' }), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !Buffer.isBuffer(req.body) || req.body.subarray(1, 4).toString() !== 'PNG') return res.status(400).end();
  await fs.writeFile(path.join(DIRS.thumbs, `${deck.id}.png`), req.body);
  deck.hasThumb = true; deck.thumbVersion = Date.now(); await save();
  res.json({ ok: true });
});

app.get('/api/decks/:id/qr.svg', need('viewer'), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !visibleTo(req.user, deck)) return res.status(404).end();
  res.type('image/svg+xml').send(await QRCode.toString(`${baseUrl(req)}/p/${deck.slug}`, { type: 'svg', margin: 1 }));
});

// ================= presenting =================
const viewerHtml = fss.readFileSync(path.join(__dirname, 'public', 'viewer.html'), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const canView = (req, deck) => settings().access === 'public' || deck.settings.publicLink || (req.user && !req.user.mustChangePassword && visibleTo(req.user, deck));
const loginRedirect = (req, res) => res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);

app.get('/p/:slug', (req, res) => {
  const deck = findSlug(req.params.slug);
  if (!deck) return res.status(404).send('Prezentarea nu există.');
  if (!canView(req, deck)) return loginRedirect(req, res);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(viewerHtml
    .replaceAll('{{TITLE}}', esc(deck.title))
    .replaceAll('{{SLUG}}', esc(deck.slug))
    .replaceAll('{{BG}}', esc(deck.settings.background || '#000000'))
    .replaceAll('{{ICON}}', deck.hasThumb ? `/thumbs/${deck.id}.png?v=${deck.thumbVersion}` : '/icon.png'));
});

let statsTimer = null;
app.get('/p/:slug/deck.json', async (req, res) => {
  const deck = findSlug(req.params.slug);
  if (!deck) return res.status(404).json({ error: 'not found' });
  if (!canView(req, deck)) return res.status(401).json({ error: 'auth', login: `/login?next=${encodeURIComponent('/p/' + deck.slug)}` });
  const analysis = JSON.parse(await fs.readFile(path.join(DIRS.analysis, `${deck.id}.json`), 'utf8'));
  if (settings().logViews) {
    audit.log('deck.view', { ...meta(req), target: deck.slug });
    deck.stats.views++; deck.stats.lastViewedAt = new Date().toISOString(); deck.stats.lastViewedBy = req.user?.username || 'link public';
    if (!statsTimer) statsTimer = setTimeout(() => { statsTimer = null; save(); }, 10e3);
  }
  res.set('Cache-Control', 'no-cache');
  const { publicLink, ...presenter } = deck.settings;
  res.json({ title: deck.title, version: deck.version, pdf: `/files/${deck.file}`, settings: presenter, ...analysis });
});

app.get('/p/:slug/manifest.webmanifest', (req, res) => {
  const deck = findSlug(req.params.slug);
  if (!deck) return res.status(404).end();
  const icon = deck.hasThumb ? `/thumbs/${deck.id}.png?v=${deck.thumbVersion}` : '/icon.png';
  res.type('application/manifest+json').json({
    name: deck.title, short_name: deck.title.slice(0, 20), id: `/p/${deck.slug}`,
    start_url: `/p/${deck.slug}`, scope: `/p/${deck.slug}`, display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'], orientation: 'any',
    background_color: deck.settings.background, theme_color: deck.settings.background,
    icons: [{ src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' }],
  });
});

// PDFs and covers follow the same access rule as the presentation they belong to.
const guardByDeck = (pick) => (req, res, next) => {
  const deck = db.decks.find((d) => pick(d, path.basename(req.path)));
  if (!deck) return res.status(404).end();
  if (!canView(req, deck)) return res.status(401).end();
  next();
};
app.use('/files', guardByDeck((d, f) => d.file === f), express.static(DIRS.files, { immutable: true, maxAge: '365d' }));
app.use('/thumbs', guardByDeck((d, f) => f === `${d.id}.png`), express.static(DIRS.thumbs, { maxAge: '7d' }));
// "legacy" build of PDF.js so older iPads (iPadOS 15-16) work too
const PDFJS = path.join(__dirname, 'node_modules', 'pdfjs-dist');
for (const sub of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) app.use(`/vendor/pdfjs/${sub}`, express.static(path.join(PDFJS, sub), { maxAge: '30d' }));
app.use('/vendor/pdfjs', express.static(path.join(PDFJS, 'legacy', 'build'), { maxAge: '30d' }));
app.get('/sw.js', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });

app.get('/', (_req, res) => res.redirect('/admin'));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => {
  if (!req.user) return loginRedirect(req, res);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `PDF-ul depășește ${MAX_MB} MB.` });
  console.error(err);
  res.status(500).json({ error: 'Eroare de server' });
});

// ================= start =================
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const boot = await auth.bootstrap({ username: ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD || '' });
if (boot === 'created') { console.log(`Cont de administrator creat: ${ADMIN_USERNAME}`); audit.log('user.create', { target: ADMIN_USERNAME, detail: 'administrator inițial (ADMIN_PASSWORD)' }); }
if (boot === 'missing') console.warn('ATENȚIE: nu există niciun administrator. Setează ADMIN_PASSWORD și repornește serverul.');
// Emergency access: ADMIN_RESET_PASSWORD resets the administrator's password at start-up (remove it afterwards).
if (process.env.ADMIN_RESET_PASSWORD) {
  const u = auth.byUsername(ADMIN_USERNAME);
  if (u) {
    u.disabled = false;
    await auth.update(u.id, { password: process.env.ADMIN_RESET_PASSWORD }, u.id).catch((e) => console.warn('Resetare eșuată:', e.message));
    if (u.role !== 'admin') { u.role = 'admin'; await auth.users.save(); }
    audit.log('user.update', { target: u.username, detail: 'parolă resetată prin ADMIN_RESET_PASSWORD' });
    console.warn('Parola administratorului a fost resetată din ADMIN_RESET_PASSWORD. Șterge variabila din configurare.');
  }
}
audit.log('system.start');
setTimeout(runAutoBackup, 60e3);            // shortly after start…
setInterval(runAutoBackup, 3600e3).unref(); // …then checked every hour, made once a day

app.listen(PORT, () => console.log(`PDF Deck pornit pe http://localhost:${PORT}  (admin: /admin)`));
