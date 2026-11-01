// Small JSON-file store: atomic writes, one write at a time per file.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';

export class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    this.queue = Promise.resolve();
    try { this.data = JSON.parse(fss.readFileSync(file, 'utf8')); }
    catch { this.data = structuredClone(fallback); }
  }
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, this.file);
    }).catch((e) => console.error('save failed', this.file, e));
    return this.queue;
  }
}
