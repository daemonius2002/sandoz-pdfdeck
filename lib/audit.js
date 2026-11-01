// Append-only activity log, one JSON line per event, one file per month.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';

export const EVENT_LABELS = {
  'auth.login': 'Autentificare',
  'auth.login_failed': 'Autentificare eșuată',
  'auth.locked': 'Cont blocat temporar',
  'auth.logout': 'Deconectare',
  'auth.password_changed': 'Parolă schimbată',
  'user.create': 'Utilizator creat',
  'user.update': 'Utilizator modificat',
  'user.delete': 'Utilizator șters',
  'session.revoke': 'Sesiune închisă',
  'deck.upload': 'Prezentare încărcată',
  'deck.replace': 'Versiune nouă încărcată',
  'deck.update': 'Prezentare modificată',
  'deck.delete': 'Prezentare ștearsă',
  'deck.view': 'Prezentare deschisă',
  'settings.update': 'Setări modificate',
  'group.create': 'Grup creat',
  'group.update': 'Grup modificat',
  'group.delete': 'Grup șters',
  'backup.create': 'Backup creat',
  'backup.download': 'Backup descărcat',
  'backup.delete': 'Backup șters',
  'backup.restore': 'Backup restaurat',
  'notify.test': 'Email de test trimis',
  'system.start': 'Server pornit',
};

export class Audit {
  constructor(dir) {
    this.dir = path.join(dir, 'logs');
    fss.mkdirSync(this.dir, { recursive: true });
    this.queue = Promise.resolve();
  }
  file(d = new Date()) { return path.join(this.dir, `audit-${d.toISOString().slice(0, 7)}.jsonl`); }

  log(type, { user = null, ip = null, target = null, detail = null, ok = true } = {}) {
    const entry = { at: new Date().toISOString(), type, user: user ? { id: user.id, username: user.username } : null, ip, target, detail, ok };
    const line = JSON.stringify(entry) + '\n';
    this.queue = this.queue.then(() => fs.appendFile(this.file(), line)).catch((e) => console.error('audit write failed', e));
    return entry;
  }

  // Newest first. Reads month files from newest to oldest until `limit` matches.
  async query({ limit = 200, type = '', user = '', q = '', since = null } = {}) {
    await this.queue;
    const files = (await fs.readdir(this.dir)).filter((f) => /^audit-\d{4}-\d{2}\.jsonl$/.test(f)).sort().reverse();
    const out = [];
    const needle = q.toLowerCase();
    for (const f of files) {
      const lines = (await fs.readFile(path.join(this.dir, f), 'utf8')).split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        if (!lines[i]) continue;
        let e; try { e = JSON.parse(lines[i]); } catch { continue; }
        if (since && e.at < since) return out;
        if (type && !(type.endsWith('.') ? e.type.startsWith(type) : e.type === type)) continue;
        if (user && e.user?.username?.toLowerCase() !== user.toLowerCase()) continue;
        if (needle && !JSON.stringify(e).toLowerCase().includes(needle)) continue;
        out.push(e);
      }
      if (out.length >= limit) break;
    }
    return out;
  }
}
