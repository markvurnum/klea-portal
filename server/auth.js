// Authentication: real logins with roles, no external dependencies.
// Passwords are hashed with scrypt (built into Node), tokens are random hex.
import crypto from 'crypto';
import { getDb, save, nextId } from './db.js';

const TOKEN_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  // timing-safe compare
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueToken(db, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_DAYS * 864e5).toISOString();
  if (!db.sessions) db.sessions = [];
  db.sessions.push({ token, userId: user.id, expires });
  // tidy expired sessions as we go
  db.sessions = db.sessions.filter(s => s.expires > new Date().toISOString());
  return token;
}

export function userFromToken(token) {
  const db = getDb();
  if (!token) return null;
  const session = (db.sessions || []).find(s => s.token === token);
  if (!session || session.expires < new Date().toISOString()) return null;
  const user = (db.users || []).find(u => u.id === session.userId && u.active !== false);
  return user || null;
}

// Attaches req.user when a valid token is present. Never blocks.
export function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = userFromToken(token);
  next();
}

// Route guard factory. requireRole('admin','office') etc.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to that.' });
    }
    next();
  };
}

// A kleaner may only ever touch their own staff record
export function requireSelfOrOffice(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (req.user.role === 'kleaner') {
    const wanted = +(req.params.id || req.params.staffId);
    if (req.user.staffId !== wanted) return res.status(403).json({ error: 'You can only view your own record.' });
  }
  next();
}

// Audit trail: who did what, when
export function logAction(action, detail, req) {
  const db = getDb();
  if (!db.activity) db.activity = [];
  db.activity.push({
    id: nextId('activity'),
    action,
    detail,
    userId: req?.user?.id || null,
    userName: req?.user?.name || 'System',
    at: new Date().toISOString()
  });
  if (db.activity.length > 500) db.activity = db.activity.slice(-500);
}

export function seedUsers(db) {
  if (db.users && db.users.length) return;
  db.users = [];
  const add = (name, email, password, role, staffId = null) => {
    db.users.push({
      id: nextId('users'), name, email: email.toLowerCase(),
      password: hashPassword(password), role, staffId, active: true
    });
  };
  add('Klea Office', 'hello@kleahome.co.uk', 'KleaAdmin2026!', 'admin');
  add('Danielle Gough', 'danielle@kleahome.co.uk', 'KleaOffice2026!', 'office');
  for (const s of db.staff) {
    const first = s.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    add(s.name, `${first}@kleahome.co.uk`, 'Kleaner2026!', 'kleaner', s.id);
  }
}
