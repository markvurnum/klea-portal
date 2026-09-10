// Sending email through Klea's own IONOS mailbox.
//
// Everything goes out as hello@kleahome.co.uk and replies land back in that
// same mailbox, so the office reads and answers them where they already work.
// No third party service is involved and nothing costs anything.
//
// Deliberately written against Node's own TLS, so the project keeps its single
// dependency. It speaks just enough SMTP to send a plain text message.
//
// The mailbox password lives in the database on the server, never in the code
// and never in a file that could reach GitHub.
import tls from 'tls';
import crypto from 'crypto';
import { getDb, save } from './db.js';

const CONNECT_TIMEOUT_MS = 20_000;

// IONOS asks for a pause between messages and refuses bursts. A day's worth of
// reminders therefore trickles out rather than arriving all at once.
const DEFAULT_GAP_MS = 6_000;

export function emailSettings(db = getDb()) {
  return db.settings.email || {};
}

export function isEmailConfigured(db = getDb()) {
  const e = emailSettings(db);
  return !!(e.enabled && e.host && e.user && e.pass && e.from);
}

// Never let the password out of the server, not even to an admin screen
export function safeEmailSettings(db = getDb()) {
  const e = emailSettings(db);
  return {
    enabled: !!e.enabled,
    host: e.host || 'smtp.ionos.co.uk',
    port: e.port || 465,
    user: e.user || '',
    from: e.from || '',
    fromName: e.fromName || 'Klea',
    replyTo: e.replyTo || '',
    hasPassword: !!e.pass,
    lastSentAt: e.lastSentAt || null,
    lastError: e.lastError || null,
    queued: queue.length
  };
}

// ---------- the smallest SMTP client that will do the job ----------

function connect({ host, port }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    const waiting = [];   // callers waiting for a reply
    const replies = [];   // replies that arrived before anyone asked, e.g. the greeting
    let lines = [];
    let buffer = '';
    let failed = null;

    let settled = false;
    let guard = null;

    // Anything that goes wrong has to reach the caller. Without this, an
    // unreachable mail server leaves the send hanging for ever and the whole
    // outgoing queue stops behind it.
    const fail = err => {
      failed = err;
      clearTimeout(guard);
      while (waiting.length) waiting.shift().reject(err);
      socket.destroy();
      if (!settled) { settled = true; reject(err); }
    };
    guard = setTimeout(
      () => fail(new Error('The mail server did not answer in time.')),
      CONNECT_TIMEOUT_MS
    );

    socket.setEncoding('utf8');
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error('The mail server did not answer in time.')));
    socket.on('error', e => fail(new Error(`Could not reach the mail server. ${e.message}`)));
    socket.on('close', () => { if (!failed) fail(new Error('The mail server closed the connection.')); });

    socket.on('data', chunk => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        lines.push(line);
        // A reply is finished when the code is followed by a space rather than a dash
        if (line.length < 4 || line[3] === ' ') {
          const reply = { code: parseInt(line.slice(0, 3), 10), text: lines.join(' ') };
          lines = [];
          const w = waiting.shift();
          // The server greets us before we ask anything, so a reply with nobody
          // waiting is held rather than thrown away
          if (w) w.resolve(reply); else replies.push(reply);
        }
      }
    });

    const expect = () => new Promise((res, rej) => {
      if (replies.length) return res(replies.shift());
      if (failed) return rej(failed);
      waiting.push({ resolve: res, reject: rej });
    });

    const send = line => { socket.write(line + '\r\n'); return expect(); };

    socket.once('secureConnect', () => {
      clearTimeout(guard);
      if (settled) return;
      settled = true;
      resolve({ expect, send, end: () => socket.end(), destroy: () => socket.destroy() });
    });
  });
}

function ok(reply, want, what) {
  if (!want.includes(reply.code)) {
    throw new Error(`${what} (${reply.code} ${reply.text.slice(0, 160)})`);
  }
}

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');

// Headers must be plain ASCII, so anything else is encoded the standard way
function encodeHeader(value) {
  const v = String(value);
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;
}

function buildMessage({ fromName, from, to, toName, subject, text, replyTo, domain }) {
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const body = b64(text).replace(/(.{76})/g, '$1\r\n');
  const headers = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${toName ? `${encodeHeader(toName)} <${to}>` : to}`,
    replyTo ? `Reply-To: <${replyTo}>` : null,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64'
  ].filter(Boolean);
  return { raw: headers.join('\r\n') + '\r\n\r\n' + body, messageId };
}

// Sends one message and resolves, or throws with something a person can act on
export async function sendMail({ to, toName, subject, text }, db = getDb()) {
  const e = emailSettings(db);
  if (!isEmailConfigured(db)) throw new Error('Email is not switched on yet.');
  if (!to || !/.+@.+\..+/.test(to)) throw new Error('That is not a usable email address.');

  const domain = (e.from.split('@')[1] || 'localhost');
  const { raw, messageId } = buildMessage({
    fromName: e.fromName || 'Klea', from: e.from, to, toName,
    subject, text, replyTo: e.replyTo || e.from, domain
  });

  const conn = await connect({ host: e.host, port: e.port || 465 });
  try {
    ok(await conn.expect(), [220], 'The mail server refused the connection');
    ok(await conn.send(`EHLO ${domain}`), [250], 'The mail server rejected the greeting');

    ok(await conn.send('AUTH LOGIN'), [334], 'The mail server would not start sign-in');
    ok(await conn.send(b64(e.user)), [334], 'The mail server rejected the mailbox address');
    const authed = await conn.send(b64(e.pass));
    if (authed.code !== 235) {
      throw new Error('The mailbox address or password was not accepted. Check them and save again.');
    }

    ok(await conn.send(`MAIL FROM:<${e.from}>`), [250], 'The mail server refused the sender');
    ok(await conn.send(`RCPT TO:<${to}>`), [250, 251], 'The mail server refused the recipient');
    ok(await conn.send('DATA'), [354], 'The mail server would not accept the message');
    ok(await conn.send(raw + '\r\n.'), [250], 'The message was not accepted');

    conn.send('QUIT').catch(() => {});
    return { messageId };
  } finally {
    conn.destroy();
  }
}

// ---------- the outgoing queue ----------
// Nothing sends straight away. Messages go on a queue and leave one at a time
// with a gap between them, which is what IONOS asks for and what stops a batch
// of reminders being treated as spam.

const queue = [];
let working = false;

export function queueMail(entry) {
  queue.push(entry);
  if (!working) drain();
}

async function drain() {
  working = true;
  while (queue.length) {
    const job = queue.shift();
    const db = getDb();
    if (!isEmailConfigured(db)) { queue.length = 0; break; }
    try {
      await sendMail(job, db);
      markMessage(db, job.messageRef, { emailStatus: 'sent', emailError: null });
      db.settings.email.lastSentAt = new Date().toISOString();
      db.settings.email.lastError = null;
    } catch (err) {
      markMessage(db, job.messageRef, { emailStatus: 'failed', emailError: err.message });
      db.settings.email.lastError = { message: err.message, at: new Date().toISOString() };
      console.error('Email failed:', err.message);
    }
    save();
    if (queue.length) await new Promise(r => setTimeout(r, emailSettings(db).gapMs || DEFAULT_GAP_MS));
  }
  working = false;
}

function markMessage(db, id, fields) {
  if (!id) return;
  const m = (db.messages || []).find(x => x.id === id);
  if (m) Object.assign(m, fields);
}
