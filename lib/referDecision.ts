// lib/referDecision.ts
//
// DID THIS VISIT END IN A REFERRAL? THE MIDWIFE GETS A VOTE.
//
// `referNow` is the ENGINE's answer: shouldRefer() looked at the flags and said
// a referral is warranted. Every visit page gated the referral panel on that
// alone, and the retest found the hole from the other side:
//
//   she ticked "Rujuk untuk evaluasi hipertensi dalam kehamilan" in the care
//   plan, saved the visit, and got no destination list at all. Her own decision
//   to refer had nowhere to go.
//
// So an engine that stayed silent could still leave a midwife holding a woman
// she had just decided to send somewhere, with no Puskesmas, no hospital, no
// clinic doctor and no letter -- while a referral the ENGINE raised got all
// four. The rule in this product is that she may always disagree with the
// engine, and that has to work in the direction of MORE care as well as less.
//
// A plan item carries category 'rujukan' when the action is a referral, so this
// needs no string matching: accepting one of those IS deciding to refer.

/** A visit record as `saveVisit` wrote it, narrowed to what this needs. */
interface VisitLike {
  referNow?: boolean | null;
  data?: unknown;
}

/**
 * True when this visit should offer a referral destination -- because the engine
 * asked for one, or because she accepted a referral in the care plan.
 *
 * Deliberately tolerant of shape: `data` is the raw form payload and an older
 * client may have written no plan at all. A missing plan is "no referral
 * chosen", never a crash on a screen she reaches holding a sick woman.
 */
export function referAfterSave(visit: VisitLike | null | undefined): boolean {
  if (!visit) return false;
  if (visit.referNow) return true;
  const plan = (visit.data as any)?.plan;
  const accepted = plan?.accepted;
  if (!Array.isArray(accepted)) return false;
  return accepted.some((item: any) => item?.category === 'rujukan');
}
