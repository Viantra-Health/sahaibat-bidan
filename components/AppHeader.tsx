'use client';

// components/AppHeader.tsx
// One bar on every signed-in screen: whose app this is, who she is, where she
// is working.
//
// Before this the only chrome was a line reading "BIDAN BIDAN YUNI SERAN" —
// the word twice, because the label said "Bidan" and so did her stored name.
// An app with no mark and a doubled word reads as unfinished, which matters
// more than usual here: a midwife is being asked to trust it with a village's
// pregnancies.

import { C } from './ui';

export default function AppHeader({
  name, village, right,
}: {
  name?: string | null;
  village?: string | null;
  right?: React.ReactNode;
}) {
  // Her stored name is often already "Bidan Yuni Seran". Do not print the
  // role in front of it and say it twice.
  const display = (name ?? '').trim();
  const withoutRole = display.replace(/^bidan\s+/i, '');

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <img
          src="/icons/icon-192.png"
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: 8, display: 'block', flex: '0 0 auto' }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 700, letterSpacing: '.01em', lineHeight: 1.25,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            SahAIbat <span style={{ color: C.teal }}>Bidan</span>
          </div>
          <div style={{
            fontSize: 10.5, color: C.dimmer, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {[withoutRole || null, village || null].filter(Boolean).join(' · ') || 'Bidan'}
          </div>
        </div>
      </div>
      {right}
    </header>
  );
}
