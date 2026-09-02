// Tiny JSON-file datastore. All data lives in memory and is written to
// server/data/db.json after every change. No native modules, no external DB —
// perfect for a demo and easy to swap for Postgres later.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;
let saveTimer = null;

export function loadDb(seedFn) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = seedFn();
    persistNow();
  }
  return db;
}

export function getDb() { return db; }

export function save() {
  // debounce writes
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 150);
}

function persistNow() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
}

export function nextId(collection) {
  const max = db[collection].reduce((m, r) => Math.max(m, r.id), 0);
  return max + 1;
}
