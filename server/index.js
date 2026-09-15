import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDb, getDb, save, nextId } from './db.js';
import { seed } from './seed.js';
import { SERVICES, ADDONS, FREQUENCIES, FAQS, quote, checklistFor } from './catalogue.js';
import { proximityScore, proximityLabel, outcode } from './geo.js';
import {
  isConfigured as guestyConfigured, fetchListings, fetchReservations, importReservations,
  CHANGEOVER_START, CHANGEOVER_END,
  WEBHOOK_EVENTS, listWebhooks, createWebhook, deleteWebhook, fetchWebhookSecret,
  verifyWebhookSignature, alreadySeen, normaliseWebhookReservation,
  cacheListings, cachedListings
} from './guesty.js';
import crypto from 'crypto';
import { attachUser, requireRole, requireSelfOrOffice, verifyPassword, hashPassword, issueToken, logAction, seedUsers } from './auth.js';
import { isEmailConfigured, safeEmailSettings, sendMail, queueMail } from './mailer.js';
import {
  isStripeConfigured, safeStripeSettings, checkStripeKey,
  createCheckoutSession, retrieveSession, verifyStripeSignature
} from './payments.js';
import { isSmsConfigured, safeSmsSettings, sendSms, tidyNumber, smsSettings } from './sms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Behind Railway's proxy, so req.ip reflects the real client rather than the edge
app.set('trust proxy', true);

// Keep the portal out of search results
app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// Photo uploads arrive as data URLs, hence the generous limit. The Guesty
// webhook signature is computed over the raw bytes, so those are kept aside
// before the body is parsed.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.url.startsWith('/api/guesty/webhook') || req.url.startsWith('/api/stripe/webhook')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(attachUser);

loadDb(seed);
seedUsers(getDb());
save();

// Every message to a client goes through here: it is written down, and if the
// mailbox is connected it is also sent. With email switched off this behaves
// exactly as it did before, storing the message without sending it.
function notifyClient(db, { clientId, bookingId = null, channel = 'email', subject, body, preferSms = false }) {
  const client = db.clients.find(c => c.id === +clientId);

  // A few messages are better as a text, but only if the office has switched
  // texts on and is happy to pay for them. Otherwise it goes by email, free.
  const byText = preferSms && isSmsConfigured(db)
    && smsSettings(db).remindersByText && tidyNumber(client?.phone);

  const m = {
    id: nextId('messages'), clientId: +clientId, bookingId,
    channel: byText ? 'sms' : channel, direction: 'out', body,
    subject: subject || 'Klea',
    createdAt: new Date().toISOString(),
    emailStatus: 'not sent'
  };
  db.messages.push(m);

  if (byText) {
    m.emailStatus = 'sending';
    m.smsStatus = 'sending';
    sendSms({ to: client.phone, body }, db)
      .then(() => { m.smsStatus = 'sent'; m.emailStatus = 'sent'; db.settings.sms.lastSentAt = new Date().toISOString(); db.settings.sms.lastError = null; save(); })
      .catch(err => {
        m.smsStatus = 'failed'; m.emailStatus = 'failed'; m.emailError = err.message;
        db.settings.sms.lastError = { message: err.message, at: new Date().toISOString() };
        console.error('Text failed:', err.message);
        save();
      });
    return m;
  }

  const to = (client?.email || '').trim();
  if (!isEmailConfigured(db)) return m;
  if (!to) { m.emailStatus = 'no email address'; return m; }
  // A Guesty property is a placeholder address, not a real inbox
  if (/@guesty\.local$/i.test(to)) { m.emailStatus = 'no email address'; return m; }

  m.emailStatus = 'sending';
  queueMail({ to, toName: client.name, subject: m.subject, text: body, messageRef: m.id });
  return m;
}

const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const round2 = n => Math.round(n * 100) / 100;

// ---------- Legal / compliance ----------
// A check "warns" 60 days before its renewal date and "fails" once overdue/missing.
function checkDate(label, dateStr, { renewal = false } = {}) {
  if (!dateStr) return { label, state: 'missing', detail: 'Not on file' };
  if (!renewal) return { label, state: 'ok', detail: dateStr };
  const days = Math.floor((new Date(dateStr) - Date.now()) / 864e5);
  if (days < 0) return { label, state: 'overdue', detail: `Was due ${dateStr}` };
  if (days <= 60) return { label, state: 'due-soon', detail: `Due ${dateStr} (${days} days)` };
  return { label, state: 'ok', detail: `Renew by ${dateStr}` };
}

function complianceFor(s) {
  const l = s.legal || {};
  return [
    checkDate('DBS check' + (l.dbs?.status ? ` (${l.dbs.status})` : ''), l.dbs?.recheckDue, { renewal: true }),
    checkDate('Right to work verified', l.rightToWork?.checkedOn),
    checkDate('Contract signed', l.contract?.signedOn),
    checkDate('COSHH training', l.training?.coshh),
    checkDate('Health and safety training', l.training?.healthSafety)
  ];
}

function companyLegalStatus() {
  const db = getDb();
  return (db.settings.companyLegal || []).map(doc => ({
    ...doc,
    ...checkDate(doc.name, doc.expires, { renewal: true })
  }));
}

// Policy: free until midday the day before the clean, 50% after that.
function cancelDeadline(b) {
  const deadline = new Date(b.date + 'T12:00:00');
  deadline.setDate(deadline.getDate() - 1);
  return deadline;
}

function applyCancellation(db, b) {
  b.cancellationFee = Date.now() < cancelDeadline(b).getTime() ? 0 : round2(b.price * 0.5);
  const pay = db.payments.find(p => p.bookingId === b.id);
  if (pay) { pay.amount = b.cancellationFee; pay.status = b.cancellationFee > 0 ? 'cancellation fee (demo)' : 'refunded (demo)'; }
}

// Weekend cleans can pay a different rate when one is set on the cleaner
function rateFor(s, dateISO) {
  const day = new Date(dateISO + 'T12:00:00').getDay();
  return (day === 0 || day === 6) && s.weekendRate ? s.weekendRate : (s.rate || 0);
}

function staffEarnings(s) {
  const db = getDb();
  const done = db.bookings.filter(b => b.staffId === s.id && b.status === 'completed');
  const extras = (db.timesheets || []).filter(t => t.staffId === s.id);
  const jobHours = done.reduce((t, b) => t + b.durationMins / 60, 0);
  const extraHours = extras.reduce((t, e) => t + e.hours, 0);
  const earned = round2(
    done.reduce((t, b) => t + (b.durationMins / 60) * rateFor(s, b.date), 0) +
    extras.reduce((t, e) => t + e.hours * rateFor(s, e.date), 0)
  );
  const paid = round2((db.payouts || []).filter(p => p.staffId === s.id).reduce((t, p) => t + p.amount, 0));
  return { jobsDone: done.length, hours: round2(jobHours + extraHours), earned, paid, due: round2(earned - paid) };
}

// ---------- Auth ----------
// Brute-force protection: too many wrong passwords locks that email and IP
// out for a while. In-memory is fine, a restart is not a useful attack window.
const failedLogins = new Map(); // key -> { count, until }
// The account locks quickly, because that is the thing being attacked.
// The whole-IP limit is far higher: a small office shares one connection, and
// one person fumbling their password must not lock out their colleagues.
const MAX_ATTEMPTS = 6;
const MAX_ATTEMPTS_IP = 30;
const LOCKOUT_MINS = 15;

// Two counters: the account (the thing actually being attacked) and the source.
// Keying only on IP is unreliable behind a proxy, so the account counter is the
// one that must always hold.
function loginKeys(req, email) {
  const acct = 'acct:' + String(email || '').toLowerCase().trim();
  return [acct, 'ip:' + req.ip];
}

function lockedOut(keys) {
  let longest = 0;
  for (const key of keys) {
    const rec = failedLogins.get(key);
    if (!rec) continue;
    if (rec.until && rec.until > Date.now()) {
      longest = Math.max(longest, Math.ceil((rec.until - Date.now()) / 60000));
    } else if (rec.until) {
      failedLogins.delete(keys[0]); // clear this account; the IP counter stands
    }
  }
  return longest;
}

function noteFailure(keys) {
  let acctCount = 0;
  for (const key of keys) {
    const limit = key.startsWith('ip:') ? MAX_ATTEMPTS_IP : MAX_ATTEMPTS;
    const rec = failedLogins.get(key) || { count: 0, until: 0 };
    rec.count++;
    if (rec.count >= limit) rec.until = Date.now() + LOCKOUT_MINS * 60000;
    failedLogins.set(key, rec);
    if (!key.startsWith('ip:')) acctCount = rec.count;
  }
  return { count: acctCount };
}

app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  const keys = loginKeys(req, email);

  const waitMins = lockedOut(keys);
  if (waitMins) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMins} minute${waitMins === 1 ? '' : 's'}.` });
  }

  const user = (db.users || []).find(u => u.email === String(email || '').toLowerCase().trim() && u.active !== false);
  if (!user || !verifyPassword(password || '', user.password)) {
    const rec = noteFailure(keys);
    const left = MAX_ATTEMPTS - rec.count;
    return res.status(401).json({
      error: left > 0 && left <= 3
        ? `That email and password do not match. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lockout.`
        : 'That email and password do not match.'
    });
  }
  failedLogins.delete(keys[0]); // clear this account; the IP counter stands
  const token = issueToken(db, user);
  logAction('signed in', user.name, { user });
  save();
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const db = getDb();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  db.sessions = (db.sessions || []).filter(s => s.token !== token);
  save();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: publicUser(req.user) });
});

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, staffId: u.staffId || null };
}

// Team management (admin only)
app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  res.json((getDb().users || []).map(publicUser));
});

app.post('/api/admin/users', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, email, password, role, staffId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if ((db.users || []).some(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'That email already has a login.' });
  const u = {
    id: nextId('users'), name, email: email.toLowerCase(), password: hashPassword(password),
    role: ['admin', 'office', 'kleaner'].includes(role) ? role : 'office',
    staffId: staffId ? +staffId : null, active: true
  };
  db.users.push(u);
  logAction('created a login', `${u.name} (${u.role})`, req);
  save();
  res.status(201).json(publicUser(u));
});

app.patch('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const u = (db.users || []).find(x => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const { name, role, active, password, staffId } = req.body;
  if (name) u.name = name;
  if (role && ['admin', 'office', 'kleaner'].includes(role)) u.role = role;
  if (active !== undefined) u.active = !!active;
  if (staffId !== undefined) u.staffId = staffId ? +staffId : null;
  if (password) u.password = hashPassword(password);
  logAction('updated a login', u.name, req);
  save();
  res.json(publicUser(u));
});

// Reset the demo back to seeded data. Admin only, and it keeps the logins
// so nobody locks themselves out mid-demo.
app.post('/api/admin/reset-demo', requireRole('admin'), (req, res) => {
  const db = getDb();
  const users = db.users, sessions = db.sessions;
  // Guesty rate-limits sign-ins hard, so the access token must survive a reset
  const guestyToken = db.settings?.guestyToken;
  const fresh = seed();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, fresh, { users, sessions, activity: [] });
  if (guestyToken) db.settings.guestyToken = guestyToken;
  logAction('reset the demo data', '', req);
  save();
  res.json({ ok: true });
});

// ---------- Guesty: listings and bookings from their Airbnb management ----------
app.get('/api/admin/guesty/status', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const imported = db.bookings.filter(b => b.source === 'guesty');
  res.json({
    connected: guestyConfigured(),
    changeover: { start: CHANGEOVER_START, end: CHANGEOVER_END },
    lastSync: db.settings.guestyLastSync || null,
    lastError: db.settings.guestyLastError || null,
    autoSync: 'every hour',
    lookaheadDays: db.settings.guestyLookaheadDays || 180,
    excludedCount: (db.settings.guestyExcludedListings || []).length,
    imported: imported.length,
    awaitingApproval: imported.filter(b => b.status === 'requested').length,
    sameDay: imported.filter(b => b.sameDayTurnaround && b.status !== 'cancelled').length,
    properties: db.clients.filter(c => c.guestyListingId).length
  });
});

// Every Guesty property with whether we sync it. Lets the office switch off a
// property they do not actually clean, without needing a code change.
app.get('/api/admin/guesty/listings', requireRole('admin', 'office'), async (req, res) => {
  const db = getDb();
  try {
    const listings = await fetchListings();
    const excluded = new Set(db.settings.guestyExcludedListings || []);
    res.json(listings.map(l => ({
      guestyId: l.guestyId, name: l.name, postcode: l.postcode, bedrooms: l.bedrooms,
      synced: !excluded.has(l.guestyId)
    })));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/guesty/listings/:guestyId', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const id = req.params.guestyId;
  const set = new Set(db.settings.guestyExcludedListings || []);
  const sync = !!req.body.synced;

  if (sync) set.delete(id); else set.add(id);
  db.settings.guestyExcludedListings = [...set];

  // Switching a property off removes its imported work, since we are not doing it
  let removed = 0;
  if (!sync) {
    const client = db.clients.find(c => c.guestyListingId === id);
    if (client) {
      const theirs = db.bookings.filter(b => b.clientId === client.id && b.source === 'guesty');
      removed = theirs.length;
      db.bookings = db.bookings.filter(b => !(b.clientId === client.id && b.source === 'guesty'));
      const stillHasWork = db.bookings.some(b => b.clientId === client.id);
      if (!stillHasWork) db.clients = db.clients.filter(c => c.id !== client.id);
    }
  }
  logAction(sync ? 'switched a Guesty property on' : 'switched a Guesty property off', id, req);
  save();
  res.json({ synced: sync, removedChangeovers: removed });
});

// ---------- Card payments through Stripe ----------
// Klea's server never sees a card number. The client pays on Stripe's own page.
app.get('/api/admin/stripe', requireRole('admin', 'office'), (req, res) => {
  res.json(safeStripeSettings(getDb()));
});

app.put('/api/admin/stripe', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const current = db.settings.stripe || {};
  const { secretKey, webhookSecret, enabled } = req.body;
  const next = { ...current, enabled: enabled === undefined ? !!current.enabled : !!enabled };
  if (secretKey) next.secretKey = secretKey.trim();
  if (webhookSecret !== undefined) next.webhookSecret = (webhookSecret || '').trim();

  if (next.enabled && !next.secretKey) {
    return res.status(400).json({ error: 'Enter the secret key from Stripe first.' });
  }
  if (next.secretKey && !/^sk_(test|live)_/.test(next.secretKey)) {
    return res.status(400).json({ error: 'That does not look like a Stripe secret key. It should start sk_test_ or sk_live_.' });
  }

  db.settings.stripe = next;
  db.settings.stripe.lastError = null;
  save();

  // Prove the key works now rather than at the till
  if (next.enabled) {
    try {
      const account = await checkStripeKey(db);
      logAction('turned on card payments', `${account.name} (${safeStripeSettings(db).mode} mode)`, req);
      save();
      return res.json({ ...safeStripeSettings(db), account });
    } catch (e) {
      db.settings.stripe.enabled = false;
      db.settings.stripe.lastError = { message: e.message, at: new Date().toISOString() };
      save();
      return res.status(400).json({ error: `${e.message} Card payments have been left switched off.` });
    }
  }
  logAction('turned off card payments', '', req);
  save();
  res.json(safeStripeSettings(db));
});

// Stripe tells us here when a payment actually goes through. This is the only
// thing that marks a booking paid: a client closing the tab at the wrong moment
// must never leave money uncollected but marked as taken.
app.post('/api/stripe/webhook', (req, res) => {
  const db = getDb();
  const check = verifyStripeSignature(req.rawBody || '', req.headers['stripe-signature'], db.settings.stripe?.webhookSecret);
  if (!check.ok) {
    db.settings.stripe = db.settings.stripe || {};
    db.settings.stripe.lastError = { message: check.reason, at: new Date().toISOString() };
    save();
    return res.status(401).json({ error: 'Signature check failed.' });
  }

  const event = req.body;
  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const paymentId = +(session.metadata?.paymentId || session.client_reference_id || 0);
    const p = db.payments.find(x => x.id === paymentId);
    if (p && p.status !== 'paid') {
      p.status = 'paid';
      p.method = 'Card';
      p.stripeSessionId = session.id;
      p.paidAt = new Date().toISOString();
      db.settings.stripe.lastPaidAt = p.paidAt;
      db.settings.stripe.lastError = null;
      const c = db.clients.find(x => x.id === p.clientId);
      logAction('took a card payment', `${c?.name || 'a client'}, £${p.amount}`, null);
      save();
    }
  }
  res.json({ received: true });
});

// ---------- Text messages through Twilio ----------
app.get('/api/admin/sms', requireRole('admin', 'office'), (req, res) => {
  res.json(safeSmsSettings(getDb()));
});

app.put('/api/admin/sms', requireRole('admin'), (req, res) => {
  const db = getDb();
  const current = db.settings.sms || {};
  const { accountSid, authToken, from, enabled, remindersByText } = req.body;
  const next = {
    ...current,
    accountSid: (accountSid ?? current.accountSid ?? '').trim(),
    from: (from ?? current.from ?? '').trim(),
    enabled: enabled === undefined ? !!current.enabled : !!enabled,
    remindersByText: remindersByText === undefined ? !!current.remindersByText : !!remindersByText
  };
  if (authToken) next.authToken = authToken.trim();

  if (next.enabled) {
    if (!next.accountSid) return res.status(400).json({ error: 'Enter the account SID from Twilio.' });
    if (!next.authToken) return res.status(400).json({ error: 'Enter the auth token from Twilio.' });
    if (!next.from) return res.status(400).json({ error: 'Enter the number the texts should come from.' });
  }

  db.settings.sms = next;
  db.settings.sms.lastError = null;
  logAction(next.enabled ? 'turned on text messages' : 'turned off text messages', next.from, req);
  save();
  res.json(safeSmsSettings(db));
});

app.post('/api/admin/sms/test', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const to = (req.body.to || '').trim();
  if (!to) return res.status(400).json({ error: 'Enter a mobile number to send the test to.' });
  if (!isSmsConfigured(db)) return res.status(400).json({ error: 'Fill in the Twilio details and save them first.' });
  try {
    const r = await sendSms({ to, body: 'Test from the Klea system. If you can read this, texts are working. Klea' }, db);
    db.settings.sms.lastSentAt = new Date().toISOString();
    db.settings.sms.lastError = null;
    logAction('sent a test text', r.to, req);
    save();
    res.json({ ok: true, to: r.to });
  } catch (e) {
    db.settings.sms.lastError = { message: e.message, at: new Date().toISOString() };
    save();
    res.status(400).json({ error: e.message });
  }
});

// ---------- Email: sending through Klea's own mailbox ----------
// The password is stored on the server and never sent back out, not even to an
// admin screen. Everything goes out as, and comes back to, the Klea mailbox.
app.get('/api/admin/email', requireRole('admin', 'office'), (req, res) => {
  res.json(safeEmailSettings(getDb()));
});

app.put('/api/admin/email', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { host, port, user, pass, from, fromName, replyTo, enabled } = req.body;
  const current = db.settings.email || {};

  const next = {
    ...current,
    host: (host || current.host || 'smtp.ionos.co.uk').trim(),
    port: +(port || current.port || 465),
    user: (user ?? current.user ?? '').trim(),
    from: (from ?? current.from ?? '').trim(),
    fromName: (fromName ?? current.fromName ?? 'Klea').trim(),
    replyTo: (replyTo ?? current.replyTo ?? '').trim(),
    enabled: enabled === undefined ? !!current.enabled : !!enabled
  };
  // An empty password means "leave the one already saved alone"
  if (pass) next.pass = pass;

  if (next.enabled) {
    if (!next.from) return res.status(400).json({ error: 'The "Emails come from" box is empty. Put the mailbox address in it, for example hello@kleahome.co.uk.' });
    if (!next.user) next.user = next.from;
    if (!next.pass) return res.status(400).json({ error: 'The "Mailbox password" box is empty. Put in the password for that mailbox at IONOS.' });
  }

  db.settings.email = next;
  db.settings.email.lastError = null;
  logAction(next.enabled ? 'turned on sending emails' : 'turned off sending emails', next.from, req);
  save();
  res.json(safeEmailSettings(db));
});

// Proves it works before anyone relies on it. Sends immediately rather than
// going on the queue, so the answer comes back while they are still looking.
app.post('/api/admin/email/test', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const to = (req.body.to || '').trim();
  if (!to) return res.status(400).json({ error: 'Enter an address to send the test to.' });
  if (!isEmailConfigured(db)) return res.status(400).json({ error: 'Fill in the mailbox details and save them first.' });
  try {
    await sendMail({
      to, toName: '',
      subject: 'Test from the Klea system',
      text: 'This is a test.\n\nIf you can read this, the Klea system can send emails from your own mailbox, '
        + 'and anything a client replies will come back to that same inbox.\n\nKlea'
    }, db);
    db.settings.email.lastSentAt = new Date().toISOString();
    db.settings.email.lastError = null;
    logAction('sent a test email', to, req);
    save();
    res.json({ ok: true, to });
  } catch (e) {
    db.settings.email.lastError = { message: e.message, at: new Date().toISOString() };
    save();
    res.status(400).json({ error: e.message });
  }
});

// ---------- Instant updates from Guesty (webhooks) ----------
// Guesty posts here the moment a reservation is made or changed, so a changeover
// appears in the portal in seconds instead of waiting for the hourly sync.
// Public by necessity, but every delivery must carry a valid Guesty signature.
app.post('/api/guesty/webhook', async (req, res) => {
  const db = getDb();
  const check = verifyWebhookSignature(req.rawBody || '', req.headers, db.settings.guestyWebhookSecret);
  if (!check.ok) {
    // Surfaced on the Guesty page: Guesty gives up after five days of failures
    // and only their support can switch the endpoint back on, so a signature
    // problem needs to be visible long before then.
    db.settings.guestyWebhookLastError = { message: check.reason, at: new Date().toISOString() };
    save();
    return res.status(401).json({ error: 'Signature check failed.' });
  }

  // Guesty warns that duplicates and out-of-order deliveries are normal
  if (alreadySeen(check.id)) return res.json({ ok: true, duplicate: true });

  const event = req.body?.event || '';
  db.settings.guestyWebhookLastAt = new Date().toISOString();
  db.settings.guestyWebhookLastError = null;

  if (!event.startsWith('reservation.')) {
    save();
    return res.json({ ok: true, ignored: event });
  }

  try {
    const r = normaliseWebhookReservation(req.body);
    if (!r.guestyId || !r.listingId) {
      save();
      return res.json({ ok: true, ignored: 'incomplete payload' });
    }

    // A property we have never seen before: refresh the property list once
    // rather than dropping the booking on the floor.
    if (!cachedListings().some(l => l.guestyId === r.listingId)) {
      try { cacheListings(await fetchListings()); }
      catch (e) { console.error('Guesty listing refresh failed:', e.message); }
    }

    const result = importReservations({ listings: cachedListings(), reservations: [r] });
    const what = result.created.length ? `${result.created.length} changeover`
      : result.cancelled ? 'a cancellation'
      : result.excluded ? 'a switched-off property'
      : 'no change';
    logAction('Guesty instant update', `${event}: ${what}`, null);
    save();
    res.json({ ok: true, created: result.created.length, cancelled: result.cancelled });
  } catch (e) {
    // A non-2xx tells Guesty to retry, which is what we want for a transient fault
    console.error('Guesty webhook failed:', e.message);
    db.settings.guestyWebhookLastError = { message: e.message, at: new Date().toISOString() };
    save();
    res.status(500).json({ error: e.message });
  }
});

function webhookUrl(req) {
  const configured = getDb().settings.guestyWebhookUrl;
  if (configured) return configured;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `https://${host}/api/guesty/webhook`;
}

app.get('/api/admin/guesty/webhook', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json({
    url: webhookUrl(req),
    // Only "on" when we can actually accept a delivery. A subscription without a
    // signing key refuses everything, which must never look like working.
    connected: !!(db.settings.guestyWebhookId && db.settings.guestyWebhookSecret),
    events: WEBHOOK_EVENTS,
    hasSecret: !!db.settings.guestyWebhookSecret,   // never returns the secret itself
    lastReceived: db.settings.guestyWebhookLastAt || null,
    lastError: db.settings.guestyWebhookLastError || null
  });
});

app.post('/api/admin/guesty/webhook', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const url = webhookUrl(req);
  if (!url.startsWith('https://')) {
    return res.status(400).json({ error: 'Guesty only sends to an https address, so this cannot be set up from a local machine.' });
  }
  let createdNow = null;
  try {
    // One subscription per address: duplicates make Guesty miss notifications.
    // An existing one is REUSED rather than replaced, because deleting and
    // recreating issues a new signing key for no reason. This also means
    // pressing the button again repairs a half-finished setup.
    const existing = (await listWebhooks()).filter(w => w.url === url);
    const usable = existing.find(w => WEBHOOK_EVENTS.every(e => (w.events || []).includes(e)));

    let id;
    if (usable && existing.length === 1) {
      id = usable._id || usable.id;
    } else {
      for (const w of existing) await deleteWebhook(w._id || w.id);
      const created = await createWebhook(url, WEBHOOK_EVENTS);
      createdNow = created._id || created.id || null;
      id = createdNow;
    }

    // Without a signing key every delivery is refused, and Guesty disables the
    // endpoint after five days of that, so a subscription is never left in
    // place without one.
    let secret;
    try {
      secret = await fetchWebhookSecret(url);
    } catch (e) {
      if (createdNow) await deleteWebhook(createdNow).catch(() => {});
      throw new Error(`${e.message} Nothing was left switched on, so try again in a minute.`);
    }

    db.settings.guestyWebhookId = id;
    db.settings.guestyWebhookUrl = url;
    db.settings.guestyWebhookSecret = secret;
    db.settings.guestyWebhookLastError = null;
    logAction('turned on Guesty instant updates', url, req);
    save();
    res.json({ ok: true, url, events: WEBHOOK_EVENTS, reused: !createdNow, replaced: createdNow ? existing.length : 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/guesty/webhook', requireRole('admin'), async (req, res) => {
  const db = getDb();
  try {
    const url = webhookUrl(req);
    for (const w of (await listWebhooks()).filter(x => x.url === url)) {
      await deleteWebhook(w._id || w.id);
    }
    db.settings.guestyWebhookId = null;
    db.settings.guestyWebhookSecret = null;
    logAction('turned off Guesty instant updates', url, req);
    save();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/guesty/sync', requireRole('admin', 'office'), async (req, res) => {
  const db = getDb();
  try {
    const days = db.settings.guestyLookaheadDays || 180;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const [listings, reservations] = await Promise.all([fetchListings(), fetchReservations({ from, to })]);
    cacheListings(listings);   // so an instant update can stand on its own
    const result = importReservations({ listings, reservations });
    db.settings.guestyLastSync = new Date().toISOString();
    logAction('synced Guesty', `${result.created.length} changeover(s) imported`, req);
    save();
    res.json({ ...result, created: result.created.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Loads a realistic sample so the whole pipeline can be demonstrated and tested
// before the live Guesty credentials arrive.
app.post('/api/admin/guesty/sample', requireRole('admin'), (req, res) => {
  const db = getDb();
  const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const listings = [
    { guestyId: 'L-SEAVIEW', name: 'Seaview Apartment, Cleveleys', address: '4 Beach Road, Cleveleys', postcode: 'FY5 1AA', bedrooms: 2 },
    { guestyId: 'L-PROM', name: 'The Promenade Loft, Lytham', address: '12 Clifton Drive, Lytham', postcode: 'FY8 5RF', bedrooms: 1 },
    { guestyId: 'L-DUNES', name: 'Dune Cottage, St Annes', address: '7 Kilgrimol Gardens, St Annes', postcode: 'FY8 1QP', bedrooms: 3 }
  ];
  const reservations = [
    // classic same-day turnaround: one guest out, another in the same day
    { guestyId: 'R-1001', listingId: 'L-SEAVIEW', checkIn: d(1), checkOut: d(3), status: 'confirmed', guests: 4, confirmationCode: 'HMABC123' },
    { guestyId: 'R-1002', listingId: 'L-SEAVIEW', checkIn: d(3), checkOut: d(6), status: 'confirmed', guests: 2, confirmationCode: 'HMDEF456' },
    // a quiet checkout with no one arriving
    { guestyId: 'R-1003', listingId: 'L-PROM', checkIn: d(2), checkOut: d(4), status: 'confirmed', guests: 2, confirmationCode: 'HMGHI789' },
    { guestyId: 'R-1004', listingId: 'L-DUNES', checkIn: d(1), checkOut: d(5), status: 'confirmed', guests: 6, confirmationCode: 'HMJKL012' },
    // a cancelled stay, which should not create a clean
    { guestyId: 'R-1005', listingId: 'L-DUNES', checkIn: d(7), checkOut: d(9), status: 'canceled', guests: 4, confirmationCode: 'HMMNO345' }
  ];
  const result = importReservations({ listings, reservations });
  db.settings.guestyLastSync = new Date().toISOString();
  logAction('loaded Guesty sample data', `${result.created.length} changeover(s)`, req);
  save();
  res.json({ ...result, created: result.created.length, sample: true });
});

// ---------- Time off: holidays and blocked-out days ----------
const ABSENCE_TYPES = ['holiday', 'sick', 'training', 'unavailable'];

app.get('/api/admin/absences', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json((db.absences || [])
    .map(a => ({ ...a, staffName: db.staff.find(s => s.id === a.staffId)?.name }))
    .sort((a, b) => b.from.localeCompare(a.from)));
});

app.post('/api/admin/absences', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { staffId, from, to, type = 'holiday', note = '' } = req.body;
  const s = db.staff.find(x => x.id === +staffId);
  if (!s) return res.status(400).json({ error: 'Choose who the time off is for.' });
  if (!from || !to) return res.status(400).json({ error: 'Pick a start and end date.' });
  if (to < from) return res.status(400).json({ error: 'The end date is before the start date.' });

  // Warn about work already booked in that period rather than silently clashing
  const clashes = db.bookings.filter(b =>
    b.staffId === s.id && b.date >= from && b.date <= to &&
    b.status !== 'cancelled' && b.status !== 'completed'
  ).map(expandBooking);

  if (!db.absences) db.absences = [];
  const a = {
    id: nextId('absences'), staffId: s.id, from, to,
    type: ABSENCE_TYPES.includes(type) ? type : 'holiday',
    note, createdAt: new Date().toISOString()
  };
  db.absences.push(a);
  logAction('booked time off', `${s.name}, ${from} to ${to} (${a.type})`, req);
  save();
  res.status(201).json({
    absence: { ...a, staffName: s.name },
    clashes: clashes.map(c => ({ id: c.id, date: c.date, start: c.start, clientName: c.clientName }))
  });
});

app.delete('/api/admin/absences/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const idx = (db.absences || []).findIndex(a => a.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = db.absences.splice(idx, 1);
  const s = db.staff.find(x => x.id === removed.staffId);
  logAction('removed time off', `${s?.name || 'someone'}, ${removed.from} to ${removed.to}`, req);
  save();
  res.json({ ok: true });
});

// One of each, clearly labelled, so every screen shows the shape of a real
// record instead of an empty page. Deleting them is the office's first job.
function exampleRecords(db) {
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const EX = 'EXAMPLE, delete this once you have added your own.';

  const staff = {
    id: 1, name: 'Example Kleaner', phone: '07700 900000', postcode: 'FY1 1AA',
    colour: '#D8BFA3', days: [1, 2, 3, 4, 5], start: '09:00', end: '15:00',
    active: true, photo: '', bio: EX, rate: 12.5,
    email: '', address: '', dob: '', niNumber: '', emergencyContact: '', bank: '',
    legal: { dbs: {}, rightToWork: {}, contract: {}, training: {} }
  };

  const client = {
    id: 1, name: 'Example Client', email: '', phone: '07700 900001',
    postcode: 'FY1 1AA', address: '1 Example Street, Blackpool',
    type: 'residential', notes: EX
  };

  const checklist = [];
  let ci = 0;
  for (const sec of checklistFor('house-regular')) {
    for (const item of sec.items) checklist.push({ id: ++ci, section: sec.section, label: item, done: false });
  }

  const booking = {
    id: 1, clientId: 1, serviceId: 'house-regular', size: 2, addonIds: [], addonQty: {},
    frequency: 'once', seriesId: null, date: day(3), start: '10:00', durationMins: 120,
    staffId: 1, status: 'booked', price: 0, teamClean: false, photos: [], rating: null,
    notes: EX, checklist, createdAt: new Date().toISOString()
  };

  return {
    staff: [staff],
    clients: [client],
    bookings: [booking],
    invoices: [{
      id: 1, clientId: 1, bookingId: null, number: 'EXAMPLE-001', amount: 0,
      issuedDate: day(0), dueDate: day(14), status: 'unpaid', paidDate: null,
      file: null, notes: EX
    }],
    messages: [{
      id: 1, clientId: 1, bookingId: 1, channel: 'sms', direction: 'out',
      body: EX, createdAt: new Date().toISOString()
    }],
    expenses: [{ id: 1, date: day(0), category: 'other', description: EX, amount: 0 }],
    applications: [{
      id: 1, name: 'Example Applicant', email: '', phone: '07700 900002',
      postcode: 'FY1 1AA', transport: '', days: [], hours: '', experience: '',
      rightToWork: '', dbs: '', about: EX, status: 'new', appliedAt: new Date().toISOString()
    }],
    absences: [{ id: 1, staffId: 1, from: day(30), to: day(31), reason: EX }],
    inventory: [{ id: 1, name: 'Example item, delete once you have added your own', unitCost: 0, stock: 0, reorderAt: 0 }]
  };
}

// Empty the system ready for real trading: removes every demo client, booking,
// payment, message and Kleaner, but keeps logins, settings and the price list.
// Pass withExamples to leave one labelled example on each screen instead of
// handing over a set of blank pages.
app.post('/api/admin/start-fresh', requireRole('admin'), (req, res) => {
  if (req.body.confirm !== 'START FRESH') {
    return res.status(400).json({ error: 'Type START FRESH to confirm. This cannot be undone.' });
  }
  const db = getDb();
  const keptSettings = db.settings;
  const keptUsers = (db.users || []).filter(u => u.role !== 'kleaner');
  const ex = req.body.withExamples ? exampleRecords(db) : {};
  Object.assign(db, {
    staff: [], clients: [], bookings: [], messages: [], payments: [], payouts: [],
    applications: [], timesheets: [], absences: [], expenses: [], invoices: [],
    users: keptUsers, settings: keptSettings, activity: [],
    ...ex
  });
  logAction(req.body.withExamples ? 'cleared all data, left one example on each screen' : 'cleared all data for go-live', '', req);
  save();

  // The Guesty changeovers are real work, not demo data, so pull them straight
  // back in rather than leaving a gap until the next hourly sync.
  const resync = guestyConfigured();
  if (resync) setTimeout(runGuestySync, 1000);

  res.json({
    ok: true,
    keptLogins: keptUsers.length,
    keptInventory: (db.inventory || []).length,
    examples: !!req.body.withExamples,
    guestyResync: resync
  });
});

// Generate strong passwords for every login. Returned ONCE, never stored in
// readable form, so they can be copied into a password manager.
const PW_WORDS = ['harbour','lantern','copper','willow','marble','thistle','beacon','cobble','saffron','amber','quarry','meadow','pebble','birch','cinder','otter','pewter','fennel','walnut','heather'];
function strongPassword() {
  const pick = a => a[crypto.randomInt(a.length)];
  return [pick(PW_WORDS), pick(PW_WORDS), pick(PW_WORDS)]
    .map(w => w[0].toUpperCase() + w.slice(1)).join('-')
    + crypto.randomInt(10, 100) + pick(['!', '#', '@']);
}

app.post('/api/admin/users/regenerate-passwords', requireRole('admin'), (req, res) => {
  if (req.body.confirm !== 'NEW PASSWORDS') {
    return res.status(400).json({ error: 'Type NEW PASSWORDS to confirm. Everyone will be signed out.' });
  }
  const db = getDb();
  const issued = [];
  for (const u of db.users || []) {
    const pw = strongPassword();
    u.password = hashPassword(pw);
    issued.push({ name: u.name, email: u.email, role: u.role, password: pw });
  }
  // Everyone must sign in again with the new password
  const myToken = (req.headers.authorization || '').replace('Bearer ', '');
  db.sessions = (db.sessions || []).filter(s => s.token === myToken);
  logAction('generated new passwords for everyone', `${issued.length} logins`, req);
  save();
  res.json({ issued });
});

// ---------- Invoices: upload, mark paid, flag for chasing ----------
// For clients who came direct rather than booking online. An invoice can hang
// off a client, and optionally off a specific job.
function expandInvoice(inv) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const overdueDays = inv.status === 'unpaid' && inv.dueDate && inv.dueDate < today
    ? Math.floor((new Date(today) - new Date(inv.dueDate)) / 864e5)
    : 0;
  const b = inv.bookingId ? db.bookings.find(x => x.id === inv.bookingId) : null;
  return {
    id: inv.id, clientId: inv.clientId, bookingId: inv.bookingId || null,
    number: inv.number, amount: inv.amount, issuedDate: inv.issuedDate, dueDate: inv.dueDate,
    status: inv.status, paidDate: inv.paidDate || null, notes: inv.notes || '',
    fileName: inv.file?.name || null,
    clientName: db.clients.find(c => c.id === inv.clientId)?.name,
    jobLabel: b ? `${b.date} ${b.start}` : null,
    overdueDays,
    needsChasing: overdueDays > 0
  };
}

app.get('/api/admin/invoices', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const rows = (db.invoices || []).map(expandInvoice);
  res.json({
    invoices: rows.sort((a, b) => (b.issuedDate || '').localeCompare(a.issuedDate || '')),
    outstanding: round2(rows.filter(r => r.status === 'unpaid').reduce((t, r) => t + r.amount, 0)),
    overdue: round2(rows.filter(r => r.needsChasing).reduce((t, r) => t + r.amount, 0)),
    chasing: rows.filter(r => r.needsChasing).length
  });
});

app.post('/api/admin/invoices', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { clientId, bookingId = null, number = '', amount, issuedDate, dueDate, notes = '', file } = req.body;
  const c = db.clients.find(x => x.id === +clientId);
  if (!c) return res.status(400).json({ error: 'Choose a client.' });
  if (!amount || +amount <= 0) return res.status(400).json({ error: 'Enter the invoice amount.' });
  if (file && !/^data:(image\/|application\/pdf)/.test(file.dataUrl || '')) {
    return res.status(400).json({ error: 'Upload a PDF or an image of the invoice.' });
  }
  if (file && (file.dataUrl || '').length > 4_000_000) {
    return res.status(400).json({ error: 'That file is too large. Please use a smaller scan or PDF.' });
  }
  if (!db.invoices) db.invoices = [];

  const issued = issuedDate || new Date().toISOString().slice(0, 10);
  // Default to 14 day terms when no due date is given
  const due = dueDate || new Date(new Date(issued).getTime() + 14 * 864e5).toISOString().slice(0, 10);

  const inv = {
    id: nextId('invoices'), clientId: c.id, bookingId: bookingId ? +bookingId : null,
    number: number || `INV-${nextId('invoices')}`, amount: round2(+amount),
    issuedDate: issued, dueDate: due, status: 'unpaid', paidDate: null, notes,
    file: file ? { name: file.name, dataUrl: file.dataUrl } : null,
    createdAt: new Date().toISOString()
  };
  db.invoices.push(inv);
  logAction('added an invoice', `${c.name}, £${inv.amount}`, req);
  save();
  res.status(201).json(expandInvoice(inv));
});

app.patch('/api/admin/invoices/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const inv = (db.invoices || []).find(x => x.id === +req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const c = db.clients.find(x => x.id === inv.clientId);

  if (req.body.status === 'paid' && inv.status !== 'paid') {
    inv.status = 'paid';
    inv.paidDate = req.body.paidDate || new Date().toISOString().slice(0, 10);
    logAction('marked an invoice paid', `${c?.name}, £${inv.amount}`, req);
  } else if (req.body.status === 'unpaid' && inv.status !== 'unpaid') {
    inv.status = 'unpaid';
    inv.paidDate = null;
    logAction('marked an invoice unpaid', `${c?.name}, £${inv.amount}`, req);
  }
  for (const k of ['number', 'notes', 'dueDate']) if (req.body[k] !== undefined) inv[k] = req.body[k];
  if (req.body.amount !== undefined) inv.amount = round2(+req.body.amount);
  save();
  res.json(expandInvoice(inv));
});

app.get('/api/admin/invoices/:id/file', requireRole('admin', 'office'), (req, res) => {
  const inv = (getDb().invoices || []).find(x => x.id === +req.params.id);
  if (!inv?.file) return res.status(404).json({ error: 'No file on this invoice.' });
  res.json(inv.file);
});

app.delete('/api/admin/invoices/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const idx = (db.invoices || []).findIndex(x => x.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = db.invoices.splice(idx, 1);
  logAction('deleted an invoice', `£${removed.amount}`, req);
  save();
  res.json({ ok: true });
});

// ---------- Activity trail: who actioned what ----------
app.get('/api/admin/activity', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json((db.activity || []).slice().reverse().slice(0, 100));
});

// ---------- Catalogue ----------
app.get('/api/catalogue', (req, res) => {
  const cov = getDb().settings.coverage || {};
  res.json({ services: SERVICES, addons: ADDONS, frequencies: FREQUENCIES, faqs: FAQS, coverageLabel: cov.label });
});

// ---------- Admin settings ----------
app.get('/api/admin/settings', requireRole('admin', 'office'), (req, res) => {
  const s = getDb().settings;
  res.json({ bookingMode: s.bookingMode || 'instant' });
});

app.post('/api/admin/settings', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  if (req.body.bookingMode) db.settings.bookingMode = req.body.bookingMode === 'request' ? 'request' : 'instant';
  save();
  res.json({ bookingMode: db.settings.bookingMode });
});

// ---------- Postcode coverage ----------
function isCovered(postcode) {
  const cov = getDb().settings.coverage;
  if (!cov?.areas?.length) return true;
  const letters = (outcode(postcode).match(/^[A-Z]{1,2}/) || [''])[0];
  return cov.areas.includes(letters);
}

app.get('/api/coverage', (req, res) => {
  const cov = getDb().settings.coverage || {};
  res.json({ postcode: req.query.postcode, covered: isCovered(req.query.postcode || ''), label: cov.label });
});

app.post('/api/quote', (req, res) => {
  try { res.json(quote(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- Availability + cleaner matching ----------
// Finds, for a date + postcode + duration, which cleaners can take the job,
// scored by postcode proximity (keeps patches tight) then by lightest day.
// Time off: holiday, sickness or any blocked-out day. Somebody on a booked
// absence must never be offered a job.
export function absenceOn(staffId, date) {
  return (getDb().absences || []).find(a => a.staffId === staffId && a.from <= date && a.to >= date) || null;
}

function staffOptions({ date, postcode, durationMins, excludeBookingId = null }) {
  const db = getDb();
  const dow = new Date(date + 'T12:00:00').getDay(); // 0=Sun
  const dayBookings = db.bookings.filter(b => b.date === date && b.status !== 'cancelled' && b.id !== excludeBookingId);

  const options = [];
  for (const s of db.staff.filter(s => s.active && s.days.includes(dow) && !absenceOn(s.id, date))) {
    const mine = dayBookings.filter(b => b.staffId === s.id)
      .map(b => [toMins(b.start), toMins(b.start) + b.durationMins])
      .sort((a, b) => a[0] - b[0]);

    // free slots within working hours, on the half hour
    const slots = [];
    for (let t = toMins(s.start); t + durationMins <= toMins(s.end); t += 30) {
      const clash = mine.some(([bs, be]) => t < be && t + durationMins > bs);
      if (!clash) slots.push(toTime(t));
    }
    if (!slots.length) continue;

    const prox = proximityScore(s.postcode, postcode);
    const load = mine.reduce((t, [bs, be]) => t + (be - bs), 0);
    options.push({
      staffId: s.id, name: s.name, postcode: s.postcode, colour: s.colour,
      photo: s.photo, bio: s.bio,
      dbsClear: s.legal?.dbs?.status === 'clear',
      proximity: prox, proximityLabel: proximityLabel(prox),
      bookedMinsToday: load, slots
    });
  }
  // closest patch first, then least-loaded day
  options.sort((a, b) => b.proximity - a.proximity || a.bookedMinsToday - b.bookedMinsToday);
  return options;
}

// Tells the booking page whether payment happens on Stripe's page or not at all
app.get('/api/pay-mode', (req, res) => {
  res.json({ cardOnStripe: isStripeConfigured(getDb()) });
});

app.get('/api/availability', (req, res) => {
  const { date, postcode = '', duration = '120' } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });
  res.json({ date, options: staffOptions({ date, postcode, durationMins: parseInt(duration, 10) }) });
});

// ---------- Booking creation (client side) ----------
app.post('/api/bookings', async (req, res) => {
  const db = getDb();
  const { client, serviceId, size, addonIds = [], frequency = 'once', teamClean = false, date, time, staffId, notes = '', occurrences } = req.body;
  if (!client?.name || !client?.email || !client?.postcode) return res.status(400).json({ error: 'Client name, email and postcode are required.' });
  if (!date || !time) return res.status(400).json({ error: 'Date and time are required.' });
  if (!isCovered(client.postcode)) {
    const label = getDb().settings.coverage?.label || 'our area';
    return res.status(400).json({ error: `Sorry, we do not cover that postcode yet. We currently serve ${label}.` });
  }

  const q = quote({ serviceId, size, addonIds, frequency, teamClean });

  // find or create client
  let c = client.email ? db.clients.find(x => (x.email || '').toLowerCase() === client.email.toLowerCase()) : null;
  if (!c) {
    c = { id: nextId('clients'), name: client.name, email: client.email, phone: client.phone || '', postcode: client.postcode, address: client.address || '', type: 'residential', notes: '' };
    db.clients.push(c);
  }

  // pick cleaner if not given: best proximity with the requested slot free
  let chosenStaffId = staffId;
  if (!chosenStaffId) {
    const opts = staffOptions({ date, postcode: client.postcode, durationMins: q.durationMins });
    const fit = opts.find(o => o.slots.includes(time)) || opts[0];
    if (!fit) return res.status(409).json({ error: 'No cleaners available that day. Please pick another date.' });
    chosenStaffId = fit.staffId;
  }

  const seriesId = frequency !== 'once' ? 'S' + Date.now() : null;
  const stepDays = { weekly: 7, fortnightly: 14, 'four-weekly': 28 }[frequency] || 0;
  const count = frequency === 'once' ? 1 : (occurrences || 6);

  const initialStatus = (db.settings.bookingMode === 'request') ? 'requested' : 'booked';
  const created = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + stepDays * i);
    const dISO = d.toISOString().slice(0, 10);
    const checklist = [];
    let ci = 0;
    for (const sec of checklistFor(serviceId)) for (const item of sec.items) checklist.push({ id: ++ci, section: sec.section, label: item, done: false });
    const b = {
      id: nextId('bookings'), clientId: c.id, serviceId, size, addonIds, frequency, seriesId,
      date: dISO, start: time, durationMins: q.durationMins, staffId: chosenStaffId,
      status: initialStatus, price: i === 0 ? q.firstVisitTotal : q.total, teamClean: q.teamClean,
      photos: [], rating: null, notes, checklist, createdAt: new Date().toISOString()
    };
    db.bookings.push(b);
    created.push(b);
  }

  // demo payment record (first visit) — replace with Stripe when keys are added
  // With Stripe connected this is a real payment, taken on Stripe's own page and
  // only marked paid once Stripe confirms it. Without it, nothing is charged and
  // the payment is recorded as still owing rather than pretending it was taken.
  const takingCard = isStripeConfigured(db);
  const payment = {
    id: nextId('payments'), bookingId: created[0].id, clientId: c.id,
    amount: created[0].price,
    method: takingCard ? 'Card' : 'Not collected',
    status: takingCard ? 'awaiting payment' : 'unpaid',
    date: created[0].date
  };
  db.payments.push(payment);

  let checkoutUrl = null;
  if (takingCard) {
    const svcLabel = SERVICES.find(x => x.id === serviceId)?.name || 'Clean';
    const origin = `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
    try {
      const session = await createCheckoutSession(db, {
        amount: created[0].price,
        description: `${svcLabel}, ${created[0].date} at ${time}`,
        clientEmail: c.email,
        paymentId: payment.id,
        successUrl: `${origin}/#/paid?booking=${created[0].id}`,
        cancelUrl: `${origin}/#/book`
      });
      checkoutUrl = session.url;
      payment.stripeSessionId = session.id;
    } catch (e) {
      // A booking is worth more than a card payment, so the booking stands and
      // the office chases the money rather than the client losing their slot.
      payment.status = 'unpaid';
      payment.method = 'Not collected';
      db.settings.stripe.lastError = { message: e.message, at: new Date().toISOString() };
      console.error('Stripe checkout failed:', e.message);
    }
  }

  // confirmation message (demo — logged, not actually sent)
  const staffName = db.staff.find(s => s.id === chosenStaffId)?.name || 'your cleaner';
  const svcName = SERVICES.find(s => s.id === serviceId)?.name || 'clean';
  const body = initialStatus === 'requested'
    ? `Hi ${c.name.split(' ')[0]}, we have received your request for a ${svcName.toLowerCase()} on ${created[0].date} at ${time}. We will confirm it shortly. Klea ✦`
    : `Hi ${c.name.split(' ')[0]}, your ${svcName.toLowerCase()} is booked for ${created[0].date} at ${time}. ${staffName} will be looking after you.${frequency !== 'once' ? ` We have set this up ${q.frequency.toLowerCase()} going forward.` : ''} Klea ✦`;
  notifyClient(db, {
    clientId: c.id, bookingId: created[0].id,
    subject: initialStatus === 'requested' ? 'We have your booking request' : `Your clean is booked for ${created[0].date}`,
    body
  });

  save();
  res.status(201).json({ bookings: created, client: c, quote: q, staffName, confirmationMessage: body, checkoutUrl });
});

// ---------- Admin ----------
// Kleaners never see what the client is charged
function stripMoney(b) {
  const { price, teamSupplement, ...rest } = b;
  return rest;
}

function expandBooking(b) {
  const db = getDb();
  const c = db.clients.find(x => x.id === b.clientId);
  const s = db.staff.find(x => x.id === b.staffId);
  const svc = SERVICES.find(x => x.id === b.serviceId);
  return {
    ...b,
    clientName: c?.name, clientPostcode: c?.postcode, clientPhone: c?.phone, clientAddress: c?.address, clientNotes: c?.notes,
    staffName: s?.name, staffColour: s?.colour,
    serviceName: svc?.name,
    sizeLabel: svc ? (svc.sized === 'bedrooms' ? `${b.size} bed` : `${b.size} sqm`) : '',
    addonNames: b.addonIds.map(id => ADDONS.find(a => a.id === id)?.name).filter(Boolean),
    checklistDone: b.checklist.filter(i => i.done).length,
    checklistTotal: b.checklist.length,
    photoCount: (b.photos || []).length,
    source: b.source || 'klea',
    sameDayTurnaround: !!b.sameDayTurnaround
  };
}

app.get('/api/admin/summary', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const live = db.bookings.filter(b => b.status !== 'cancelled');
  const monthStart = today.slice(0, 8) + '01';
  const complianceAlerts = [];
  for (const s of db.staff.filter(x => x.active)) {
    for (const c of complianceFor(s)) if (c.state !== 'ok') complianceAlerts.push({ who: s.name, ...c });
  }
  for (const d of companyLegalStatus()) {
    if (d.state !== 'ok') complianceAlerts.push({ who: 'Company', label: d.name, state: d.state, detail: d.detail });
  }
  const lowStock = (db.inventory || []).filter(i => i.stock <= i.reorderAt).map(i => ({ name: i.name, stock: i.stock, reorderAt: i.reorderAt }));
  const newApplicants = (db.applications || []).filter(a => a.status === 'new').length;
  const guestyPending = db.bookings.filter(b => b.source === 'guesty' && b.status === 'requested').length;
  const todayISO = new Date().toISOString().slice(0, 10);
  const chasing = (db.invoices || []).filter(i => i.status === 'unpaid' && i.dueDate && i.dueDate < todayISO);
  const guestySameDay = db.bookings.filter(b => b.source === 'guesty' && b.status === 'requested' && b.sameDayTurnaround).length;
  res.json({
    complianceAlerts,
    lowStock,
    newApplicants,
    guestyPending,
    guestySameDay,
    invoicesChasing: chasing.length,
    invoicesChasingTotal: round2(chasing.reduce((t, i) => t + i.amount, 0)),
    clients: db.clients.length,
    staff: db.staff.filter(s => s.active).length,
    todayJobs: live.filter(b => b.date === today).map(expandBooking).sort((a, b) => a.start.localeCompare(b.start)),
    upcomingCount: live.filter(b => b.date > today && b.date <= weekAhead && b.status === 'booked').length,
    subscriptions: new Set(live.filter(b => b.seriesId).map(b => b.seriesId)).size,
    revenueMonth: Math.round(db.payments.filter(p => p.date >= monthStart && p.date <= today).reduce((t, p) => t + p.amount, 0) * 100) / 100,
    revenueBookedAhead: Math.round(live.filter(b => b.date > today && b.status === 'booked').reduce((t, b) => t + b.price, 0) * 100) / 100,
    avgRating: (() => {
      const rated = db.bookings.filter(b => b.status === 'completed' && b.rating);
      return rated.length ? Math.round(rated.reduce((t, b) => t + b.rating, 0) / rated.length * 10) / 10 : null;
    })()
  });
});

// Admin-created booking for an existing client (no card step; invoiced in demo)
app.post('/api/admin/bookings', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { clientId, serviceId, size, addonIds = [], addonQty = {}, frequency = 'once', teamClean = false, date, time, staffId = null, notes = '', occurrences, customAmount = null } = req.body;
  const c = db.clients.find(x => x.id === +clientId);
  if (!c) return res.status(400).json({ error: 'Choose a client.' });
  if (!serviceId || !date || !time) return res.status(400).json({ error: 'Service, date and time are required.' });

  const q = quote({ serviceId, size, addonIds, addonQty, frequency, teamClean, customAmount });

  let chosenStaffId = staffId ? +staffId : null;
  if (!chosenStaffId) {
    const opts = staffOptions({ date, postcode: c.postcode, durationMins: q.durationMins });
    const fit = opts.find(o => o.slots.includes(time)) || opts[0];
    if (!fit) return res.status(409).json({ error: 'No cleaners available that day. Pick another date or assign someone manually.' });
    chosenStaffId = fit.staffId;
  }

  const seriesId = frequency !== 'once' ? 'S' + Date.now() : null;
  const stepDays = { weekly: 7, fortnightly: 14, 'four-weekly': 28 }[frequency] || 0;
  const count = frequency === 'once' ? 1 : (occurrences || 6);
  const created = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + stepDays * i);
    const checklist = [];
    let ci = 0;
    for (const sec of checklistFor(serviceId)) for (const item of sec.items) checklist.push({ id: ++ci, section: sec.section, label: item, done: false });
    const b = {
      id: nextId('bookings'), clientId: c.id, serviceId, size, addonIds, addonQty, frequency, seriesId,
      date: d.toISOString().slice(0, 10), start: time, durationMins: q.durationMins, staffId: chosenStaffId,
      status: 'booked', price: i === 0 ? q.firstVisitTotal : q.total, teamClean: q.teamClean,
      photos: [], rating: null, notes, checklist, createdAt: new Date().toISOString()
    };
    db.bookings.push(b);
    created.push(b);
  }
  db.payments.push({ id: nextId('payments'), bookingId: created[0].id, clientId: c.id, amount: created[0].price, method: 'Invoice (demo)', status: 'authorised', date: created[0].date });
  const staffName = db.staff.find(s => s.id === chosenStaffId)?.name || 'your cleaner';
  const svcName = SERVICES.find(s => s.id === serviceId)?.name || 'clean';
  notifyClient(db, {
    clientId: c.id, bookingId: created[0].id,
    subject: `Your clean is booked for ${created[0].date}`,
    body: `Hi ${c.name.split(' ')[0]}, your ${svcName.toLowerCase()} is booked for ${created[0].date} at ${time}. ${staffName} will be looking after you. Klea ✦`
  });
  logAction('added a booking', `${c.name}, ${created[0].date} ${time}`, req);
  save();
  res.status(201).json({ bookings: created.map(expandBooking) });
});

// Permanently remove a booking (rota tidy-up; use cancel for the fee policy)
app.delete('/api/admin/bookings/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const idx = db.bookings.findIndex(x => x.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = db.bookings.splice(idx, 1);
  logAction('removed a booking', `#${removed.id} on ${removed.date}`, req);
  db.payments = db.payments.filter(p => p.bookingId !== removed.id);
  save();
  res.json({ removed: removed.id });
});

app.get('/api/admin/bookings', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  let rows = db.bookings.slice();
  if (from) rows = rows.filter(b => b.date >= from);
  if (to) rows = rows.filter(b => b.date <= to);
  rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  res.json(rows.map(expandBooking));
});

app.get('/api/admin/bookings/:id', requireRole('admin', 'office'), (req, res) => {
  const b = getDb().bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(expandBooking(b));
});

app.patch('/api/admin/bookings/:id', requireRole('admin', 'office', 'kleaner'), (req, res) => {
  const db = getDb();
  const b = db.bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'kleaner') {
    if (b.staffId !== req.user.staffId) return res.status(403).json({ error: 'That is not your job.' });
    const allowed = ['in_progress', 'completed'];
    if (!allowed.includes(req.body.status) || Object.keys(req.body).some(k => k !== 'status')) {
      return res.status(403).json({ error: 'You can only start or finish your own cleans.' });
    }
  }
  const { status, staffId, date, start, notes, rating } = req.body;
  if (rating !== undefined) b.rating = rating === null ? null : Math.max(1, Math.min(5, +rating));
  if (status && status === 'cancelled' && b.status !== 'cancelled') applyCancellation(db, b);
  if (status === 'booked' && b.status === 'requested') {
    const c = db.clients.find(x => x.id === b.clientId);
    const staffName = db.staff.find(x => x.id === b.staffId)?.name || 'your cleaner';
    if (c) notifyClient(db, {
      clientId: c.id, bookingId: b.id,
      subject: `Your clean on ${b.date} is confirmed`,
      body: `Hi ${c.name.split(' ')[0]}, your clean on ${b.date} at ${b.start} is confirmed. ${staffName} will be looking after you. Klea ✦`
    });
  }
  if (status && status !== b.status) logAction(`marked a clean ${status.replace('_', ' ')}`, `booking #${b.id}`, req);
  if (staffId && staffId !== b.staffId) {
    const to = db.staff.find(x => x.id === +staffId);
    logAction('reassigned a clean', `booking #${b.id} to ${to?.name || 'someone'}`, req);
  }
  if (status) b.status = status;
  if (staffId) b.staffId = staffId;
  if (date) b.date = date;
  if (start) b.start = start;
  if (notes !== undefined) b.notes = notes;
  save();
  res.json(expandBooking(b));
});

app.post('/api/admin/bookings/:id/checklist/:itemId', requireRole('admin', 'office', 'kleaner'), (req, res) => {
  const db = getDb();
  const b = db.bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'kleaner' && b.staffId !== req.user.staffId) return res.status(403).json({ error: 'That is not your job.' });
  const item = b.checklist.find(i => i.id === +req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  item.done = !item.done;
  save();
  res.json(req.user.role === 'kleaner' ? stripMoney(expandBooking(b)) : expandBooking(b));
});

app.post('/api/admin/clients', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { name, email = '', phone = '', postcode = '', address = '', type = 'residential', notes = '' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Please enter the client\'s name.' });
  if (!email.trim() && !phone.trim()) {
    return res.status(400).json({ error: 'Add an email or a phone number so you can contact them.' });
  }
  // Email is optional, but must be unique when given, since clients sign in
  // to the "My cleans" portal with it
  if (email.trim() && db.clients.some(c => (c.email || '').toLowerCase() === email.trim().toLowerCase())) {
    return res.status(409).json({ error: 'A client with that email already exists.' });
  }
  const c = {
    id: nextId('clients'), name: name.trim(), email: email.trim(), phone: phone.trim(),
    postcode: postcode.toUpperCase().trim(), address, type, notes
  };
  db.clients.push(c);
  logAction('added a client', c.name, req);
  save();
  res.status(201).json(c);
});

app.get('/api/admin/clients', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json(db.clients.map(c => {
    const theirs = db.bookings.filter(b => b.clientId === c.id && b.status !== 'cancelled');
    const next = theirs.filter(b => b.status === 'booked').sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      ...c,
      totalBookings: theirs.length,
      lifetimeValue: Math.round(theirs.reduce((t, b) => t + b.price, 0) * 100) / 100,
      nextVisit: next ? next.date + ' ' + next.start : null,
      subscriber: theirs.some(b => b.seriesId)
    };
  }));
});

app.patch('/api/admin/clients/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const c = db.clients.find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  for (const k of ['name', 'email', 'phone', 'postcode', 'address', 'type', 'notes']) {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  }
  logAction('updated a client', c.name, req);
  save();
  res.json(c);
});

app.delete('/api/admin/clients/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const c = db.clients.find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const live = db.bookings.filter(b => b.clientId === c.id && b.status !== 'cancelled' && b.status !== 'completed');
  if (live.length && !req.body?.force) {
    return res.status(409).json({ error: `${c.name} still has ${live.length} clean${live.length > 1 ? 's' : ''} booked. Cancel or complete those first.` });
  }
  db.clients = db.clients.filter(x => x.id !== c.id);
  db.bookings = db.bookings.filter(b => b.clientId !== c.id);
  db.invoices = (db.invoices || []).filter(i => i.clientId !== c.id);
  db.messages = db.messages.filter(m => m.clientId !== c.id);
  db.payments = db.payments.filter(p => p.clientId !== c.id);
  logAction('deleted a client', c.name, req);
  save();
  res.json({ ok: true });
});

app.get('/api/admin/clients/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const c = db.clients.find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...c,
    bookings: db.bookings.filter(b => b.clientId === c.id).map(expandBooking).sort((a, b) => b.date.localeCompare(a.date)),
    messages: db.messages.filter(m => m.clientId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    payments: db.payments.filter(p => p.clientId === c.id),
    invoices: (db.invoices || []).filter(i => i.clientId === c.id).map(expandInvoice)
  });
});

app.get('/api/admin/staff', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    companyLegal: companyLegalStatus(),
    staff: db.staff.map(s => ({
      ...s,
      jobsToday: db.bookings.filter(b => b.staffId === s.id && b.date === today && b.status !== 'cancelled').length,
      jobsWeek: db.bookings.filter(b => b.staffId === s.id && b.date >= today && b.date < new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) && b.status !== 'cancelled').length,
      compliance: complianceFor(s)
    }))
  });
});

app.post('/api/admin/staff', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { name, phone = '', postcode = '', days = [1, 2, 3, 4, 5], start = '08:00', end = '16:00' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const colours = ['#D8BFA3', '#C9A36A', '#C98A5D', '#BCA88E', '#B5764C', '#E0D2B8'];
  const s = {
    id: nextId('staff'), name, phone, postcode: postcode.toUpperCase(), colour: colours[db.staff.length % colours.length],
    days, start, end, active: true,
    photo: req.body.photo || '', bio: req.body.bio || '', rate: +req.body.rate || 12.50,
    email: req.body.email || '', address: req.body.address || '', dob: req.body.dob || '',
    niNumber: req.body.niNumber || '',
    emergencyContact: req.body.emergencyContact || { name: '', phone: '' },
    bank: req.body.bank || '',
    legal: {
      dbs: {}, rightToWork: {}, contract: {}, training: {},
      ...(req.body.legal || {})
    }
  };
  db.staff.push(s);
  save();
  res.status(201).json(s);
});

app.patch('/api/admin/staff/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { legal, emergencyContact, ...rest } = req.body;
  Object.assign(s, rest);
  if (rest.rate !== undefined) s.rate = +rest.rate || s.rate;
  if (emergencyContact) s.emergencyContact = { ...(s.emergencyContact || {}), ...emergencyContact };
  if (legal) {
    s.legal = s.legal || {};
    for (const key of ['dbs', 'rightToWork', 'contract', 'training']) {
      if (legal[key]) s.legal[key] = { ...(s.legal[key] || {}), ...legal[key] };
    }
  }
  save();
  res.json(s);
});

// ---------- Become a Kleaner: public application + admin hiring pipeline ----------
app.post('/api/apply', (req, res) => {
  const db = getDb();
  const { name, email, phone = '', postcode = '', transport = '', days = [], hours = '', experience = '', rightToWork = '', dbs = '', about = '' } = req.body;
  if (!name || !email || !postcode) return res.status(400).json({ error: 'Name, email and postcode are required.' });
  if (!db.applications) db.applications = [];
  if (db.applications.some(a => (a.email || '').toLowerCase() === String(email).toLowerCase() && a.status !== 'rejected')) {
    return res.status(409).json({ error: 'We already have an application from that email. We will be in touch soon.' });
  }
  const a = {
    id: nextId('applications'), name, email, phone, postcode: postcode.toUpperCase(),
    transport, days, hours, experience, rightToWork, dbs, about,
    status: 'new', appliedAt: new Date().toISOString()
  };
  db.applications.push(a);
  save();
  res.status(201).json({ ok: true });
});

app.get('/api/admin/applicants', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json((db.applications || []).slice().sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)));
});

app.patch('/api/admin/applicants/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const a = (db.applications || []).find(x => x.id === +req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (req.body.status) a.status = req.body.status;
  save();
  res.json(a);
});

// Hire: converts the applicant into a cleaner file. Legal record starts empty
// on purpose so the compliance chips show exactly what onboarding still needs.
app.post('/api/admin/applicants/:id/hire', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const a = (db.applications || []).find(x => x.id === +req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (a.status === 'hired') return res.status(400).json({ error: 'Already hired.' });
  const DAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const colours = ['#D8BFA3', '#C9A36A', '#C98A5D', '#BCA88E', '#B5764C', '#E0D2B8'];
  const s = {
    id: nextId('staff'), name: a.name, phone: a.phone, postcode: a.postcode,
    colour: colours[db.staff.length % colours.length],
    days: (a.days || []).map(d => DAY_NUM[d]).filter(d => d !== undefined),
    start: '09:00', end: '17:00', active: true,
    photo: '', bio: '', rate: +req.body.rate || 12.50,
    email: a.email, address: '', dob: '', niNumber: '',
    emergencyContact: { name: '', phone: '' }, bank: '',
    legal: { dbs: a.dbs === 'have' ? { status: 'clear' } : {}, rightToWork: {}, contract: {}, training: {} }
  };
  db.staff.push(s);
  logAction('hired a Kleaner', a.name, req);
  a.status = 'hired';
  a.hiredStaffId = s.id;
  save();
  res.status(201).json({ staff: s, applicant: a });
});

// ---------- Cleaner app (demo: pick who you are, no login) ----------
app.get('/api/cleaner/staff', (req, res) => {
  const db = getDb();
  res.json(db.staff.filter(s => s.active).map(s => ({ id: s.id, name: s.name, photo: s.photo, colour: s.colour, postcode: s.postcode })));
});

app.get('/api/cleaner/:id/day', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const jobs = db.bookings
    .filter(b => b.staffId === s.id && b.date === date && b.status !== 'cancelled')
    .map(expandBooking)
    .map(b => req.user.role === 'kleaner' ? stripMoney(b) : b)
    .sort((a, b) => a.start.localeCompare(b.start));
  res.json({ staff: { id: s.id, name: s.name, photo: s.photo }, date, jobs });
});

// A Kleaner's own week, for their portal rota
app.get('/api/cleaner/:id/week', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const start = req.query.start || new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  res.json({
    staff: { id: s.id, name: s.name, photo: s.photo, days: s.days, start: s.start, end: s.end },
    days,
    jobs: db.bookings
      .filter(b => b.staffId === s.id && days.includes(b.date) && b.status !== 'cancelled' && b.status !== 'requested')
      .map(expandBooking).map(b => req.user.role === 'kleaner' ? stripMoney(b) : b),
    absences: (db.absences || []).filter(a => a.staffId === s.id && a.from <= days[6] && a.to >= days[0])
  });
});

app.patch('/api/cleaner/:id/hours', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { days, start, end } = req.body;
  if (Array.isArray(days)) s.days = days.map(Number).filter(d => d >= 0 && d <= 6);
  if (start) s.start = start;
  if (end) s.end = end;
  save();
  res.json({ days: s.days, start: s.start, end: s.end });
});

app.post('/api/cleaner/:id/timesheet', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { date, hours, note = '' } = req.body;
  if (!date || !hours || +hours <= 0 || +hours > 12) return res.status(400).json({ error: 'Enter a date and up to 12 hours.' });
  if (!db.timesheets) db.timesheets = [];
  const t = { id: nextId('timesheets'), staffId: s.id, date, hours: round2(+hours), note, loggedAt: new Date().toISOString() };
  db.timesheets.push(t);
  save();
  res.status(201).json(t);
});

app.post('/api/staff/:id/documents', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { name, dataUrl } = req.body;
  if (!name || !dataUrl || !/^data:(image\/|application\/pdf)/.test(dataUrl)) {
    return res.status(400).json({ error: 'Upload an image or PDF.' });
  }
  if (dataUrl.length > 4_000_000) return res.status(400).json({ error: 'File too large, please use a smaller scan or photo.' });
  if (!s.documents) s.documents = [];
  const doc = { id: (s.documents.reduce((m, d) => Math.max(m, d.id), 0) + 1), name, dataUrl, uploadedAt: new Date().toISOString() };
  s.documents.push(doc);
  save();
  res.status(201).json(s.documents.map(d => ({ id: d.id, name: d.name, uploadedAt: d.uploadedAt })));
});

app.get('/api/staff/:id/documents', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const s = getDb().staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json((s.documents || []).map(d => ({ id: d.id, name: d.name, uploadedAt: d.uploadedAt })));
});

app.get('/api/staff/:id/documents/:docId', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const s = getDb().staff.find(x => x.id === +req.params.id);
  const d = (s?.documents || []).find(x => x.id === +req.params.docId);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.delete('/api/staff/:id/documents/:docId', requireRole('admin', 'office', 'kleaner'), requireSelfOrOffice, (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  s.documents = (s.documents || []).filter(d => d.id !== +req.params.docId);
  save();
  res.json({ ok: true });
});

// ---------- Client portal (demo: email lookup, no password) ----------
function portalClient(email) {
  const db = getDb();
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return null;
  return db.clients.find(c => (c.email || '').toLowerCase() === wanted);
}

app.post('/api/portal/lookup', (req, res) => {
  const c = portalClient(req.body.email);
  if (!c) return res.status(404).json({ error: 'We could not find that email. Use the address you booked with.' });
  const db = getDb();
  const bookings = db.bookings
    .filter(b => b.clientId === c.id)
    .map(expandBooking)
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  res.json({ client: { id: c.id, name: c.name, email: c.email, postcode: c.postcode }, bookings });
});

function portalBooking(req, res) {
  const c = portalClient(req.body.email);
  if (!c) { res.status(403).json({ error: 'Email does not match this booking.' }); return null; }
  const b = getDb().bookings.find(x => x.id === +req.params.id && x.clientId === c.id);
  if (!b) { res.status(404).json({ error: 'Booking not found.' }); return null; }
  return { c, b };
}

app.post('/api/portal/bookings/:id/cancel', (req, res) => {
  const hit = portalBooking(req, res);
  if (!hit) return;
  const db = getDb();
  const { c, b } = hit;
  if (b.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });
  applyCancellation(db, b);
  b.status = 'cancelled';
  notifyClient(db, {
    clientId: c.id, bookingId: b.id,
    subject: `Your clean on ${b.date} is cancelled`,
    body: `Hi ${c.name.split(' ')[0]}, your clean on ${b.date} at ${b.start} is cancelled.${b.cancellationFee > 0 ? ` As it was after midday the day before, a 50% fee of £${b.cancellationFee} applies.` : ' No charge.'} Klea ✦`
  });
  save();
  res.json({ booking: expandBooking(b) });
});

app.post('/api/portal/bookings/:id/reschedule', (req, res) => {
  const hit = portalBooking(req, res);
  if (!hit) return;
  const db = getDb();
  const { c, b } = hit;
  const { date, time } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Pick a new date and time.' });
  if (b.status !== 'booked') return res.status(400).json({ error: 'Only upcoming cleans can be moved.' });
  if (Date.now() >= cancelDeadline(b).getTime()) {
    return res.status(400).json({ error: 'Changes are free until midday the day before. Please message us to move this one.' });
  }
  // keep their usual cleaner if free, otherwise closest available patch
  const opts = staffOptions({ date, postcode: c.postcode, durationMins: b.durationMins, excludeBookingId: b.id });
  const keep = opts.find(o => o.staffId === b.staffId && o.slots.includes(time));
  const fit = keep || opts.find(o => o.slots.includes(time));
  if (!fit) return res.status(409).json({ error: 'That slot is not available. Try another time.' });
  b.date = date; b.start = time; b.staffId = fit.staffId;
  notifyClient(db, {
    clientId: c.id, bookingId: b.id,
    subject: `Your clean has moved to ${date}`,
    body: `Hi ${c.name.split(' ')[0]}, your clean has moved to ${date} at ${time}. ${fit.name} will be with you. Klea ✦`
  });
  save();
  res.json({ booking: expandBooking(b) });
});

app.post('/api/portal/bookings/:id/rate', (req, res) => {
  const hit = portalBooking(req, res);
  if (!hit) return;
  const { b } = hit;
  if (b.status !== 'completed') return res.status(400).json({ error: 'You can rate a clean once it is finished.' });
  b.rating = Math.max(1, Math.min(5, +req.body.rating || 0)) || null;
  save();
  res.json({ booking: expandBooking(b) });
});

// ---------- Job photos ("every clean is photographed") ----------
app.post('/api/admin/bookings/:id/photos', requireRole('admin', 'office', 'kleaner'), (req, res) => {
  const db = getDb();
  const b = db.bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'kleaner' && b.staffId !== req.user.staffId) return res.status(403).json({ error: 'That is not your job.' });
  const { dataUrl, caption = '' } = req.body;
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return res.status(400).json({ error: 'A photo is required.' });
  if (dataUrl.length > 2_000_000) return res.status(400).json({ error: 'Photo too large, please retake.' });
  if (!b.photos) b.photos = [];
  const photo = { id: (b.photos.reduce((m, p) => Math.max(m, p.id), 0) + 1), dataUrl, caption, takenAt: new Date().toISOString() };
  b.photos.push(photo);
  logAction('added a job photo', `booking #${b.id}`, req);
  save();
  res.json(req.user.role === 'kleaner' ? stripMoney(expandBooking(b)) : expandBooking(b));
});

app.delete('/api/admin/bookings/:id/photos/:photoId', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const b = db.bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  b.photos = (b.photos || []).filter(p => p.id !== +req.params.photoId);
  save();
  res.json(expandBooking(b));
});

// ---------- Free re-clean under the guarantee ----------
app.post('/api/admin/bookings/:id/reclean', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const b = db.bookings.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const d = new Date((req.body.date || b.date) + 'T12:00:00');
  if (!req.body.date) d.setDate(d.getDate() + 1);
  const checklist = [];
  let ci = 0;
  for (const sec of checklistFor(b.serviceId)) for (const item of sec.items) checklist.push({ id: ++ci, section: sec.section, label: item, done: false });
  const rc = {
    id: nextId('bookings'), clientId: b.clientId, serviceId: b.serviceId, size: b.size,
    addonIds: [], frequency: 'once', seriesId: null,
    date: d.toISOString().slice(0, 10), start: req.body.time || b.start,
    durationMins: b.durationMins, staffId: b.staffId, status: 'booked',
    price: 0, teamClean: false, photos: [], rating: null,
    recleanOf: b.id, notes: `Free re-clean under our guarantee for booking #${b.id}.`,
    checklist, createdAt: new Date().toISOString()
  };
  db.bookings.push(rc);
  const c = db.clients.find(x => x.id === b.clientId);
  notifyClient(db, {
    clientId: b.clientId, bookingId: rc.id,
    subject: 'We have booked your free re-clean',
    body: `Hi ${c?.name?.split(' ')[0] || 'there'}, we are sorry your last clean was not quite right. We have booked a free re-clean for ${rc.date} at ${rc.start}, no charge. Klea`
  });
  save();
  res.status(201).json({ reclean: expandBooking(rc) });
});

// ---------- Costs: inventory + expense ledger ----------
app.get('/api/admin/costs', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const inventory = (db.inventory || []).map(i => ({ ...i, low: i.stock <= i.reorderAt }));
  const monthPrefix = new Date().toISOString().slice(0, 7);
  res.json({
    inventory,
    lowStock: inventory.filter(i => i.low),
    stockValue: round2(inventory.reduce((t, i) => t + i.stock * i.unitCost, 0)),
    monthSpend: round2((db.expenses || []).filter(e => e.date.startsWith(monthPrefix)).reduce((t, e) => t + e.amount, 0)),
    expenses: (db.expenses || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 60)
  });
});

app.post('/api/admin/inventory', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { name, unitCost, stock = 0, reorderAt = 2 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const item = { id: nextId('inventory'), name, unitCost: +unitCost || 0, stock: +stock || 0, reorderAt: +reorderAt || 0 };
  db.inventory.push(item);
  save();
  res.status(201).json(item);
});

// Adjust stock. delta>0 with purchase=true also logs the cost in the expense ledger.
app.post('/api/admin/inventory/:id/adjust', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const item = (db.inventory || []).find(i => i.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const delta = +req.body.delta || 0;
  item.stock = Math.max(0, item.stock + delta);
  if (delta > 0 && req.body.purchase) {
    db.expenses.push({
      id: nextId('expenses'), date: new Date().toISOString().slice(0, 10),
      category: 'supplies', description: `${item.name} × ${delta}`, amount: round2(delta * item.unitCost)
    });
  }
  save();
  res.json(item);
});

app.post('/api/admin/expenses', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { date, category = 'other', description = '', amount } = req.body;
  if (!date || !amount) return res.status(400).json({ error: 'Date and amount are required.' });
  const e = { id: nextId('expenses'), date, category, description, amount: round2(+amount) };
  db.expenses.push(e);
  save();
  res.status(201).json(e);
});

app.delete('/api/admin/expenses/:id', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  db.expenses = (db.expenses || []).filter(e => e.id !== +req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Payroll ----------
app.get('/api/admin/payroll', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json({
    staff: db.staff.filter(s => s.active).map(s => ({
      staffId: s.id, name: s.name, photo: s.photo, colour: s.colour, rate: s.rate, weekendRate: s.weekendRate || null,
      ...staffEarnings(s)
    })),
    payouts: (db.payouts || [])
      .map(p => ({ ...p, staffName: db.staff.find(s => s.id === p.staffId)?.name }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  });
});

// Per-cleaner breakdown: every completed job and manual time entry, grouped by week
app.get('/api/admin/payroll/:staffId', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.params.staffId);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const entries = [];
  for (const b of db.bookings.filter(b => b.staffId === s.id && b.status === 'completed')) {
    const c = db.clients.find(x => x.id === b.clientId);
    const hours = round2(b.durationMins / 60);
    const rate = rateFor(s, b.date);
    entries.push({ type: 'job', date: b.date, label: `${c?.name || 'Client'} · ${SERVICES.find(x => x.id === b.serviceId)?.name || 'Clean'}`, hours, rate, amount: round2(hours * rate) });
  }
  for (const t of (db.timesheets || []).filter(t => t.staffId === s.id)) {
    const rate = rateFor(s, t.date);
    entries.push({ type: 'extra', date: t.date, label: t.note || 'Extra time logged', hours: t.hours, rate, amount: round2(t.hours * rate) });
  }
  const weekStart = d => {
    const dt = new Date(d + 'T12:00:00');
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const weeks = {};
  for (const e of entries) {
    const w = weekStart(e.date);
    (weeks[w] = weeks[w] || []).push(e);
  }
  res.json({
    staff: { id: s.id, name: s.name, photo: s.photo, rate: s.rate, weekendRate: s.weekendRate || null },
    ...staffEarnings(s),
    weeks: Object.keys(weeks).sort().reverse().map(w => ({
      weekStart: w,
      entries: weeks[w].sort((a, b) => a.date.localeCompare(b.date)),
      total: round2(weeks[w].reduce((t, e) => t + e.amount, 0))
    })),
    payouts: (db.payouts || []).filter(p => p.staffId === s.id).sort((a, b) => b.date.localeCompare(a.date))
  });
});

app.post('/api/admin/payroll/pay', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const s = db.staff.find(x => x.id === +req.body.staffId);
  if (!s) return res.status(404).json({ error: 'Staff member not found' });
  const due = staffEarnings(s).due;
  const amount = round2(req.body.amount != null ? +req.body.amount : due);
  if (amount <= 0) return res.status(400).json({ error: 'Nothing due to pay out.' });
  if (amount > due + 0.01) return res.status(400).json({ error: `Only £${due} is due for ${s.name}.` });
  const today = new Date().toISOString().slice(0, 10);
  const p = { id: nextId('payouts'), staffId: s.id, amount, period: 'Wages to ' + today, method: 'Bank transfer (demo)', date: today };
  db.payouts.push(p);
  logAction('paid wages', `${s.name}, £${amount}`, req);
  save();
  res.status(201).json({ payout: p, remaining: staffEarnings(s).due });
});

// ---------- Profit and loss ----------
app.get('/api/admin/pnl', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const months = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const revenue = round2(db.payments.filter(p => p.status === 'paid' && p.date.startsWith(prefix)).reduce((t, p) => t + p.amount, 0));
    const doneJobs = db.bookings.filter(b => b.status === 'completed' && b.date.startsWith(prefix));
    const wages = round2(doneJobs.reduce((t, b) => {
      const s = db.staff.find(x => x.id === b.staffId);
      return t + (b.durationMins / 60) * (s ? rateFor(s, b.date) : 0);
    }, 0));
    const monthExpenses = (db.expenses || []).filter(e => e.date.startsWith(prefix));
    const supplies = round2(monthExpenses.filter(e => e.category === 'supplies').reduce((t, e) => t + e.amount, 0));
    const byCategory = {};
    for (const e of monthExpenses.filter(e => e.category !== 'supplies')) {
      byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount);
    }
    const overheads = round2(Object.values(byCategory).reduce((t, v) => t + v, 0));
    const gross = round2(revenue - wages - supplies);
    const net = round2(gross - overheads);
    months.push({
      label, current: i === 0, jobs: doneJobs.length, revenue, wages, supplies, gross, overheads, net, byCategory,
      margin: revenue > 0 ? Math.round((net / revenue) * 100) : 0
    });
  }
  res.json({ months });
});

app.get('/api/admin/messages', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  res.json(db.messages.map(m => ({
    ...m,
    clientName: db.clients.find(c => c.id === m.clientId)?.name || '—'
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post('/api/admin/messages', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const { clientId, channel = 'email', body, subject } = req.body;
  if (!clientId || !body) return res.status(400).json({ error: 'clientId and body required' });
  const m = notifyClient(db, { clientId, channel, subject: subject || 'A message from Klea', body });
  save();
  res.status(201).json({ ...m, clientName: db.clients.find(c => c.id === m.clientId)?.name });
});

app.get('/api/admin/rota', requireRole('admin', 'office'), (req, res) => {
  const db = getDb();
  const start = req.query.start || new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  res.json({
    days,
    staff: db.staff.filter(s => s.active),
    bookings: db.bookings.filter(b => days.includes(b.date) && b.status !== 'cancelled' && b.status !== 'requested').map(expandBooking),
    absences: (db.absences || []).filter(a => a.from <= days[6] && a.to >= days[0])
  });
});

// serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---------- Automatic Guesty sync ----------
// (declared with function syntax so it is available to handlers defined above)
// Changeovers must not depend on somebody remembering to press a button.
let guestySyncing = false;
async function runGuestySync() {
  if (!guestyConfigured() || guestySyncing) return;
  guestySyncing = true;
  try {
    const db = getDb();
    const days = db.settings.guestyLookaheadDays || 180;
    const today = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const [listings, reservations] = await Promise.all([fetchListings(), fetchReservations({ from: today, to })]);
    cacheListings(listings);   // so an instant update can stand on its own
    const result = importReservations({ listings, reservations });
    db.settings.guestyLastSync = new Date().toISOString();
    db.settings.guestyLastError = null;
    if (result.created.length || result.cancelled) {
      logAction('synced Guesty automatically', `${result.created.length} imported, ${result.cancelled} cancelled`, null);
      console.log(`Guesty auto-sync: ${result.created.length} imported, ${result.cancelled} cancelled`);
    }
    save();
  } catch (e) {
    // Record it so the office can see the sync is unhealthy rather than assuming silence means fine
    const db = getDb();
    db.settings.guestyLastError = { message: e.message, at: new Date().toISOString() };
    save();
    console.error('Guesty auto-sync failed:', e.message);
  }
  guestySyncing = false;
}
setTimeout(runGuestySync, 20_000);          // shortly after boot
setInterval(runGuestySync, 3600 * 1000);     // then hourly

// ---------- Automated day-before reminders (demo: logged, not sent) ----------
function runReminders() {
  const db = getDb();
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  let sent = 0;
  for (const b of db.bookings.filter(x => x.date === tomorrow && x.status === 'booked' && !x.reminderSent)) {
    const c = db.clients.find(x => x.id === b.clientId);
    const s = db.staff.find(x => x.id === b.staffId);
    const svc = SERVICES.find(x => x.id === b.serviceId);
    if (!c) continue;
    notifyClient(db, {
      clientId: c.id, bookingId: b.id, preferSms: true,
      subject: `Your clean tomorrow at ${b.start}`,
      body: `Hi ${c.name.split(' ')[0]}, a reminder that ${s?.name || 'your cleaner'} will be with you tomorrow at ${b.start} for your ${(svc?.name || 'clean').toLowerCase()}. Klea ✦`
    });
    b.reminderSent = true;
    sent++;
  }
  if (sent) { save(); console.log(`Reminders: ${sent} day-before message(s) queued`); }
}
runReminders();
setInterval(runReminders, 3600 * 1000);

const PORT = process.env.API_PORT || (process.env.NODE_ENV === 'production' ? process.env.PORT : null) || 4600;
app.listen(PORT, () => console.log(`Klea API running on http://localhost:${PORT}`));
