/** lib/plausibility.ts — the hour a midwife typed, and the birth it nearly lost. */
import { normaliseTime, checkDelivery } from '../lib/plausibility';

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l} ${d}`); } };

/* The exact value from the field report. */
ok('14.30 — how Indonesia writes a time', normaliseTime('14.30') === '14:30:00');
ok('14:30 still works', normaliseTime('14:30') === '14:30:00');
ok('1430 typed in a hurry', normaliseTime('1430') === '14:30:00');
ok('a single-digit hour is padded', normaliseTime('7.05') === '07:05:00');
ok('midnight', normaliseTime('00.00') === '00:00:00');
ok('blank is not a time', normaliseTime('') === null);
ok('"siang" is not a time', normaliseTime('siang') === null);
/* KF1 is counted in HOURS from the birth, so an invented hour is an invented
   postnatal schedule. */
ok('A BARE HOUR IS REFUSED RATHER THAN READ AS O CLOCK', normaliseTime('14') === null);
ok('25.00 is refused', normaliseTime('25.00') === null);
ok('14.60 is refused', normaliseTime('14.60') === null);
ok('24.00 is refused, not rolled into the next day', normaliseTime('24.00') === null);

/* The form warns BEFORE she saves, so she is still with the mother. */
const base = { gestationalWeeks: '39', bloodLossMl: '200', deliveryDate: '2026-10-27',
               babies: [{ outcome: 'hidup' }] };
const bad = checkDelivery({ ...base, deliveryTime: 'siang' });
ok('an unreadable time is flagged at entry', bad.some((w) => w.field === 'deliveryTime'));
ok('...and says it will be refused',
  bad.find((w) => w.field === 'deliveryTime')?.willBeRefused === true);
ok('...quoting what she actually typed',
  bad.find((w) => w.field === 'deliveryTime')!.id.includes('siang'));

ok('14.30 raises nothing', !checkDelivery({ ...base, deliveryTime: '14.30' })
  .some((w) => w.field === 'deliveryTime'));
/* Blank is a real answer: she did not note the hour. */
ok('A BLANK TIME IS NOT AN ERROR', !checkDelivery({ ...base, deliveryTime: '' })
  .some((w) => w.field === 'deliveryTime'));

/* The timestamp the server used to refuse. */
const built = `2026-10-27T${normaliseTime('14.30')}`;
ok('the assembled timestamp is now valid',
  built === '2026-10-27T14:30:00' && !Number.isNaN(new Date(built).getTime()), built);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
