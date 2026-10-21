'use client';
// components/ReferralFollowUp.tsx
// "Did she go?" — asked on the next visit, because that is when she knows.
//
// This is the only control in either product that can close a referral. See
// lib/referral-followup.ts for why it is here and not in DOK: the receiving
// facility is not on the platform in most villages, and Bidan is sold to
// clients who have no clinic product at all.
//
// IT SITS ABOVE THE FORM, NOT INSIDE IT. A referral she made nine days ago for
// hypertension is context for today's visit, not a field of it — and a question
// buried under thirty inputs is a question answered by whoever scrolls.
//
// NOTHING IS PRESELECTED AND NOTHING BLOCKS. Leaving it alone is the same as
// "belum tahu": the referral stays open and is asked again next time. That is
// the honest default, and it is why the third option exists at all.

import { ARRIVAL_ANSWERS, type ArrivalAnswer, type FollowUpQuestion } from '../lib/referral-followup';
import { useLang } from '../lib/lang';
import { C } from './ui';

export default function ReferralFollowUp({ question, answer, note, onAnswer, onNote }: {
  question: FollowUpQuestion | null;
  answer: ArrivalAnswer | '';
  note: string;
  onAnswer: (a: ArrivalAnswer | '') => void;
  onNote: (n: string) => void;
}) {
  const { t, lang } = useLang();
  if (!question) return null;

  const days = question.daysAgo ?? 0;
  const urgent = question.urgency === 'emergency' || question.urgency === 'urgent';

  return (
    <section style={{
      marginBottom: 14, padding: '13px 15px', borderRadius: 12,
      background: '#FFF7FA', border: `1px solid ${urgent ? '#E6A3B8' : '#E6C3D1'}`,
    }}>
      <h2 style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
        color: '#8A2B52', margin: '0 0 3px',
      }}>{t('Rujukan sebelumnya', 'The referral you made')}</h2>

      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: C.white, margin: '0 0 10px' }}>
        {t(
          `Anda merujuk ibu ini ${days} hari lalu${question.reason ? ` — ${question.reason}` : ''}. Apakah dia sampai ke fasilitas rujukan?`,
          `You referred her ${days} day${days === 1 ? '' : 's'} ago${question.reason ? ` — ${question.reason}` : ''}. Did she reach the facility?`,
        )}
      </p>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {ARRIVAL_ANSWERS.map((a) => {
          const on = answer === a.value;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => onAnswer(on ? '' : a.value)}
              style={{
                flex: '1 1 auto', minWidth: 104, padding: '9px 11px', borderRadius: 9,
                border: `1px solid ${on ? C.teal : C.border}`,
                background: on ? C.teal : C.card,
                color: on ? C.onAccent : C.white,
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 700 : 600,
                cursor: 'pointer',
              }}
            >{lang === 'en' ? a.en : a.id}</button>
          );
        })}
      </div>

      {/* The note is offered for the two answers that close the referral. On
          "belum tahu" there is nothing to annotate — the referral is simply
          still open. */}
      {(answer === 'arrived' || answer === 'did_not_go') && (
        <input
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder={answer === 'did_not_go'
            ? t('Alasannya, bila Anda tahu', 'The reason, if you know it')
            : t('Catatan, mis. hasil dari RS', 'Note, e.g. what the hospital found')}
          style={{
            marginTop: 9, width: '100%', boxSizing: 'border-box',
            border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px',
            fontFamily: 'inherit', fontSize: 13.5, background: C.field, color: C.white,
          }}
        />
      )}

      {/* SAID OUT LOUD, because an unanswered question that silently persists
          looks like a bug the second time she sees it. */}
      {answer === '' || answer === 'unknown' ? (
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.dim, marginTop: 8 }}>
          {t('Bila belum tahu, biarkan saja — pertanyaan ini akan muncul lagi pada kunjungan berikutnya.',
             'If you do not know yet, leave it — this will be asked again at the next visit.')}
        </div>
      ) : null}
    </section>
  );
}
