import React, { useEffect, useState } from 'react';

// ---- Wordmark: lowercase serif with an ochre sparkle (Klea-style identity) ----
export function Logo({ small }) {
  return (
    <span className="logo" style={small ? { fontSize: 20 } : undefined}>
      <span>klea</span>
      <span className="sparkle" aria-hidden="true">✦</span>
    </span>
  );
}

// ---- theme toggle ----
export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cab-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cab-theme', theme);
  }, [theme]);
  return [theme, () => setTheme(t => (t === 'light' ? 'dark' : 'light'))];
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} title="Toggle light / dark mode" aria-label="Toggle light or dark mode">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

// ---- tiny icon set ----
const paths = {
  home: 'M3 11.5L12 4l9 7.5M5.5 10v9.5h13V10',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z',
  bubbles: 'M9 15a6 6 0 116-6 6 6 0 01-6 6zm9 2a3 3 0 11.01 0zM7 20.5a2 2 0 11.01 0z',
  key: 'M14 10a4 4 0 11-1.2-2.8L21 4v3h-3v3h-3z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8zm8 4v8M4 8l8 4 8-4',
  briefcase: 'M4 8h16v11H4V8zm5 0V5h6v3M4 13h16',
  building: 'M5 21V4h9v17M14 9h5v12M8 8h2M8 12h2M8 16h2M21 21H3',
  calendar: 'M5 6h14v14H5V6zm0 5h14M9 3v4M15 3v4',
  users: 'M8 12a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm8 1a3 3 0 110-6M2.5 20a5.5 5.5 0 0111 0M14 20a5 5 0 017-4.5',
  clipboard: 'M9 4h6v3H9V4zm-3 3V5h2m8 0h2v16H6V7M9 12h6M9 16h4',
  chat: 'M4 5h16v11H8l-4 4V5z',
  grid: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zm-9 9h7v7H4v-7zm9 0h7v7h-7v-7z',
  pound: 'M7 19h10M9 19c1.5-2 1.5-4.5 1-7m-2 3h6m-6-3c-.5-3 1-6.5 4-6.5 1.7 0 3 1 3.3 2.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3'
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.sparkle} />
    </svg>
  );
}

// Circular staff photo with initials fallback if the image fails to load
export function Avatar({ src, name = '', size = 44 }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('');
  if (!src || broken) {
    return (
      <span className="avatar" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.36, color: 'var(--beige-deep)' }}>
        {initials}
      </span>
    );
  }
  return <img className="avatar" src={src} alt={name} width={size} height={size} onError={() => setBroken(true)} />;
}

export const gbp = n => '£' + Number(n).toFixed(2).replace(/\.00$/, '');

export const niceDate = iso => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
