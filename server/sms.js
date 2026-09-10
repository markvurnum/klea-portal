// Sending text messages through Twilio.
//
// Unlike email, texts cost money, roughly 4p each. Nothing is ever sent unless
// the office has switched this on and put their own Twilio details in, so it
// cannot quietly run up a bill.
//
// The auth token lives in the database on the server, never in the code and
// never in a file that could reach GitHub.
import { getDb } from './db.js';

export function smsSettings(db = getDb()) {
  return db.settings.sms || {};
}

export function isSmsConfigured(db = getDb()) {
  const s = smsSettings(db);
  return !!(s.enabled && s.accountSid && s.authToken && s.from);
}

// The auth token never leaves the server, not even to an admin screen
export function safeSmsSettings(db = getDb()) {
  const s = smsSettings(db);
  return {
    enabled: !!s.enabled,
    accountSid: s.accountSid || '',
    from: s.from || '',
    hasAuthToken: !!s.authToken,
    remindersByText: !!s.remindersByText,
    lastSentAt: s.lastSentAt || null,
    lastError: s.lastError || null,
    sentThisMonth: countThisMonth(db)
  };
}

// So the office can see what it is costing them before the bill arrives
function countThisMonth(db) {
  const month = new Date().toISOString().slice(0, 7);
  return (db.messages || []).filter(m =>
    m.channel === 'sms' && m.smsStatus === 'sent' && (m.createdAt || '').startsWith(month)
  ).length;
}

// UK numbers are written every which way. Twilio wants the full international
// form, so 07700 900123 has to become +447700900123.
export function tidyNumber(raw, country = 'GB') {
  const n = String(raw || '').replace(/[^\d+]/g, '');
  if (!n) return null;
  if (n.startsWith('+')) return n;
  if (country === 'GB') {
    if (n.startsWith('07') && n.length === 11) return '+44' + n.slice(1);
    if (n.startsWith('447')) return '+' + n;
    if (n.startsWith('44')) return '+' + n;
  }
  return null;
}

export async function sendSms({ to, body }, db = getDb()) {
  const s = smsSettings(db);
  if (!isSmsConfigured(db)) throw new Error('Text messages are not switched on yet.');
  const number = tidyNumber(to);
  if (!number) throw new Error('That does not look like a mobile number we can text.');

  const auth = Buffer.from(`${s.accountSid}:${s.authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(s.accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: number, From: s.from, Body: body })
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Twilio did not accept those details. Check the account SID and token.');
    throw new Error(data?.message || `Twilio refused the message (${res.status}).`);
  }
  return { sid: data.sid, to: number };
}
