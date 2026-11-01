// Approximate location (country, city, coordinates) of an IP address, looked up
// on this server in the free DB-IP "IP to City Lite" database (CC BY 4.0).
// No IP address is sent to any outside service. The database (~120 MB) is
// downloaded into DATA_DIR/geo on first start and refreshed once a month.
// GEOIP_DB_PATH=/path/to/file.mmdb uses another database (e.g. MaxMind GeoLite2-City);
// GEOIP=off switches location off.
import maxmind from 'maxmind';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^169\.254\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i, /^0\./];

export class Geo {
  constructor(dataDir, { dbPath = process.env.GEOIP_DB_PATH, disabled = process.env.GEOIP === 'off' } = {}) {
    this.dir = path.join(dataDir, 'geo');
    this.custom = !!dbPath;
    this.file = dbPath || path.join(this.dir, 'dbip-city-lite.mmdb');
    this.disabled = disabled;
    this.reader = null;
    this.updatedAt = null;
    this.downloading = null;
    this.lastError = null;
  }

  async start() {
    if (this.disabled) return;
    await this.open();
    if (this.custom) return;
    this.refreshIfOld();
    setInterval(() => this.refreshIfOld(), 24 * 3600e3).unref();
  }

  async open() {
    if (!fss.existsSync(this.file)) return false;
    try {
      this.reader = await maxmind.open(this.file, { watchForUpdates: false });
      this.updatedAt = (await fs.stat(this.file)).mtime.toISOString();
      return true;
    } catch (e) { this.lastError = e.message; console.warn('geo: cannot open database:', e.message); return false; }
  }

  async refreshIfOld() {
    if (fss.existsSync(this.file)) {
      const age = Date.now() - (await fs.stat(this.file)).mtimeMs;
      if (age < 32 * 864e5) return;
    }
    return this.download();
  }

  download() {
    if (this.downloading) return this.downloading;
    this.downloading = (async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const months = [0, 1, 2].map((back) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); });
      for (const m of months) {
        const url = `https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`;
        try {
          const res = await fetch(url);
          if (!res.ok || !res.body) continue;
          const tmp = this.file + '.download';
          await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fss.createWriteStream(tmp));
          await maxmind.open(tmp); // refuse a broken file before replacing the good one
          await fs.rename(tmp, this.file);
          await this.open();
          this.lastError = null;
          console.log(`geo: location database updated (${m})`);
          return true;
        } catch (e) { this.lastError = e.message; }
      }
      console.warn('geo: location database could not be downloaded', this.lastError || '');
      return false;
    })().finally(() => { this.downloading = null; });
    return this.downloading;
  }

  lookup(ip) {
    if (!ip || this.disabled) return null;
    ip = String(ip).replace(/^::ffff:/, '');
    if (PRIVATE.some((re) => re.test(ip))) return { local: true };
    if (!this.reader || !maxmind.validate(ip)) return null;
    let r;
    try { r = this.reader.get(ip); } catch { return null; }
    if (!r) return null;
    const out = {
      cc: r.country?.iso_code || null,
      country: r.country?.names?.en || null,
      region: r.subdivisions?.[0]?.names?.en || null,
      city: r.city?.names?.en || null,
      lat: r.location?.latitude ?? null,
      lon: r.location?.longitude ?? null,
    };
    return out.cc || out.city ? out : null;
  }

  label(g) {
    if (!g) return '';
    if (g.local) return 'rețea locală';
    return [g.city, g.country].filter(Boolean).join(', ');
  }

  status() {
    return { enabled: !this.disabled, ready: !!this.reader, source: this.custom ? 'custom' : 'DB-IP Lite', updatedAt: this.updatedAt, downloading: !!this.downloading };
  }
}
