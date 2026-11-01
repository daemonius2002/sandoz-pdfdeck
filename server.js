import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { analyzePdf, compareVariants } from './lib/analyze.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 500);
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('pdfdeck:' + ADMIN_PASSWORD).digest('hex');

const DIRS = { files: path.join(DATA_DIR, 'files'), analysis: path.join(DATA_DIR, 'analysis'), thumbs: path.join(DATA_DIR, 'thumbs'), tmp: path.join(DATA_DIR, 'tmp') };
for (const d of Object.values(DIRS)) fss.mkdirSync(d, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'decks.json');

const DEFAULT_SETTINGS = {
  swipe: true,              // swipe left/right to change page
  tapZones: false,          // tap left/right edge to change page
  resetOnPageEnter: true,   // pop-ups (show/hide) start closed every time you enter a page
  transition: 'slide',      // slide | fade | none (a transition set in the PDF wins)
  pageIndicator: false,     // small "3 / 12" in the corner
  background: '#000000',
};

// ---------------- tiny JSON "database" ----------------
let db = { decks: [] };
try { db = JSON.parse(await fs.readFile(DB_FILE, 'utf8')); } catch { /* first run */ }
for (const d of db.decks) { d.catalog ??= d.title; d.lang ??= 'XX'; d.reference ??= false; }
let saving = Promise.resolve();
const save = () => (saving = saving.then(async () => {
  const tmp = DB_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}));
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

// ---------------- auth ----------------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const makeToken = () => { const exp = String(Date.now() + 30 * 864e5); return `${exp}.${sign(exp)}`; };
const validToken = (t) => {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
};
const cookie = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const requireAdmin = (req, res, next) => {
  if (!ADMIN_PASSWORD || validToken(cookie(req, 'pdfdeck_admin'))) return next();
  res.status(401).json({ error: 'auth' });
};

// ---------------- app ----------------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const upload = multer({
  dest: DIRS.tmp,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /pdf$/i.test(file.mimetype) || /\.pdf$/i.test(file.originalname)),
});
const baseUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const publicDeck = (d, req) => ({ ...d, url: `${baseUrl(req)}/p/${d.slug}` });

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

app.post('/api/login', express.json(), (req, res) => {
  const pw = String(req.body?.password || '');
  const ok = ADMIN_PASSWORD && pw.length === ADMIN_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
  if (!ok) return res.status(401).json({ error: 'Parolă greșită' });
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `pdfdeck_admin=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${secure}`);
  res.json({ ok: true });
});
app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'pdfdeck_admin=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ authRequired: !!ADMIN_PASSWORD, ok: !ADMIN_PASSWORD || validToken(cookie(req, 'pdfdeck_admin')) }));

app.get('/api/decks', requireAdmin, (req, res) => {
  res.json([...db.decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((d) => publicDeck(d, req)));
});

app.post('/api/decks', requireAdmin, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Alege un fișier PDF.' });
  const base = req.file.originalname.replace(/\.pdf$/i, '');
  const title = (req.body.title || base.replace(/_+/g, ' ')).trim();
  const catalog = (req.body.catalog || '').trim() || db.decks[0]?.catalog || base;
  const lang = LANGS.includes(req.body.lang) ? req.body.lang : guessLang(base);
  // same catalog + language again => new version of that presentation (same link)
  const existing = db.decks.find((d) => d.catalog === catalog && d.lang === lang);
  if (existing) {
    try { await ingest(req.file, existing); await save(); return res.json(publicDeck(existing, req)); }
    catch (e) { await fs.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message }); }
  }
  const deck = {
    id: crypto.randomBytes(6).toString('hex'), title, catalog, lang, reference: false,
    slug: uniqueSlug(slugify(`${catalog}-${lang}`)),
    createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS },
  };
  try {
    await ingest(req.file, deck);
    db.decks.push(deck); await save();
    res.json(publicDeck(deck, req));
  } catch (e) {
    await fs.unlink(req.file.path).catch(() => {});
    res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message });
  }
});

app.put('/api/decks/:id/file', requireAdmin, upload.single('pdf'), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !req.file) { if (req.file) await fs.unlink(req.file.path).catch(() => {}); return res.status(404).json({ error: 'Nu există' }); }
  try { await ingest(req.file, deck); await save(); res.json(publicDeck(deck, req)); }
  catch (e) { await fs.unlink(req.file.path).catch(() => {}); res.status(400).json({ error: 'Nu am putut citi PDF-ul: ' + e.message }); }
});

app.patch('/api/decks/:id', requireAdmin, express.json(), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Nu există' });
  const { title, slug, settings, catalog, lang, reference } = req.body || {};
  if (typeof title === 'string' && title.trim()) deck.title = title.trim().slice(0, 200);
  if (typeof catalog === 'string' && catalog.trim()) deck.catalog = catalog.trim().slice(0, 120);
  if (typeof lang === 'string' && LANGS.includes(lang)) deck.lang = lang;
  if (reference === true) { for (const d of db.decks) if (d.catalog === deck.catalog) d.reference = false; deck.reference = true; }
  if (reference === false) deck.reference = false;
  if (typeof slug === 'string') {
    const s = slugify(slug);
    if (db.decks.some((d) => d.slug === s && d.id !== deck.id)) return res.status(409).json({ error: 'Adresa este deja folosită.' });
    deck.slug = s;
  }
  if (settings && typeof settings === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in settings && typeof settings[k] === typeof DEFAULT_SETTINGS[k]) deck.settings[k] = settings[k];
    }
  }
  deck.updatedAt = new Date().toISOString();
  await save();
  res.json(publicDeck(deck, req));
});

app.get('/api/decks/:id/report', requireAdmin, async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Nu există' });
  const read = async (d) => JSON.parse(await fs.readFile(path.join(DIRS.analysis, `${d.id}.json`), 'utf8'));
  const a = await read(deck);
  const ref = referenceOf(deck);
  let comparison = null;
  if (ref) { try { comparison = { lang: ref.lang, title: ref.title, issues: compareVariants(await read(ref), a, ref.lang) }; } catch {} }
  res.json({ slug: deck.slug, buttonCount: a.buttonCount, pageCount: a.pageCount, issues: a.issues || [], comparison });
});

app.delete('/api/decks/:id', requireAdmin, async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Nu există' });
  db.decks = db.decks.filter((d) => d !== deck);
  await save();
  await Promise.all([
    fs.unlink(path.join(DIRS.files, deck.file)), fs.unlink(path.join(DIRS.analysis, `${deck.id}.json`)),
    fs.unlink(path.join(DIRS.thumbs, `${deck.id}.png`)),
  ].map((p) => p.catch(() => {})));
  res.json({ ok: true });
});

app.post('/api/decks/:id/thumb', requireAdmin, express.raw({ type: 'image/png', limit: '5mb' }), async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck || !Buffer.isBuffer(req.body) || req.body.subarray(1, 4).toString() !== 'PNG') return res.status(400).end();
  await fs.writeFile(path.join(DIRS.thumbs, `${deck.id}.png`), req.body);
  deck.hasThumb = true; deck.thumbVersion = Date.now(); await save();
  res.json({ ok: true });
});

app.get('/api/decks/:id/qr.svg', requireAdmin, async (req, res) => {
  const deck = findDeck(req.params.id);
  if (!deck) return res.status(404).end();
  res.type('image/svg+xml').send(await QRCode.toString(`${baseUrl(req)}/p/${deck.slug}`, { type: 'svg', margin: 1 }));
});

// ---------------- public (presentation) ----------------
const viewerHtml = fss.readFileSync(path.join(__dirname, 'public', 'viewer.html'), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.get('/p/:slug', (req, res) => {
  const deck = findSlug(req.params.slug);
  if (!deck) return res.status(404).send('Prezentarea nu există.');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(viewerHtml
    .replaceAll('{{TITLE}}', esc(deck.title))
    .replaceAll('{{SLUG}}', esc(deck.slug))
    .replaceAll('{{BG}}', esc(deck.settings.background || '#000000'))
    .replaceAll('{{ICON}}', deck.hasThumb ? `/thumbs/${deck.id}.png?v=${deck.thumbVersion}` : '/icon.png'));
});

app.get('/p/:slug/deck.json', async (req, res) => {
  const deck = findSlug(req.params.slug);
  if (!deck) return res.status(404).json({ error: 'not found' });
  const analysis = JSON.parse(await fs.readFile(path.join(DIRS.analysis, `${deck.id}.json`), 'utf8'));
  res.set('Cache-Control', 'no-cache');
  res.json({ title: deck.title, version: deck.version, pdf: `/files/${deck.file}`, settings: { ...DEFAULT_SETTINGS, ...deck.settings }, ...analysis });
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

app.use('/files', express.static(DIRS.files, { immutable: true, maxAge: '365d' }));
app.use('/thumbs', express.static(DIRS.thumbs, { maxAge: '7d' }));
// "legacy" build of PDF.js so older iPads (iPadOS 15-16) work too
const PDFJS = path.join(__dirname, 'node_modules', 'pdfjs-dist');
for (const sub of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) app.use(`/vendor/pdfjs/${sub}`, express.static(path.join(PDFJS, sub), { maxAge: '30d' }));
app.use('/vendor/pdfjs', express.static(path.join(PDFJS, 'legacy', 'build'), { maxAge: '30d' }));
app.get('/sw.js', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.get('/', (_req, res) => res.redirect('/admin'));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `PDF-ul depășește ${MAX_MB} MB.` });
  console.error(err);
  res.status(500).json({ error: 'Eroare de server' });
});

app.listen(PORT, () => {
  console.log(`PDF Deck pornit pe http://localhost:${PORT}  (admin: /admin)`);
  if (!ADMIN_PASSWORD) console.warn('ATENȚIE: ADMIN_PASSWORD nu este setat — pagina de administrare este deschisă oricui.');
});
