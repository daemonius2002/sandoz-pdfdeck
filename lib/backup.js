// Backups of everything the platform needs to be rebuilt: accounts, settings,
// presentations (PDF + analysis + covers) and the activity log.
// Sessions are left out on purpose: after a restore everyone signs in again.
import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';

const INCLUDE_FILES = ['users.json', 'settings.json', 'decks.json', 'groups.json'];
const INCLUDE_DIRS = ['files', 'analysis', 'thumbs', 'logs'];
const NAME_RE = /^pdfdeck-(auto|manual)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.zip$/;

export class Backups {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dir = path.join(dataDir, 'backups');
    fss.mkdirSync(this.dir, { recursive: true });
    this.running = null;
  }

  async list() {
    const out = [];
    for (const f of await fs.readdir(this.dir)) {
      const m = f.match(NAME_RE);
      if (!m) continue;
      const st = await fs.stat(path.join(this.dir, f));
      out.push({ name: f, kind: m[1], createdAt: st.mtime.toISOString(), size: st.size });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  pathOf(name) {
    if (!NAME_RE.test(name)) return null;
    return path.join(this.dir, name);
  }

  async create(kind = 'manual', keepAuto = 7) {
    if (this.running) return this.running; // never two at once
    this.running = (async () => {
      const zip = new AdmZip();
      for (const f of INCLUDE_FILES) {
        const p = path.join(this.dataDir, f);
        if (fss.existsSync(p)) zip.addLocalFile(p);
      }
      for (const d of INCLUDE_DIRS) {
        const p = path.join(this.dataDir, d);
        if (fss.existsSync(p)) zip.addLocalFolder(p, d);
      }
      zip.addFile('backup.json', Buffer.from(JSON.stringify({ app: 'pdfdeck', format: 1, createdAt: new Date().toISOString(), kind })));
      const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const name = `pdfdeck-${kind}-${stamp}.zip`;
      const tmp = path.join(this.dir, name + '.tmp');
      await zip.writeZipPromise(tmp);
      await fs.rename(tmp, path.join(this.dir, name));
      if (kind === 'auto') await this.prune(keepAuto);
      const st = await fs.stat(path.join(this.dir, name));
      return { name, kind, size: st.size, createdAt: st.mtime.toISOString() };
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async prune(keep) {
    const autos = (await this.list()).filter((b) => b.kind === 'auto');
    for (const b of autos.slice(Math.max(1, keep))) await fs.unlink(path.join(this.dir, b.name)).catch(() => {});
  }

  async remove(name) {
    const p = this.pathOf(name);
    if (!p) throw new Error('Nume de backup invalid.');
    await fs.unlink(p);
  }

  async lastAuto() {
    return (await this.list()).find((b) => b.kind === 'auto') || null;
  }

  // Checks an uploaded archive, then swaps the data in. The caller restarts the process.
  async restore(zipPath) {
    let zip;
    try { zip = new AdmZip(zipPath); } catch { throw new Error('Fișierul nu este o arhivă ZIP validă.'); }
    const entries = zip.getEntries();
    const marker = entries.find((e) => e.entryName === 'backup.json');
    if (!marker) throw new Error('Arhiva nu este un backup al platformei (lipsește backup.json).');
    let info; try { info = JSON.parse(marker.getData().toString('utf8')); } catch { info = null; }
    if (info?.app !== 'pdfdeck') throw new Error('Arhiva nu este un backup al platformei.');
    const users = entries.find((e) => e.entryName === 'users.json');
    if (!users) throw new Error('Backup-ul nu conține utilizatorii.');
    const list = JSON.parse(users.getData().toString('utf8'));
    if (!list.users?.some((u) => u.role === 'admin' && !u.disabled)) throw new Error('Backup-ul nu are niciun administrator activ, deci nu ai mai putea intra.');
    for (const e of entries) {
      const n = path.posix.normalize(e.entryName);
      if (n.startsWith('..') || path.isAbsolute(n)) throw new Error('Arhiva conține căi nepermise.');
    }

    // safety copy of the current state first
    const before = await this.create('manual').catch(() => null);

    const staging = path.join(this.dataDir, 'restore-staging');
    await fs.rm(staging, { recursive: true, force: true });
    zip.extractAllTo(staging, true);
    for (const f of INCLUDE_FILES) {
      const src = path.join(staging, f);
      if (fss.existsSync(src)) await fs.copyFile(src, path.join(this.dataDir, f));
    }
    for (const d of INCLUDE_DIRS) {
      const src = path.join(staging, d), dst = path.join(this.dataDir, d);
      if (!fss.existsSync(src)) continue;
      await fs.rm(dst, { recursive: true, force: true });
      await fs.rename(src, dst).catch(async () => { await fs.cp(src, dst, { recursive: true }); });
    }
    await fs.rm(staging, { recursive: true, force: true });
    await fs.writeFile(path.join(this.dataDir, 'sessions.json'), JSON.stringify({ sessions: {} }));
    return { info, safetyBackup: before?.name || null };
  }
}
