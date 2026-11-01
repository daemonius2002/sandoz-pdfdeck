// Email notifications. The mail server is configured only through environment
// variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE),
// so passwords never end up in the data folder or in backups.
import nodemailer from 'nodemailer';

export const NOTIFY_EVENTS = {
  locked: 'Un cont a fost blocat după prea multe parole greșite',
  failedBurst: 'Multe autentificări eșuate într-o oră (posibilă încercare de spargere)',
  upload: 'A fost încărcată o prezentare nouă sau o versiune nouă',
  delete: 'A fost ștearsă o prezentare',
  users: 'A fost creat, șters sau dezactivat un utilizator',
  backupFailed: 'Backup-ul automat nu a reușit',
};

export class Notifier {
  constructor(getSettings, siteUrl) {
    this.getSettings = getSettings;
    this.siteUrl = siteUrl;
    this.lastSent = new Map(); // throttle key -> time
    const env = process.env;
    this.configured = !!(env.SMTP_HOST && env.SMTP_FROM);
    this.from = env.SMTP_FROM || '';
    if (this.configured) {
      const port = Number(env.SMTP_PORT || 587);
      this.transport = nodemailer.createTransport({
        host: env.SMTP_HOST, port,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
        connectionTimeout: 15000,
      });
    }
  }

  status() {
    return { configured: this.configured, from: this.from, host: process.env.SMTP_HOST || null };
  }

  recipients() {
    return (this.getSettings().notify?.recipients || []).filter(Boolean);
  }

  async send(subject, lines, { to } = {}) {
    if (!this.configured) throw new Error('Serverul de email nu este configurat (variabilele SMTP_HOST și SMTP_FROM).');
    const rcpt = to || this.recipients();
    if (!rcpt.length) throw new Error('Nu există destinatari pentru notificări.');
    const site = this.getSettings().siteName || 'SANDOZ PRESENTING DECK';
    const url = this.siteUrl();
    const text = `${lines.join('\n')}\n\n—\n${site}${url ? `\n${url}/admin` : ''}\nPrimești acest mesaj pentru că adresa ta este în lista de notificări a platformei.`;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#161a24">
      ${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('')}
      <p style="margin:18px 0 0;color:#5a6274;font-size:13px">${esc(site)}${url ? ` · <a href="${esc(url)}/admin">${esc(url)}/admin</a>` : ''}</p></div>`;
    await this.transport.sendMail({ from: this.from, to: rcpt.join(', '), subject: `[${site}] ${subject}`, text, html });
  }

  // Fire-and-forget event notification, at most once per `throttleMin` per key.
  event(type, subject, lines, { throttleKey = null, throttleMin = 60 } = {}) {
    const cfg = this.getSettings().notify || {};
    if (!this.configured || !cfg.events?.[type] || !this.recipients().length) return;
    const key = throttleKey ? `${type}:${throttleKey}` : null;
    if (key) {
      const last = this.lastSent.get(key);
      if (last && Date.now() - last < throttleMin * 60e3) return;
      this.lastSent.set(key, Date.now());
    }
    this.send(subject, lines).catch((e) => console.error('email failed:', e.message));
  }
}
