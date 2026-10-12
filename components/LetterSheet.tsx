'use client';

// components/LetterSheet.tsx
//
// The referral letter, on screen.
//
// WHY
//
// shareReferralLetter hands the text to the device share sheet, and where
// there is none it copies to the clipboard and returns an outcome nobody read.
// On a laptop, and on any phone without Web Share, the button therefore
// appeared to do nothing — at the moment a referral is urgent. Testing found
// exactly that.
//
// Showing it is also better than sharing it even where sharing works. She may
// need to read it aloud down a phone, copy it onto a paper form, or check what
// it says before handing it over, and none of that is possible when the text
// only ever exists inside somebody else's app.
//
// Rung 4 of the referral ladder is "a plain letter she can hand over", and it
// is the rung that always exists. This is what makes that true on every device.

import { useState } from 'react';
import { shareReferralLetter } from '@/lib/referralLetter';
import { useLang } from '@/lib/lang';

export default function LetterSheet({ text, patientName, onClose }: {
  text: string;
  patientName?: string;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const t = (id: string, en: string) => (lang === 'en' ? en : id);
  const [said, setSaid] = useState<string | null>(null);

  async function copy() {
    const how = await shareReferralLetter(text, patientName);
    setSaid(
      how === 'shared' ? t('Dibagikan.', 'Shared.')
      : how === 'copied' ? t('Disalin. Tempel di WhatsApp atau catatan.', 'Copied. Paste it into WhatsApp or a note.')
      : how === 'window' ? t('Dibuka di jendela baru.', 'Opened in a new window.')
      : t('Tidak bisa dibagikan. Surat tetap bisa dibaca atau difoto dari layar ini.',
          'Could not share it. The letter can still be read, or photographed from this screen.'),
    );
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={t('Surat rujukan', 'Referral letter')}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, background: '#fff', color: '#1a1a1a',
          borderRadius: '16px 16px 0 0', padding: '18px 16px',
          maxHeight: '88dvh', display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
          {t('Surat rujukan', 'Referral letter')}
        </div>

        {/* The letter itself, exactly as it will be handed over. Selectable, so
            she can copy part of it by hand if she needs to. */}
        <pre style={{
          flex: 1, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 12.5, lineHeight: 1.6, background: '#F6F5F2',
          border: '1px solid #E4E2DC', borderRadius: 10, padding: 12,
        }}>{text}</pre>

        {said && (
          <div style={{ fontSize: 12.5, color: '#0F6E56', marginTop: 9 }}>{said}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={copy} style={{
            flex: 1, minHeight: 48, fontSize: 14.5, fontWeight: 700, borderRadius: 11,
            border: 'none', background: '#0F6E56', color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit',
          }}>{t('Bagikan / Salin', 'Share or copy')}</button>
          <button type="button" onClick={onClose} style={{
            minHeight: 48, padding: '0 18px', fontSize: 14.5, fontWeight: 600, borderRadius: 11,
            border: '1px solid #D1CEC7', background: '#fff', color: '#5F5E5A',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{t('Tutup', 'Close')}</button>
        </div>
      </div>
    </div>
  );
}
