import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle, Avatar, gbp, niceDate } from './ui.jsx';

// Kleaner app: mobile-first day view for cleaners.
// Demo has no login; the cleaner picks their own profile.
export default function CleanerApp({ user, onSignOut }) {
  // Office staff can look at a Kleaner's view; a Kleaner only ever sees themselves
  const staffId = user.staffId;

  if (!staffId) {
    return (
      <div className="cleaner-shell">
        <header className="cleaner-head">
          <a href="#/admin" style={{ textDecoration: 'none' }}><Logo small /></a>
          <ThemeToggle />
        </header>
        <div style={{ padding: 30 }}>
          <p className="muted">This login is not linked to a Kleaner record. Use the <a href="#/admin">office dashboard</a> instead.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cleaner-shell">
      <header className="cleaner-head">
        <Logo small />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
          <ThemeToggle />
        </div>
      </header>
      <MyRota staffId={staffId} />
    </div>
  );
}

// A Kleaner's own week. They never see other Kleaners or the dashboard.
function MyRota({ staffId }) {
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState(null);
  const load = () => api.get(`/api/cleaner/${staffId}/week?start=${start}`).then(setData);
  useEffect(() => { load(); }, [staffId, start]);
  if (!data) return <p className="muted" style={{ padding: 30 }}>Loading…</p>;

  const shift = n => {
    const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + n * 7);
    setStart(d.toISOString().slice(0, 10));
  };
  const today = new Date().toISOString().slice(0, 10);

  const totalHours = Math.round(data.jobs.reduce((t, j) => t + (j.myHours || 0), 0) * 10) / 10;

  return (
    <div style={{ padding: '10px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
        <Avatar src={data.staff.photo} name={data.staff.name} size={38} />
        <div>
          <b>Hi {data.staff.name.split(' ')[0]}</b>
          <div className="small muted">{data.jobs.length} job{data.jobs.length === 1 ? '' : 's'} this week · {totalHours}h</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0' }}>
        <b>Week of {niceDate(data.days[0])}</b>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost small" onClick={() => shift(-1)}>←</button>
          <button className="btn ghost small" onClick={() => setStart(thisMonday())}>This week</button>
          <button className="btn ghost small" onClick={() => shift(1)}>→</button>
        </span>
      </div>

      {data.days.map(d => {
        const jobs = data.jobs.filter(j => j.date === d).sort((a, b) => a.start.localeCompare(b.start));
        return (
          <div key={d} style={{ marginBottom: 12 }}>
            <div className="small" style={{ fontWeight: 700, color: d === today ? 'var(--beige-deep)' : 'var(--muted)', marginBottom: 4 }}>
              {niceDate(d)}{d === today ? ' · today' : ''}
            </div>
            {jobs.length === 0 && (
              <div className="card" style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>Nothing booked</div>
            )}
            {jobs.map(j => (
              <RotaJob key={j.id} job={j} staffId={staffId} onChanged={load} />
            ))}
          </div>
        );
      })}

      <SelfService staffId={staffId} />
    </div>
  );
}

function thisMonday() {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// One job. Tap it for the notes, the access details and everything else.
function RotaJob({ job: j, staffId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const answer = async response => {
    setBusy(true); setErr('');
    try {
      await api.post(`/api/cleaner/${staffId}/jobs/${j.id}/response`, { response });
      await onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const notes = [j.notes, j.clientNotes].filter(Boolean);

  return (
    <div className="card" style={{ padding: '10px 14px', marginBottom: 6 }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <b className="small">{j.start} · {j.clientName}</b>
          <span className="chip">{j.myHours}h</span>
        </div>
        <div className="small muted">
          {j.serviceName} · {j.clientPostcode}
          {j.sharedWith?.length > 0 && <> · with {j.sharedWith.join(', ')}</>}
        </div>
        {j.sameDayTurnaround && <div><span className="chip bad" style={{ marginTop: 4 }}>Same day, finish by 15:00</span></div>}
        {j.response === 'accepted' && <div><span className="chip" style={{ marginTop: 4, background: 'var(--good)', color: '#fff' }}>Accepted</span></div>}
        <div className="small muted" style={{ marginTop: 4 }}>{open ? 'Tap to close' : 'Tap for notes and details'}</div>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <div className="small"><b>Where</b><br />{j.clientAddress}, {j.clientPostcode}</div>
          {j.clientPhone && <div className="small" style={{ marginTop: 6 }}><b>Phone</b><br />{j.clientPhone}</div>}
          <div className="small" style={{ marginTop: 6 }}><b>How long</b><br />{j.myHours} hours{j.sharedWith?.length > 0 ? ` (your share, shared with ${j.sharedWith.join(', ')})` : ''}</div>

          <div className="small" style={{ marginTop: 8 }}><b>Notes</b><br />
            {notes.length ? notes.map((n, i) => <div key={i} style={{ marginTop: 3 }}>{n}</div>) : <span className="muted">Nothing noted for this one.</span>}
          </div>

          {j.addonNames?.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {j.addonNames.map(a => <span key={a} className="chip">{a}</span>)}
            </div>
          )}

          {!j.response && j.status !== 'completed' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn gold small" disabled={busy} onClick={() => answer('accepted')}>Accept</button>
              <button className="btn ghost small" disabled={busy} onClick={() => answer('declined')}>Cannot do it</button>
            </div>
          )}
          {err && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

function SelfService({ staffId }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 24 }}>
      <button className={'btn small ' + (open ? 'gold' : 'ghost')} onClick={() => setOpen(o => !o)}>📄 My documents</button>
      {open && <div style={{ marginTop: 12 }}><MyDocuments staffId={staffId} /></div>}
    </div>
  );
}

function MyDocuments({ staffId }) {
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api.get(`/api/staff/${staffId}/documents`).then(setDocs);
  useEffect(() => { load(); }, [staffId]);
  return (
    <div className="card">
      <p className="small muted" style={{ marginBottom: 10 }}>Upload your DBS certificate, passport, insurance or training certificates. The office sees them on your staff file.</p>
      {docs.map(doc => (
        <div key={doc.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <span className="small"><b>{doc.name}</b> · {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}</span>
        </div>
      ))}
      <label className="btn ghost small" style={{ display: 'inline-flex' }}>
        📄 Upload (photo or PDF)
        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files[0];
          if (!f) return;
          setErr('');
          const reader = new FileReader();
          reader.onload = () => api.post(`/api/staff/${staffId}/documents`, { name: f.name, dataUrl: reader.result }).then(setDocs).catch(x => setErr(x.message));
          reader.readAsDataURL(f);
          e.target.value = '';
        }} />
      </label>
      {err && <p className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</p>}
    </div>
  );
}
