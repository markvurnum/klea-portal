// Generates strong passwords for every login and writes them to a local file.
// Nothing is printed to a terminal transcript or sent anywhere.
// Run: npm run passwords
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDb, getDb, save } from './server/db.js';
import { seed } from './server/seed.js';
import { hashPassword } from './server/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'credentials.txt');

// Readable but strong: 3 words + digits + symbol, ~60 bits of entropy
const WORDS = ['harbour','lantern','copper','willow','marble','thistle','beacon','cobble','saffron','amber','quarry','meadow','pebble','birch','cinder','otter','pewter','fennel','walnut','heather'];
const pick = arr => arr[crypto.randomInt(arr.length)];
const makePassword = () =>
  [pick(WORDS), pick(WORDS), pick(WORDS)].map(w => w[0].toUpperCase() + w.slice(1)).join('-')
  + crypto.randomInt(10, 100) + pick(['!', '#', '£', '@']);

loadDb(seed);
const db = getDb();
const rows = [];
for (const u of db.users || []) {
  const pw = makePassword();
  u.password = hashPassword(pw);
  rows.push({ name: u.name, email: u.email, role: u.role, password: pw });
}
save();

const body = [
  'KLEA PORTAL LOGINS',
  'Generated ' + new Date().toLocaleString('en-GB'),
  'https://portal.kleahome.co.uk',
  '',
  'Keep this file safe. Delete it once the passwords are stored in a password manager.',
  'Anyone with these can see staff National Insurance numbers, DBS details and client key codes.',
  '',
  ...rows.map(r => `${r.role.toUpperCase().padEnd(8)} ${r.name.padEnd(20)} ${r.email.padEnd(32)} ${r.password}`),
  ''
].join('\n');

fs.writeFileSync(OUT, body, { mode: 0o600 });
console.log(`Set ${rows.length} passwords. Written to: ${OUT}`);
console.log('Open that file to read them. They are not shown here on purpose.');
