// Secure local key form — paste credentials in the browser, they go straight to
// .env on disk. Nothing is sent anywhere else and nothing appears in chat.
// Run: npm run keys  → open http://localhost:4750
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(ROOT, '.env');
const FIELDS = [
  { key: 'GUESTY_CLIENT_ID', label: 'Guesty Client ID', hint: 'Guesty → Integrations → API / Developer, create an integration. NOT your account password.' },
  { key: 'GUESTY_CLIENT_SECRET', label: 'Guesty Client Secret', hint: 'Shown once when the integration is created. Copy it straight in here.' }
];

function readEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* no .env yet */ }
  return out;
}

function writeEnv(updates) {
  const env = readEnv();
  for (const [k, v] of Object.entries(updates)) if (v !== undefined && v !== '') env[k] = v.trim();
  fs.writeFileSync(ENV_PATH, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
}

const page = saved => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Klea keys</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
 body{font-family:'DM Sans',sans-serif;background:#FBF8F1;color:#3B332A;max-width:620px;margin:0 auto;padding:40px 22px}
 h1{font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:28px;margin:0 0 4px}
 .sp{color:#C9A36A}
 p.lede{color:#8C8174;margin:0 0 24px}
 label{display:block;font-weight:600;font-size:14px;margin:18px 0 4px}
 .hint{color:#8C8174;font-size:13px;font-weight:400;margin-bottom:6px}
 input{width:100%;padding:12px 14px;border:1.5px solid #E7DECD;border-radius:12px;font:inherit;background:#fff;box-sizing:border-box}
 input:focus{outline:none;border-color:#B5764C}
 button{margin-top:22px;background:#B5764C;color:#fff;border:none;border-radius:999px;padding:12px 26px;font:inherit;font-weight:600;cursor:pointer}
 .ok{background:rgba(125,146,113,.16);color:#5e7052;padding:12px 16px;border-radius:12px;margin-bottom:20px;font-size:14px}
 .note{border:1px dashed #C9A36A;background:#F3EDE2;border-radius:12px;padding:12px 16px;font-size:13.5px;margin-top:24px}
</style></head><body>
<h1>klea<span class="sp">✦</span> keys</h1>
<p class="lede">Paste the Guesty credentials below. They are written straight to a local .env file and never appear in chat.</p>
${saved ? '<div class="ok">✓ Saved to .env. You can close this tab.</div>' : ''}
<form method="POST">
${FIELDS.map(f => `<label>${f.label}<div class="hint">${f.hint}</div>
<input name="${f.key}" type="password" autocomplete="off" placeholder="${readEnv()[f.key] ? '•••••••• (already set, leave blank to keep)' : ''}"></label>`).join('')}
<button type="submit">Save to .env</button>
</form>
<div class="note">Once saved, tell Claude and the same values get set on Railway so the live portal can sync. The .env file is gitignored.</div>
</body></html>`;

http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const updates = {};
      for (const f of FIELDS) updates[f.key] = params.get(f.key);
      writeEnv(updates);
      console.log('Saved:', FIELDS.filter(f => params.get(f.key)).map(f => f.key).join(', ') || 'nothing new');
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(page(true));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(page(false));
}).listen(4750, () => console.log('Key form: http://localhost:4750'));
