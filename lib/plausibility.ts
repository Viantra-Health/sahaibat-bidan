// lib/plausibility.ts
//
// Numbers that cannot be true.
//
// WHY THESE WARN AND DO NOT BLOCK
//
// Rule 4.4 of this app: nothing ever blocks. A midwife holding a bleeding
// woman must be able to record and leave, and a prompt that can trap her is
// abandoned in the field within a week — after which nothing is recorded at
// all. So every check here NAMES the problem and the save goes through.
//
// WHAT WENT WRONG WITHOUT THEM
//
// End-to-end testing saved and uploaded a blood pressure of 900/600, a weight
// of 0, and a delivery dated a month in the future. None was questioned. A
// slip of the finger becomes a clinical finding, or a referral letter reading
// "TD 900/600 mmHg" that somebody at a puskesmas has to interpret.
//
// THE GESTATIONAL AGE ONE IS DIFFERENT, AND IT IS THE IMPORTANT ONE
//
// The server has a hard CHECK constraint on it. A visit outside that range, or
// with it blank, is accepted by the device, reported to her as saved, and then
// silently refused — three such visits were found stuck on a device during
// testing. This still does not block: it warns BEFORE she saves, and
// components/QueueBanner.tsx tells her afterwards if the server refused it
// anyway. Between the two, a visit can no longer vanish quietly.

export interface Implausible {
  field: string;
  id: string;
  en: string;
  /** True when the SERVER will refuse this, not merely that it looks odd. */
  willBeRefused?: boolean;
  /**
   * Shown, but does not on its own require a confirming tap.
   *
   * "I do not know her gestational age" is a legitimate and common answer in
   * Papua and NTT -- no LMP recall, no prior card, too early for a fundal
   * height -- not a typo. 900/600 is a typo. Making her confirm the first kind
   * every time is nagging, and a prompt that nags is a prompt she learns to
   * tap through, which costs us the one for the second kind.
   */
  notice?: boolean;
}

/** Mirrors `gestational_weeks between 20 and 45` on sahai_deliveries. */
export const DELIVERY_WEEKS_MIN = 20;
export const DELIVERY_WEEKS_MAX = 45;
/** Antenatal care starts long before 20 weeks, so the floor is lower here. */
export const ANC_WEEKS_MIN = 4;
export const ANC_WEEKS_MAX = 45;

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Today in the DEVICE's own calendar, not UTC. See todayLocal below. */
export function todayLocal(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Render a stored date the way she wrote it, not the way UTC saw it.
 *
 * `new Date('2026-10-12')` is UTC MIDNIGHT. Rendering that instant in a local
 * zone west of UTC gives the day before -- so visits recorded at 01:00 on the
 * 12th in Toronto were listed under "11 Okt 2026". Indonesia is east of UTC so
 * it reads correctly there and the bug hides, which is exactly why it survived
 * four rounds of testing.
 *
 * The distinction is the one that keeps coming up here: a CALENDAR DATE
 * ("2026-10-12") is a day, and must be rendered as that day everywhere; a
 * TIMESTAMP ("2026-10-12T01:30:00Z") is an instant, and converting it to local
 * time is correct. So the shape of the string decides, and a date-only string
 * is built at LOCAL midnight rather than parsed at UTC midnight.
 */
export function formatStoredDate(value: unknown, locale = 'id-ID'): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const cal = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = cal
    ? new Date(Number(cal[1]), Number(cal[2]) - 1, Number(cal[3]))
    : new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function checkAnc(v: {
  weightKg?: unknown; bpSystolic?: unknown; bpDiastolic?: unknown;
  gestationalWeeks?: unknown; lilaCm?: unknown; labHb?: unknown; visitDate?: unknown;
  temperatureC?: unknown;
}): Implausible[] {
  const out: Implausible[] = [];
  const w = n(v.weightKg), sys = n(v.bpSystolic), dia = n(v.bpDiastolic);
  const ga = n(v.gestationalWeeks), lila = n(v.lilaCm), hb = n(v.labHb);
  const temp = n(v.temperatureC);

  if (w !== null && (w < 25 || w > 200)) out.push({ field: 'weightKg',
    id: `Berat ${w} kg tidak masuk akal. Periksa lagi.`,
    en: `A weight of ${w} kg cannot be right. Check it.` });

  if (sys !== null && (sys < 60 || sys > 260)) out.push({ field: 'bpSystolic',
    id: `Tekanan darah sistolik ${sys} tidak masuk akal.`,
    en: `A systolic pressure of ${sys} cannot be right.` });

  if (dia !== null && (dia < 30 || dia > 180)) out.push({ field: 'bpDiastolic',
    id: `Tekanan darah diastolik ${dia} tidak masuk akal.`,
    en: `A diastolic pressure of ${dia} cannot be right.` });

  if (sys !== null && dia !== null && dia >= sys) out.push({ field: 'bpDiastolic',
    id: 'Diastolik tidak boleh sama atau lebih tinggi dari sistolik.',
    en: 'The diastolic cannot be the same as or higher than the systolic.' });

  if (lila !== null && (lila < 10 || lila > 60)) out.push({ field: 'lilaCm',
    id: `LILA ${lila} cm tidak masuk akal.`, en: `A MUAC of ${lila} cm cannot be right.` });

  if (hb !== null && (hb < 2 || hb > 25)) out.push({ field: 'labHb',
    id: `Hb ${hb} tidak masuk akal.`, en: `An Hb of ${hb} cannot be right.` });

  /* A decimal point missed on a thermometer reads as 386, and the fever rules
     would call that a referral. 30-45 covers every survivable reading in both
     directions, including the hypothermia band the engine refers on. */
  if (temp !== null && (temp < 30 || temp > 45)) out.push({ field: 'temperatureC',
    id: `Suhu ${temp}°C tidak masuk akal. Periksa lagi.`,
    en: `A temperature of ${temp}°C cannot be right. Check it.` });

  /* ── AN UNKNOWN GESTATIONAL AGE IS A RECORD, NOT AN ERROR ─────────────────
     This used to say the server would refuse the visit, and it was true: the
     column was NOT NULL, so the Hb and the blood pressure in the same row were
     thrown away over one unknown field. sql/phase-9k-gestational-age-optional.sql
     makes it nullable, because an unknown gestational age is the correct record
     of what she knows and it is common.

     So this is now a notice about what will be stored, not a warning about
     losing the visit, and it no longer demands a confirming tap of its own.
     If phase-9k has NOT been run yet the visit is still refused -- and
     components/QueueBanner.tsx names it on the register, which is the net. */
  if (ga === null) out.push({ field: 'gestationalWeeks', notice: true,
    id: 'Usia kehamilan tidak diisi. Kunjungan tetap tersimpan, dan usia '
      + 'kehamilan dicatat sebagai tidak diketahui.',
    en: 'Gestational age is empty. The visit is still saved, and the gestational '
      + 'age is recorded as unknown.' });
  else if (ga < ANC_WEEKS_MIN || ga > ANC_WEEKS_MAX) out.push({
    field: 'gestationalWeeks', willBeRefused: true,
    id: `Usia kehamilan ${ga} minggu di luar batas yang diterima server (${ANC_WEEKS_MIN}–${ANC_WEEKS_MAX}).`,
    en: `A gestational age of ${ga} weeks is outside what the server accepts (${ANC_WEEKS_MIN}–${ANC_WEEKS_MAX}).` });

  out.push(...futureDate(v.visitDate, 'visitDate'));
  return out;
}

/**
 * A time written the way this country writes it, turned into HH:MM.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The delivery form's "Jam" box is free text with 14:30 only as a placeholder,
 * and a midwife typed 14.30 — which is how a time is written in Indonesian.
 * saveVisit pasted it into `${date}T${time}:00`, the server handed
 * "2026-10-27T14.30:00" to Postgres, and the birth was refused and stuck in the
 * queue on her phone with a database parser message on screen.
 *
 * Null means "that is not a time". It never guesses: a bare "14" could be 14:00
 * or an entry she had not finished, and KF1 is counted in HOURS from the birth.
 * The matching rule runs on the server too (lib/clinical/field-time.ts there),
 * because a phone that has not taken an update still has to be able to send.
 */
export function normaliseTime(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{1,2})\s*[:.\-]?\s*(\d{2})(?:\s*[:.\-]\s*(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]), sec = m[3] === undefined ? 0 : Number(m[3]);
  // 24:00 is a legal end-of-day, but a BIRTH at 24:00 belongs to the next date
  // and this will not move the date underneath her.
  if (h > 23 || min > 59 || sec > 59) return null;
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${p(h)}:${p(min)}:${p(sec)}`;
}

export function checkDelivery(v: {
  gestationalWeeks?: unknown; bloodLossMl?: unknown; deliveryDate?: unknown;
  deliveryTime?: unknown;
  birthWeightG?: unknown;
  /** Each baby on the form. Only their outcome is read here. */
  babies?: Array<{ outcome?: unknown }>;
}): Implausible[] {
  const out: Implausible[] = [];
  const ga = n(v.gestationalWeeks), loss = n(v.bloodLossMl), bw = n(v.birthWeightG);

  /* ── THE HOUR, BEFORE THE SERVER REFUSES IT ───────────────────────────────
     Caught here so she finds out while she is standing in front of the mother,
     not days later as a refused visit in the queue. Blank is fine and means she
     did not take the time; something unreadable is not. */
  const timeRaw = String(v.deliveryTime ?? '').trim();
  if (timeRaw && !normaliseTime(timeRaw)) {
    out.push({ field: 'deliveryTime', willBeRefused: true,
      id: `Jam "${timeRaw}" tidak terbaca. Tulis seperti 14.30 atau 14:30.`,
      en: `The time "${timeRaw}" cannot be read. Write it like 14.30 or 14:30.` });
  }

  /* ── A BABY WITH NO ANSWER IS NOT REGISTERED ──────────────────────────────
     The server registers a baby as a person only when the outcome is 'hidup'
     ("only living babies become people" -- bidan-sync). That rule is right:
     it must not invent a living child from a blank field.

     But the outcome dropdown now starts at "—" rather than defaulting to
     Hidup, and nothing connected the two. A delivery saved without touching it
     stored a birth with an empty outcome, registered no baby, and still told
     her "1 bayi akan terdaftar dan muncul di daftar Kader desa ini." The baby
     did not exist anywhere she would look for him.

     Blank is the correct default -- a baby's condition at birth is not
     something to assume. So it is asked for instead. */
  for (const [i, b] of (v.babies ?? []).entries()) {
    const o = b?.outcome;
    if (o === 'hidup' || o === 'mati') continue;
    const which = (v.babies ?? []).length > 1 ? ` ${i + 1}` : '';
    out.push({ field: `babies.${i}.outcome`, willBeRefused: true,
      id: `Keadaan bayi${which} belum dijawab. Bayi ini TIDAK akan terdaftar `
        + 'dan tidak akan muncul di daftar Kader.',
      en: `Baby${which}'s condition has not been answered. This baby will NOT be `
        + 'registered and will not appear in the Kader list.' });
  }

  if (ga !== null && (ga < DELIVERY_WEEKS_MIN || ga > DELIVERY_WEEKS_MAX)) out.push({
    field: 'gestationalWeeks', willBeRefused: true,
    id: `Usia kehamilan ${ga} minggu di luar batas yang diterima server (${DELIVERY_WEEKS_MIN}–${DELIVERY_WEEKS_MAX}). `
      + 'Persalinan ini tidak akan tersimpan di catatan.',
    en: `A gestational age of ${ga} weeks is outside what the server accepts (${DELIVERY_WEEKS_MIN}–${DELIVERY_WEEKS_MAX}). `
      + 'This delivery will not reach the record.' });

  if (loss !== null && (loss < 0 || loss > 5000)) out.push({ field: 'bloodLossMl',
    id: `Perdarahan ${loss} ml tidak masuk akal.`, en: `A blood loss of ${loss} ml cannot be right.` });

  if (bw !== null && (bw < 300 || bw > 7000)) out.push({ field: 'birthWeightG',
    id: `Berat lahir ${bw} g tidak masuk akal.`, en: `A birth weight of ${bw} g cannot be right.` });

  out.push(...futureDate(v.deliveryDate, 'deliveryDate'));
  return out;
}

/** A visit cannot have happened tomorrow. Compared in the DEVICE's calendar. */
function futureDate(value: unknown, field: string): Implausible[] {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return [];
  if (value <= todayLocal()) return [];
  return [{ field,
    id: `Tanggal ${value} ada di masa depan.`,
    en: `The date ${value} is in the future.` }];
}

/**
 * Whole days between two calendar dates, in the DEVICE's own calendar.
 *
 * The newborn age was computed as (Date.now() - Date.parse(dob)) / 86400000.
 * Both halves are instants, and "2026-10-10" parses as UTC midnight, so a baby
 * born on the 10th read as 2 days old at 22:48 on the 11th local time. Day of
 * life decides which KN visit is due and which jaundice rule applies, so an
 * off-by-one here is a clinical difference, not a display one.
 *
 * Comparing calendar dates at UTC midnight on BOTH sides removes the clock
 * entirely: the difference is a count of days, not a span of hours.
 */
export function daysBetween(fromISO: string, toISO: string = todayLocal()): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fromISO ?? ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(toISO ?? ''));
  if (!a || !b) return null;
  const ms = Date.parse(`${b[0]}T00:00:00Z`) - Date.parse(`${a[0]}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}
