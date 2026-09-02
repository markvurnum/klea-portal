const TOKEN_KEY = 'klea-token';

export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  set: t => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY)
};

async function req(method, url, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = auth.token();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    auth.clear();
    window.dispatchEvent(new Event('klea-signed-out'));
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  get: url => req('GET', url),
  post: (url, body) => req('POST', url, body),
  patch: (url, body) => req('PATCH', url, body),
  del: url => req('DELETE', url)
};
