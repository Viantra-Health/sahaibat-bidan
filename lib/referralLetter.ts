// lib/referralLetter.ts
// Rung 4 of the referral ladder: a surat rujukan the mother carries.
//
// WHY THIS IS THE FIRST RUNG BUILT, NOT THE LAST
// ----------------------------------------------
// The other three rungs need something to be true of the world: her Posyandu
// must know its Puskesmas, or a provider must have opted in, or a DOK doctor
// must cover her region. None of those is true for any tenant today, and two
// of them require a sales conversation.
//
// This rung needs nothing. No network, no provider on the platform, nobody at
// the receiving end who has heard of us. A midwife writes a referral note on
// paper today; this produces the same note, legibly, with the readings already
// filled in — and if the phone can share, it shares, and if it cannot, she
// copies it or reads it aloud.
//
// A referral network that only works when the receiving doctor is a customer
// is a referral network with a sales prerequisite. This is the floor beneath
// that, and everything above it is an upgrade.

export interface ReferralLetterInput {
  kind: 'anc' | 'pnc';
  patientName: string;
  ageYears?: number | null;
  village?: string | null;
  bidanName?: string | null;
  facility?: string | null;
  visitType?: string | null;
  /** Gestational age for ANC, days postpartum for PNC. */
  context?: string | null;
  findings: string[];
  reasons: string[];
}

function today(): string {
  const d = new Date();
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Plain text on purpose.
 *
 * It has to survive being pasted into WhatsApp, read off a screen in sunlight,
 * copied by hand onto a paper form at the Puskesmas, and printed by whatever
 * the receiving clinic has. Every one of those is likelier than a PDF opening
 * correctly on a shared handset.
 */
export function buildReferralLetter(input: ReferralLetterInput): string {
  const L: string[] = [];
  L.push('SURAT RUJUKAN');
  L.push('');
  L.push(`Tanggal      : ${today()}`);
  L.push(`Nama pasien  : ${input.patientName}`);
  if (input.ageYears != null) L.push(`Umur         : ${input.ageYears} tahun`);
  if (input.village) L.push(`Desa         : ${input.village}`);
  L.push(`Jenis        : ${input.kind === 'anc' ? 'Antenatal (ANC)' : 'Nifas (PNC)'}${input.visitType ? ` — ${input.visitType}` : ''}`);
  if (input.context) L.push(`Keterangan   : ${input.context}`);
  L.push('');

  L.push('TEMUAN KLINIS');
  if (input.findings.length === 0) L.push('- (tidak ada data terukur dicatat)');
  else for (const f of input.findings) L.push(`- ${f}`);
  L.push('');

  L.push('ALASAN RUJUKAN');
  if (input.reasons.length === 0) L.push('- Atas pertimbangan bidan pemeriksa.');
  else for (const r of input.reasons) L.push(`- ${stripEmoji(r)}`);
  L.push('');

  L.push('Mohon pemeriksaan dan penanganan lebih lanjut.');
  L.push('');
  L.push(`Bidan        : ${input.bidanName ?? '__________________'}`);
  if (input.facility) L.push(`Posyandu     : ${input.facility}`);
  L.push('Tanda tangan : __________________');
  L.push('');
  L.push('— Dibuat dengan SahAIbat Bidan');

  return L.join('\n');
}

/** The flag messages carry 🔴/🟡 for the app. A referral letter should not. */
function stripEmoji(s: string): string {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
}

/**
 * Hand the letter to the midwife by whatever route this device supports.
 *
 * Deliberately layered, because the target device is a cheap Android handset
 * that may be offline and may be shared:
 *   1. Web Share — lands straight in WhatsApp, which is where it will go.
 *   2. Clipboard — she pastes it wherever she likes.
 *   3. A new window she can read aloud or print.
 * The last one always works, which is the point of this rung.
 */
export async function shareReferralLetter(text: string, patientName?: string): Promise<'shared' | 'copied' | 'window' | 'failed'> {
  const title = `Surat rujukan${patientName ? ` — ${patientName}` : ''}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e: any) {
      // A user cancelling the share sheet is not a failure to fall back from.
      if (e?.name === 'AbortError') return 'shared';
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch { /* fall through */ }
  }

  try {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(
        `<pre style="font:14px/1.55 ui-monospace,Menlo,monospace;padding:20px;white-space:pre-wrap">${
          text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
        }</pre>`
      );
      w.document.close();
      return 'window';
    }
  } catch { /* fall through */ }

  return 'failed';
}
