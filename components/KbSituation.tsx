'use client';

// components/KbSituation.tsx
//
// ABPK in the midwife's hand, which is where the flipchart actually lives.
//
// The DOK panel got this first, but ABPK was published FOR field use: a
// lembar balik is something you hold up in front of a client. So the field
// version is not a cut-down copy — if anything this is the setting the book
// was written for.
//
// Five tabs, and every one is a KIND OF VISIT rather than a method. The
// return visit is the one that matters most: Indonesian discontinuation ran
// 21% (2002) to 29% (2017) and side effects are named as the cause, so a form
// that opens on "which method" has nowhere to put "the injection made her
// bleed and she wants to stop".

import { C } from '@/components/ui';
import { useLang } from '@/lib/lang';

export type KbSituation = 'baru' | 'ulang' | 'khusus' | 'ganda';
export type KbSpecialNeed =
  'remaja' | 'usia_40' | 'pasca_persalinan' | 'pasca_keguguran' | 'hiv';
export type ReturnOutcome = 'lanjut' | 'efek_samping' | 'ganti';

const TABS: Array<{
  code: KbSituation; hex: string;
  id: string; en: string; hintId: string; hintEn: string;
}> = [
  { code: 'baru', hex: '#5C7A4A',
    id: 'Klien baru — memilih cara', en: 'New client — choosing a method',
    hintId: 'Belum pakai KB, atau mulai lagi setelah berhenti.',
    hintEn: 'Not on a method, or starting again after stopping.' },
  { code: 'ulang', hex: '#6B4C8A',
    id: 'Kunjungan ulang', en: 'Return visit',
    hintId: 'Sudah pakai suatu cara. Tanyakan keluhannya dulu.',
    hintEn: 'Already on a method. Ask about complaints first.' },
  { code: 'khusus', hex: '#2E4A6B',
    id: 'Kebutuhan khusus', en: 'Special needs',
    hintId: 'Remaja, usia 40-an, pasca salin atau keguguran, HIV.',
    hintEn: 'Adolescent, 40s, postpartum or post-abortion, HIV.' },
  { code: 'ganda', hex: '#B4446E',
    id: 'Perlindungan ganda', en: 'Dual protection',
    hintId: 'Cegah kehamilan sekaligus lindungi dari IMS dan HIV.',
    hintEn: 'Prevent pregnancy and protect against IMS and HIV.' },
];

const NEEDS: Array<{ code: KbSpecialNeed; id: string; en: string }> = [
  { code: 'remaja', id: 'Remaja', en: 'Adolescent' },
  { code: 'usia_40', id: 'Usia 40-an', en: 'In her 40s' },
  { code: 'pasca_persalinan', id: 'Pasca persalinan', en: 'Postpartum' },
  { code: 'pasca_keguguran', id: 'Pasca keguguran', en: 'Post-abortion' },
  { code: 'hiv', id: 'Dengan HIV', en: 'Living with HIV' },
];

export function KbSituationPicker({ expanded, onExpand, onPick }: {
  expanded: KbSituation | null;
  onExpand: (s: KbSituation | null) => void;
  onPick: (s: KbSituation, need: KbSpecialNeed | null) => void;
}) {
  const { t } = useLang();
  return (
    <div>
      <h1 style={{ fontSize: 19, margin: '0 0 3px' }}>
        {t('Apa keperluan kunjungan ini?', 'What is this visit for?')}
      </h1>
      <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '0 0 16px' }}>
        {t('Mengikuti lembar balik ABPK: tentukan keadaannya dulu, baru metodenya.',
           'Following the ABPK flipchart: the situation first, the method after.')}
      </p>

      <div style={{ display: 'grid', gap: 9 }}>
        {TABS.map((tab) => (
          <div key={tab.code}>
            <button
              type="button"
              onClick={() => {
                if (tab.code === 'khusus') { onExpand(expanded === 'khusus' ? null : 'khusus'); return; }
                onPick(tab.code, null);
              }}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                borderRadius: 11, padding: '13px 14px',
                background: C.card, border: `1px solid ${C.border}`,
                borderLeft: `6px solid ${tab.hex}`, color: C.white,
              }}
            >
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{t(tab.id, tab.en)}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>
                {t(tab.hintId, tab.hintEn)}
              </div>
            </button>

            {tab.code === 'khusus' && expanded === 'khusus' && (
              <div style={{ display: 'grid', gap: 6, margin: '8px 0 0 16px' }}>
                {NEEDS.map((n) => (
                  <button
                    key={n.code} type="button"
                    onClick={() => onPick('khusus', n.code)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', borderRadius: 9,
                      padding: '10px 12px', background: C.card2,
                      border: `1px solid ${C.border}`, color: C.white, fontSize: 14,
                    }}
                  >
                    {t(n.id, n.en)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The purple tab. Asked BEFORE anything is recorded.
 *
 * A return visit that goes straight to recording the injection loses the
 * reason she nearly did not come back for it.
 */
export function KbReturnVisit({ methodLabel, onPick }: {
  methodLabel: string | null;
  onPick: (o: ReturnOutcome) => void;
}) {
  const { t } = useLang();
  const OPTS: Array<{ code: ReturnOutcome; hex: string; id: string; en: string }> = [
    { code: 'lanjut', hex: '#5C7A4A', id: 'Tidak ada keluhan — lanjutkan', en: 'No complaints — continue' },
    { code: 'efek_samping', hex: C.red, id: 'Ada keluhan / efek samping', en: 'Complaints or side effects' },
    { code: 'ganti', hex: '#6B4C8A', id: 'Ingin ganti cara', en: 'Wants to switch method' },
  ];
  return (
    <div>
      <h1 style={{ fontSize: 19, margin: '0 0 3px' }}>{t('Kunjungan ulang', 'Return visit')}</h1>
      <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '0 0 16px' }}>
        {methodLabel
          ? t(`Sedang memakai: ${methodLabel}. Tanyakan keluhannya dulu.`,
              `Currently using: ${methodLabel}. Ask about complaints first.`)
          : t('Tanyakan keluhannya lebih dulu.', 'Ask about complaints first.')}
      </p>
      <div style={{ display: 'grid', gap: 9 }}>
        {OPTS.map((o) => (
          <button
            key={o.code} type="button" onClick={() => onPick(o.code)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              borderRadius: 11, padding: '13px 14px', background: C.card,
              border: `1px solid ${C.border}`, borderLeft: `6px solid ${o.hex}`,
              color: C.white, fontSize: 15, fontWeight: 600,
            }}
          >
            {t(o.id, o.en)}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.amber, lineHeight: 1.55, marginTop: 14 }}>
        {t('Efek samping adalah penyebab putus pakai KB yang paling sering. Menanyakannya adalah inti kunjungan ini.',
           'Side effects are the commonest reason women stop. Asking is the point of this visit.')}
      </p>
    </div>
  );
}
