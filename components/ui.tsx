'use client';

// components/ui.tsx
// Form primitives shared by the antenatal and postnatal records.
//
// Extracted when PNC arrived rather than copied, because the two forms must
// stay visually identical: a midwife switching between them mid-session should
// not have to relearn where the save button is or what an amber hint means.

import type React from 'react';

/**
 * Every colour is a token, so the light and dark themes are one definition
 * rather than two codebases. The key names are unchanged from the original
 * dark-only palette on purpose: every screen keeps working, and the whole app
 * reskins from this one object.
 */
export const C = {
  /** Primary. Deep rose — the Buku KIA. */
  teal: 'var(--accent)',
  onAccent: 'var(--on-accent)',

  /** Text, in three weights of emphasis. */
  white: 'var(--ink)',
  dim: 'var(--ink-2)',
  dimmer: 'var(--ink-3)',

  border: 'var(--line)',
  borderStrong: 'var(--line-strong)',
  card: 'var(--surface)',
  card2: 'var(--surface-2)',
  bg: 'var(--bg)',

  field: 'var(--field)',
  fieldLine: 'var(--field-line)',

  /** Emergency, and nothing else ever. */
  red: 'var(--danger)',
  redSoft: 'var(--danger-soft)',
  onDanger: 'var(--on-danger)',

  amber: 'var(--warn)',
  amberSoft: 'var(--warn-soft)',

  /** Done, complete, safe. Also the brand mark's green. */
  ok: 'var(--ok)',
  okSoft: 'var(--ok-soft)',

  /** Accent tints, for selected states and quiet panels. */
  accentSoft: 'var(--accent-soft)',
  accentMuted: 'color-mix(in srgb, var(--accent) 35%, transparent)',
};

export const ghostBtn: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: 12, borderRadius: 10, background: 'transparent',
  color: C.dim, fontSize: 14, fontWeight: 600,
  border: `1.5px dashed ${C.borderStrong}`, cursor: 'pointer',
};

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 14, padding: '14px 15px', borderRadius: 12,
      background: C.card, border: `1px solid ${C.border}` }}>
      <h2 style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
        color: C.teal, margin: '0 0 11px' }}>{title}</h2>
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
      <span style={{ fontSize: 12, fontWeight: 700, color: C.dim, display: 'block', marginBottom: 5 }}>
        {label}{unit ? ` (${unit})` : ''}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : 'text'}
        style={{
          width: '100%', padding: '12px 13px', fontSize: 16, borderRadius: 10,
          background: C.field, color: C.white, fontWeight: 600,
          border: `1.5px solid ${C.fieldLine}`, outline: 'none',
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
      <span style={{ fontSize: 12, fontWeight: 700, color: C.dim, display: 'block', marginBottom: 5 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '12px 13px', fontSize: 16, borderRadius: 10,
          background: C.field, color: C.white, fontWeight: 600,
          border: `1.5px solid ${C.fieldLine}`, outline: 'none', appearance: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || '—'}</option>
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
          flex: 1, minHeight: 48, padding: '11px 6px', fontSize: 14, borderRadius: 10,
          cursor: 'pointer',
          background: active ? C.teal : C.field,
          color: active ? C.onAccent : C.dim,
          border: `1.5px solid ${active ? C.teal : C.fieldLine}`,
          fontWeight: active ? 800 : 600,
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
