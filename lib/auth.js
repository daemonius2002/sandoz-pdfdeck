// Accounts, roles and sessions.
//   admin  – everything, including users, settings and the log
//   editor – uploads, replaces, edits and deletes presentations
//   viewer – sees the library and presents
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { JsonFile } from './store.js';

const scrypt = promisify(crypto.scrypt);
export const ROLES = ['viewer', 'editor', 'admin'];
export const roleAtLeast = (role, min) => ROLES.indexOf(role) >= ROLES.indexOf(min);

export const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/; // shown as typed, matched without regard to case
// Password rule: at least 8 characters, a lowercase letter, a capital letter and a special character (@ # ! $ …)
export function passwordProblem(pw) {
  if (typeof pw !== 'string') pw = '';
  if (pw.length > 200) return 'Parola este prea lungă.';
  const missing = [];
  if (pw.length < 8) missing.push('cel puțin 8 caractere');
  if (!/[a-z]/.test(pw)) missing.push('o literă mică');
  if (!/[A-Z]/.test(pw)) missing.push('o literă mare');
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push('un caracter special (de ex. @ # ! $)');
  return missing.length ? `Parola nouă trebuie să aibă: ${missing.join(', ')}.` : null;
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, s, k] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const expected = Buffer.from(k, 'base64');
  const key = await scrypt(String(pw), Buffer.from(s, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export class Auth {
  constructor(dir, getSettings) {
    this.users = new JsonFile(`${dir}/users.json`, { users: [] });
    this.sessions = new JsonFile(`${dir}/sessions.json`, { sessions: {} });
    this.getSettings = getSettings;
    this.failures = new Map(); // key -> {count, first, lockedUntil}
    this.dummyHash = null;
    this.touchTimer = null;
  }

  // First start: create the administrator from ADMIN_USERNAME / ADMIN_PASSWORD.
  async bootstrap({ username, password }) {
    if (this.users.data.users.some((u) => u.role === 'admin' && !u.disabled)) return null;
    if (!password) return 'missing';
    const name = (username || 'admin').toLowerCase();
    const existing = this.byUsername(name);
    if (existing) { existing.role = 'admin'; existing.disabled = false; existing.passwordHash = await hashPassword(password); }
    else this.users.data.users.push(await this.#newUser({ username: name, name: 'Administrator', role: 'admin', password, mustChangePassword: false }));
    await this.users.save();
    return 'created';
  }

  async #newUser({ username, name, email = '', role, password, mustChangePassword = true, allDecks = true, groups = [] }) {
    return {
      id: 'u_' + crypto.randomBytes(8).toString('hex'), username, name: name || username, email, role, allDecks, groups,
      passwordHash: await hashPassword(password), disabled: false, mustChangePassword,
      createdAt: new Date().toISOString(), lastLoginAt: null,
    };
  }

  publicUser(u) {
    if (!u) return null;
    const { passwordHash, ...rest } = u;
    const now = Date.now();
    rest.activeSessions = Object.values(this.sessions.data.sessions).filter((s) => s.userId === u.id && Date.parse(s.expiresAt) > now).length;
    return rest;
  }
  list() { return this.users.data.users.map((u) => this.publicUser(u)); }
  byId(id) { return this.users.data.users.find((u) => u.id === id); }
  byUsername(n) { const k = String(n || '').trim().toLowerCase(); return this.users.data.users.find((u) => u.username.toLowerCase() === k); }
  activeAdmins() { return this.users.data.users.filter((u) => u.role === 'admin' && !u.disabled); }

  async create(input) {
    const username = String(input.username || '').trim();
    if (!USERNAME_RE.test(username)) throw new Error('Numele de utilizator: 3–40 caractere, doar litere (fără diacritice), cifre, punct, minus sau underscore.');
    if (this.byUsername(username)) throw new Error('Există deja un utilizator cu acest nume.');
    if (!ROLES.includes(input.role)) throw new Error('Rol necunoscut.');
    const p = passwordProblem(input.password); if (p) throw new Error(p);
    const u = await this.#newUser({
      username, name: String(input.name || '').trim().slice(0, 80), email: String(input.email || '').trim().slice(0, 120),
      role: input.role, password: input.password, mustChangePassword: input.mustChangePassword !== false,
      allDecks: input.allDecks !== false, groups: Array.isArray(input.groups) ? input.groups.map(String) : [],
    });
    this.users.data.users.push(u);
    await this.users.save();
    return u;
  }

  async update(id, patch, actorId) {
    const u = this.byId(id);
    if (!u) throw new Error('Utilizatorul nu există.');
    const changes = [];
    if (typeof patch.name === 'string') { u.name = patch.name.trim().slice(0, 80) || u.username; changes.push('nume'); }
    if (typeof patch.email === 'string') { u.email = patch.email.trim().slice(0, 120); changes.push('email'); }
    if (typeof patch.allDecks === 'boolean' && patch.allDecks !== (u.allDecks !== false)) { u.allDecks = patch.allDecks; changes.push(patch.allDecks ? 'acces: toate prezentările' : 'acces: doar grupurile alese'); }
    if (Array.isArray(patch.groups)) { u.groups = [...new Set(patch.groups.map(String))]; changes.push('grupuri'); }
    if (patch.role && patch.role !== u.role) {
      if (!ROLES.includes(patch.role)) throw new Error('Rol necunoscut.');
      if (u.role === 'admin' && this.activeAdmins().length <= 1) throw new Error('Trebuie să rămână cel puțin un administrator activ.');
      if (id === actorId) throw new Error('Nu îți poți schimba propriul rol.');
      u.role = patch.role; changes.push('rol: ' + patch.role);
    }
    if (typeof patch.disabled === 'boolean' && patch.disabled !== u.disabled) {
      if (id === actorId) throw new Error('Nu îți poți dezactiva propriul cont.');
      if (patch.disabled && u.role === 'admin' && this.activeAdmins().length <= 1) throw new Error('Trebuie să rămână cel puțin un administrator activ.');
      u.disabled = patch.disabled; changes.push(patch.disabled ? 'dezactivat' : 'reactivat');
      if (patch.disabled) this.revokeUser(id);
    }
    if (patch.password) {
      const p = passwordProblem(patch.password); if (p) throw new Error(p);
      u.passwordHash = await hashPassword(patch.password);
      u.mustChangePassword = id !== actorId;
      this.revokeUser(id);
      changes.push('parolă resetată');
    }
    await this.users.save();
    return { user: u, changes };
  }

  async remove(id, actorId) {
    const u = this.byId(id);
    if (!u) throw new Error('Utilizatorul nu există.');
    if (id === actorId) throw new Error('Nu îți poți șterge propriul cont.');
    if (u.role === 'admin' && !u.disabled && this.activeAdmins().length <= 1) throw new Error('Trebuie să rămână cel puțin un administrator activ.');
    this.users.data.users = this.users.data.users.filter((x) => x.id !== id);
    this.revokeUser(id);
    await this.users.save();
    return u;
  }

  async removeGroupEverywhere(groupId) {
    for (const u of this.users.data.users) if (u.groups?.includes(groupId)) u.groups = u.groups.filter((g) => g !== groupId);
    await this.users.save();
  }

  async changeOwnPassword(id, current, next, keepToken) {
    const u = this.byId(id);
    if (!u || !(await verifyPassword(current, u.passwordHash))) throw new Error('Parola actuală nu este corectă.');
    const p = passwordProblem(next); if (p) throw new Error(p);
    if (current === next) throw new Error('Parola nouă trebuie să fie diferită de cea actuală.');
    u.passwordHash = await hashPassword(next);
    u.mustChangePassword = false;
    this.revokeUser(id, keepToken);
    await this.users.save();
  }

  // ---------------- login & lockout ----------------
  lockState(key) {
    const s = this.getSettings().security;
    const f = this.failures.get(key);
    if (!f) return null;
    if (f.lockedUntil && f.lockedUntil > Date.now()) return f.lockedUntil;
    if (Date.now() - f.first > s.lockMinutes * 60e3) this.failures.delete(key);
    return null;
  }
  #fail(key) {
    const s = this.getSettings().security;
    const f = this.failures.get(key) || { count: 0, first: Date.now(), lockedUntil: 0 };
    f.count++;
    // an office shares one IP: the address is blocked only after many more attempts than one account
    const limit = key.startsWith('ip:') ? s.maxAttempts * 4 : s.maxAttempts;
    if (f.count >= limit) { f.lockedUntil = Date.now() + s.lockMinutes * 60e3; f.count = 0; f.first = Date.now(); }
    this.failures.set(key, f);
    return f.lockedUntil > Date.now();
  }

  async login(username, password, meta) {
    const name = String(username || '').trim().toLowerCase();
    const keys = [`u:${name}`, `ip:${meta.ip}`];
    for (const k of keys) { const until = this.lockState(k); if (until) return { ok: false, locked: until }; }
    const u = this.byUsername(name);
    this.dummyHash ??= await hashPassword('dummy-password-0');
    const good = await verifyPassword(password, u ? u.passwordHash : this.dummyHash); // same timing for unknown users
    if (!u || !good || u.disabled) {
      const locked = keys.map((k) => this.#fail(k)).some(Boolean);
      return { ok: false, reason: u?.disabled && good ? 'disabled' : 'bad', locked: locked ? Date.now() + this.getSettings().security.lockMinutes * 60e3 : null, user: u };
    }
    keys.forEach((k) => this.failures.delete(k));
    u.lastLoginAt = new Date().toISOString();
    await this.users.save();
    const token = crypto.randomBytes(32).toString('base64url');
    const days = this.getSettings().security.sessionDays;
    this.sessions.data.sessions[sha(token)] = {
      id: crypto.randomBytes(6).toString('hex'), userId: u.id, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + days * 864e5).toISOString(), lastSeen: new Date().toISOString(),
      ip: meta.ip, ua: String(meta.ua || '').slice(0, 200),
    };
    this.#prune();
    await this.sessions.save();
    return { ok: true, token, user: u, maxAge: days * 86400 };
  }

  sessionFor(token) {
    if (!token) return null;
    const h = sha(token);
    const s = this.sessions.data.sessions[h];
    if (!s) return null;
    if (Date.parse(s.expiresAt) < Date.now()) { delete this.sessions.data.sessions[h]; this.sessions.save(); return null; }
    const u = this.byId(s.userId);
    if (!u || u.disabled) return null;
    // remember activity, but write to disk at most once a minute
    s.lastSeen = new Date().toISOString();
    if (!this.touchTimer) this.touchTimer = setTimeout(() => { this.touchTimer = null; this.sessions.save(); }, 60e3);
    return { session: s, hash: h, user: u };
  }
  async logout(token) {
    if (!token) return;
    delete this.sessions.data.sessions[sha(token)];
    await this.sessions.save();
  }
  revokeUser(userId, keepToken = null) {
    const keep = keepToken ? sha(keepToken) : null;
    for (const [h, s] of Object.entries(this.sessions.data.sessions)) if (s.userId === userId && h !== keep) delete this.sessions.data.sessions[h];
    this.sessions.save();
  }
  listSessions() {
    const now = Date.now();
    return Object.values(this.sessions.data.sessions).filter((s) => Date.parse(s.expiresAt) > now)
      .map((s) => ({ ...s, username: this.byId(s.userId)?.username })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }
  revokeSession(id) {
    for (const [h, s] of Object.entries(this.sessions.data.sessions)) if (s.id === id) { delete this.sessions.data.sessions[h]; this.sessions.save(); return s; }
    return null;
  }
  #prune() {
    const now = Date.now();
    for (const [h, s] of Object.entries(this.sessions.data.sessions)) if (Date.parse(s.expiresAt) < now) delete this.sessions.data.sessions[h];
  }
}
