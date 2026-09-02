import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, auth } from './api.js';
import ClientSite from './client.jsx';
import Admin from './admin.jsx';
import CleanerApp from './cleaner.jsx';
import Portal from './portal.jsx';
import Join from './join.jsx';
import Login from './login.jsx';

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function App() {
  const hash = useHash();
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    if (!auth.token()) { setUser(null); return; }
    api.get('/api/auth/me').then(r => setUser(r.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('klea-signed-out', out);
    return () => window.removeEventListener('klea-signed-out', out);
  }, []);

  const signOut = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* token may already be gone */ }
    auth.clear();
    setUser(null);
    window.location.hash = '#/';
  };

  const needsLogin = hash.startsWith('#/admin') || hash.startsWith('#/cleaner');

  if (needsLogin && user === undefined) {
    return <div className="container" style={{ padding: 60 }}>Loading…</div>;
  }

  if (needsLogin && !user) {
    return <Login intent={hash.startsWith('#/cleaner') ? 'cleaner' : 'team'} onSignedIn={u => {
      setUser(u);
      // Kleaners always land in their own portal
      if (u.role === 'kleaner') window.location.hash = '#/cleaner';
    }} />;
  }

  if (hash.startsWith('#/admin')) {
    // A Kleaner who lands on an admin link goes to their own portal instead
    if (user.role === 'kleaner') { window.location.hash = '#/cleaner'; return null; }
    const page = hash.split('/')[2] || 'dashboard';
    return <Admin page={page} user={user} onSignOut={signOut} />;
  }
  if (hash.startsWith('#/cleaner')) return <CleanerApp user={user} onSignOut={signOut} />;
  if (hash.startsWith('#/my')) return <Portal />;
  if (hash.startsWith('#/join')) return <Join />;
  return <ClientSite />;
}

createRoot(document.getElementById('root')).render(<App />);
