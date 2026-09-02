import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle, Avatar, gbp, niceDate } from './ui.jsx';

// Client portal: look up your cleans by email (demo: no password),
// then reschedule or cancel under the policy, see photos, rate cleans.
export default function Portal() {
  const [email, setEmail] = useState(() => localStorage.getItem('klea-portal-email') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const lookup = async e => {
    if (e) e.preventDefault();
    setError('');
    try {
      const res = await api.post('/api/portal/lookup', { email });
      localStorage.setItem('klea-portal-email', email);
      setData(res);
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { if (email) lookup(); }, []);

  return (
    <div>
      <header className="site-head">
        <div className="container" style={{ height: 64 }}>
          <a href="#/" style={{ textDecoration: 'none' }}><Logo /></a>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {data && <button className="btn ghost small" onClick={() => { localStorage.removeItem('klea-portal-email'); setData(null); setEmail(''); }}>Sign out</button>}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="container" style={{ maxWidth: 640, padding: '30px 20px 80px' }}>
        {!data ? (
          <form onSubmit={lookup} style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 40, color: 'var(--ochre)' }}>✦</div>
            <h1 style={{ fontSize: 28, margin: '8px 0' }}>My cleans</h1>
            <p className="muted" style={{ marginBottom: 20 }}>Pop in the email you booked with and we will find your cleans. (Demo: no password needed.)</p>
            <div className="field"><input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
            {error && <p className="small" style={{ color: 'var(--bad)', marginBottom: 10 }}>{error}</p>}
            <button className="btn gold" type="submit" disabled={!email}>Find my cleans</button>
          </form>
        ) : (
          <Bookings data={data} reload={lookup} />
        )}
      </div>
    </div>
  );
}

function Bookings({ data, reload }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.bookings.filter(b => b.date >= today && b.status !== 'cancelled' && b.status !== 'completed');
  const past = data.bookings.filter(b => b.date < today || b.status === 'completed' || b.status === 'cancelled');

  return (
    <>
      <h1 style={{ fontSize: 26 }}>Hello {data.client.name.split(' ')[0]}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Change or cancel free of charge until midday the day before your clean.</p>

      <h2 style={{ fontSize: 17, margin: '10px 0' }}>Upcoming</h2>
      {upcoming.length === 0 && <p className="muted small" style={{ marginBottom: 16 }}>Nothing booked. <a href="#/">Book a clean →</a></p>}
      {upcoming.map(b => <UpcomingCard key={b.id} b={b} email={data.client.email} postcode={data.client.postcode} reload={reload} />)}

      <h2 style={{ fontSize: 17, margin: '22px 0 10px' }}>Past cleans</h2>
      {past.slice(0, 8).map(b => <PastCard key={b.id} b={b} email={data.client.email} reload={reload} />)}
    </>
  );
}

function UpcomingCard({ b, email, postcode, reload }) {
  const [mode, setMode] = useState(null); // 'move' | null
  const [date, setDate] = useState('');
  const [avail, setAvail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date) { setAvail(null); return; }
    api.get(`/api/availability?date=${date}&postcode=${encodeURIComponent(postcode)}&duration=${b.durationMins}`).then(setAvail);
  }, [date]);

  const cancel = async () => {
    const late = new Date() >= new Date(new Date(b.date + 'T12:00:00').getTime() - 864e5);
    if (!window.confirm(late
      ? `Cancel your clean on ${niceDate(b.date)}? As it is after midday the day before, a 50% fee of ${gbp(b.price / 2)} will apply.`
      : `Cancel your clean on ${niceDate(b.date)}? No charge.`)) return;
    try { await api.post(`/api/portal/bookings/${b.id}/cancel`, { email }); reload(); }
    catch (e) { setError(e.message); }
  };

  const move = async time => {
    setError('');
    try { await api.post(`/api/portal/bookings/${b.id}/reschedule`, { email, date, time }); reload(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <b>{niceDate(b.date)} at {b.start}</b>
          <div className="small muted">{b.serviceName} · {b.staffName} · {gbp(b.price)}</div>
        </div>
        <span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn ghost small" onClick={() => setMode(mode === 'move' ? null : 'move')}>{mode === 'move' ? 'Never mind' : 'Move it'}</button>
        <button className="btn ghost small" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={cancel}>Cancel</button>
      </div>
      {mode === 'move' && (
        <div style={{ marginTop: 12 }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>New date</label>
            <input type="date" min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {avail && avail.options.length === 0 && <p className="muted small">No one free that day, sorry.</p>}
          {avail && avail.options.slice(0, 2).map(o => (
            <div key={o.staffId} style={{ marginBottom: 8 }}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{o.name} · {o.proximityLabel}</div>
              <div className="slot-grid">
                {o.slots.slice(0, 6).map(t => <button key={t} className="slot" onClick={() => move(t)}>{t}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function PastCard({ b, email, reload }) {
  const [error, setError] = useState('');
  const rate = async n => {
    setError('');
    try { await api.post(`/api/portal/bookings/${b.id}/rate`, { email, rating: n }); reload(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <b>{niceDate(b.date)}</b> <span className="muted small">{b.serviceName} · {b.staffName}</span>
        </div>
        <span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span>
      </div>
      {b.status === 'completed' && (
        <>
          {b.photos?.length > 0 && (
            <div className="photo-grid" style={{ margin: '10px 0 4px' }}>
              {b.photos.map(p => <div key={p.id} className="photo-cell"><img src={p.dataUrl} alt={p.caption || 'Finished room'} /><div className="cap">{p.caption}</div></div>)}
            </div>
          )}
          <div className="star-row" style={{ marginTop: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={b.rating >= n ? 'on' : ''} onClick={() => rate(n)}>★</button>
            ))}
            <span className="small muted" style={{ marginLeft: 6 }}>{b.rating ? 'Thanks for rating!' : 'How did we do?'}</span>
          </div>
        </>
      )}
      {error && <p className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{error}</p>}
    </div>
  );
}
