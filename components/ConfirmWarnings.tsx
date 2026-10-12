'use client';

// components/ConfirmWarnings.tsx
//
// "These numbers cannot be true. Save anyway?"
//
// WHY A SHEET AND NOT A BLOCK
//
// Rule 4.4 says nothing ever blocks, and that rule is not negotiable: a
// midwife holding a bleeding woman must be able to record and leave. But three
// rounds of testing saved a blood pressure of 900/600, a weight of 0 and a
// delivery dated a month in the future, each time past a warning printed right
// above the button. A notice she can walk past without touching is, in
// practice, not a notice.
//
// So this is a CONFIRM, not a gate. One extra tap, every route out of it leads
// to a saved visit, and the wording never suggests she is wrong -- she may well
// be looking at a genuinely strange reading. What it will not let her do is
// save a typo without having seen it.
//
// THE REFUSED ONES ARE A DIFFERENT SENTENCE
//
// Some of these the server will reject outright, which means the visit stays on
// the device and never reaches the record. That is not "unusual reading", it is
// "this will be lost", and it is said in those words -- see
// lib/plausibility.ts and components/QueueBanner.tsx, which tells her again
// afterwards if it happens.

import type { Implausible } from '@/lib/plausibility';
import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';

export default function ConfirmWarnings({
  items, onConfirm, onCancel, onSaveWithout, saving,
}: {
  items: Implausible[];
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Save the visit with the unstorable value cleared, keeping everything else.
   *
   * Offered only when a field is one the SERVER will refuse. Saving "as it is"
   * then loses the whole visit -- the Hb, the blood pressure, the MUAC, all of
   * it -- for one number out of range, and six visits were lost that way in a
   * single test run. Dropping the one field is the lesser loss by a long way,
   * and it is named rather than done quietly.
   */
  onSaveWithout?: () => void;
  saving?: boolean;
}) {
  const { t } = useLang();
  const willBeLost = items.some((w) => w.willBeRefused);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(4,20,17,.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto',
        background: C.card, borderRadius: '16px 16px 0 0',
        border: `1px solid ${C.border}`, borderBottom: 'none',
        padding: '20px 18px 24px',
      }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px', letterSpacing: '-.01em' }}>
          {willBeLost
            ? t('Ini tidak akan masuk catatan', 'This will not reach the record')
            : t('Periksa dulu angkanya', 'Check these numbers first')}
        </h2>
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '0 0 14px' }}>
          {willBeLost
            ? t('Server akan menolak kunjungan ini, jadi kunjungan akan tertahan di perangkat dan tidak masuk ke catatan ibu. Perbaiki sekarang kalau bisa.',
                'The server will refuse this visit, so it will stay on this device and never reach her record. Correct it now if you can.')
            : t('Beberapa angka di luar batas yang wajar. Mungkin memang begitu — tapi lebih sering ini salah ketik.',
                'Some of these are outside the usual range. They may be real — more often it is a typo.')}
        </p>

        <div style={{ display: 'grid', gap: 7, marginBottom: 18 }}>
          {items.map((w, i) => (
            <div key={i} style={{
              fontSize: 13.5, lineHeight: 1.5, borderRadius: 9, padding: '10px 12px',
              background: w.willBeRefused ? '#FDEAE8' : '#FBF1DC',
              border: `1px solid ${w.willBeRefused ? '#B3261E' : '#8A5D06'}`,
              color: w.willBeRefused ? '#B3261E' : '#8A5D06',
              fontWeight: w.willBeRefused ? 600 : 400,
            }}>{t(w.id, w.en)}</div>
          ))}
        </div>

        {/* Correcting it is the recommended route, so it gets the solid button.
            Saving anyway is never hidden and never disabled -- rule 4.4. */}
        <button onClick={onCancel} disabled={saving} style={{
          width: '100%', minHeight: 50, padding: 14, fontSize: 15, fontWeight: 700,
          borderRadius: 11, background: C.teal, color: C.onAccent,
          border: 'none', cursor: saving ? 'default' : 'pointer', marginBottom: 10,
        }}>
          {t('Perbaiki sekarang', 'Correct it now')}
        </button>
        {/* The middle road, and for a refusable value it is the right one:
            everything she measured is kept and only the number that cannot be
            stored is dropped. Shown above "save as it is" because it is the
            better answer, and worded so she knows exactly what is lost. */}
        {willBeLost && onSaveWithout && (
          <button onClick={onSaveWithout} disabled={saving} style={{
            width: '100%', minHeight: 48, padding: 13, fontSize: 14.5, fontWeight: 700,
            borderRadius: 11, background: C.accentSoft, color: C.teal,
            border: `1px solid ${C.teal}`, cursor: saving ? 'default' : 'pointer',
            marginBottom: 10,
          }}>
            {t('Simpan tanpa usia kehamilan — sisanya tetap tersimpan',
               'Save without the gestational age — everything else is kept')}
          </button>
        )}
        <button onClick={onConfirm} disabled={saving} style={{
          width: '100%', minHeight: 48, padding: 13, fontSize: 14.5, fontWeight: 600,
          borderRadius: 11, background: 'transparent', color: C.dim,
          border: `1px solid ${C.borderStrong}`, cursor: saving ? 'default' : 'pointer',
        }}>
          {saving
            ? t('Menyimpan…', 'Saving…')
            : willBeLost
              ? t('Simpan apa adanya — kunjungan ini akan ditolak',
                  'Save it as it is — this visit will be refused')
              : t('Simpan apa adanya', 'Save it as it is')}
        </button>
      </div>
    </div>
  );
}
