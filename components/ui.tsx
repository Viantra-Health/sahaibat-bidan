'use client';

// components/ui.tsx
// Form primitives shared by the antenatal and postnatal records.
//
// Extracted when PNC arrived rather than copied, because the two forms must
// stay visually identical: a midwife switching between them mid-session should
// not have to relearn where the save button is or what an amber hint means.

import type React from 'react';

export const C = {
  teal: '#02C39A',
  white: '#FFFFFF',
  dim: 'rgba(255,255,255,0.55)',
  dimmer: 'rgba(255,255,255,0.3)',
  border: 'rgba(2,195,154,0.28)',
  card: 'rgba(255,255,255,0.05)',
  red: '#FF6B6B',
  amber: '#FFD166',
};

export const ghostBtn: React.CSSProperties = {
  width: '100%', padding: 11, borderRadius: 9, background: 'transparent',
  color: C.dim, fontSize: 13, border: `1px dashed ${C.dimmer}`, cursor: 'pointer',
};

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
        color: C.dimmer, margin: '0 0 11px' }}>{title}</h2>
      {children}
    </section>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
}

export function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div style={{ fontSize: 12, color: warn ? C.amber : C.dim, margin: '-4px 0 10px' }}>{children}</div>;
}

export function Field({ label, unit, value, onChange, numeric, placeholder }: {
  label: string; unit?: string; value: string; placeholder?: string;
  onChange: (v: string) => void; numeric?: boolean;
}) {
  return (
    <label style={{ flex: 1, display: 'block', marginBottom: 11 }}>
      <span style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 4 }}>
        {label}{unit ? ` (${unit})` : ''}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : 'text'}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 15.5, borderRadius: 9,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1px solid ${C.border}`, outline: 'none',
        }}
      />
    </label>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label style={{ flex: 1, display: 'block', marginBottom: 11 }}>
      <span style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 4 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 15.5, borderRadius: 9,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1px solid ${C.border}`, outline: 'none', appearance: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ background: '#0D1F1C' }}>{o || '—'}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Three-state answer: yes / no / not asked.
 *
 * A postnatal form is mostly questions with a clinically loaded answer, and
 * an unanswered one must stay unanswered. A checkbox cannot express "not
 * asked", and defaulting to "no" would silently assert that a wound was not
 * infected on every visit where the midwife never looked.
 */
export function Tri({ label, value, onChange, yes = 'Ya', no = 'Tidak' }: {
  label: string; value: boolean | null; onChange: (v: boolean | null) => void;
  yes?: string; no?: string;
}) {
  const opt = (v: boolean | null, text: string) => {
    const active = value === v;
    return (
      <button
        type="button"
        onClick={() => onChange(active ? null : v)}
        aria-pressed={active}
        style={{
          flex: 1, padding: '9px 6px', fontSize: 13.5, borderRadius: 8, cursor: 'pointer',
          background: active ? 'rgba(2,195,154,0.18)' : 'rgba(255,255,255,0.05)',
          color: active ? C.teal : C.dim,
          border: `1px solid ${active ? C.teal : C.border}`,
          fontWeight: active ? 700 : 400,
        }}
      >
        {text}
      </button>
    );
  };
  return (
    <div style={{ marginBottom: 11 }}>
      <span style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 5 }}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {opt(false, no)}
        {opt(true, yes)}
      </div>
    </div>
  );
}
