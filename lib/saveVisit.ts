// lib/saveVisit.ts
// Turns a filled form into a queued visit and hands it to IndexedDB.
//
// Scoring and flags are computed HERE, on the device, and stored with the
// record — not recomputed at sync. Two reasons: the midwife saw a specific
// score and specific flags when she saved, and that is what the record should
// say; and if the rules change next month, an old visit keeps the assessment
// that was actually made at the time.

import {
  score10T, generateClinicalFlags, shouldRefer,
  generatePncFlags, shouldReferPnc,
  generateDeliveryFlags, shouldReferDelivery,
  generateKnFlags, shouldReferKn,
} from '@sahaibat/anc-engine';
import { saveVisit as put, generateLocalId, type QueuedVisit } from './offlineStore';
import { toEngineInputs, type AncFormValues } from '../components/AncForm';
import { toPncInput, type PncFormValues } from '../components/PncForm';
import { toDeliveryInput, type DeliveryFormValues } from '../components/DeliveryForm';
import { toKnInput, toGrams, type KnFormValues } from '../components/KnForm';
import { toKbFacts, type KbFormValues } from '../components/KbForm';
import type { BidanIdentity } from './auth';
import { todayLocal } from './plausibility';

export async function saveAncVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;
  motherName: string;
  motherAge: number | null;
  values: AncFormValues;
  /**
   * Why an expected 10T standard was not done, where she said.
   *
   * Stored with the visit rather than derived later, because the reason is
   * only knowable at the moment of the visit — nobody can reconstruct in
   * March that the cuff was broken in January. A 6/10 with "stok habis"
   * against T5 is a fact about the district; a bare 6/10 is a mark against
   * the midwife, and she will learn to game it.
   */
  skipReasons?: Record<string, string>;
  /**
   * Which suggested plan lines she accepted, declined or edited.
   *
   * Kept beside the composed T9/T10 text rather than only inside it, because
   * "she was offered the referral and declined it" is a clinical decision and
   * a free-text field cannot be queried for it. A declined referral that later
   * turns out to have mattered is exactly the case an audit needs to find.
   */
  plan?: {
    accepted: string[]; declined: string[];
    edits: Record<string, string>;
    /**
     * Why she declined a line. The two judgement reasons — "not right for
     * this woman" and "I do not agree" — are the ones worth reading: a rule
     * declined as inappropriate across a whole district is a rule that needs
     * revisiting, and that is only learnable if disagreeing is easy and
     * recorded as a professional opinion rather than a failure.
     */
    declineReasons: Record<string, string>;
  };
}): Promise<QueuedVisit> {
  const { identity, memberId, motherName, motherAge, values, skipReasons, plan } = args;
  const { visit, clinical } = toEngineInputs(values, motherAge);

  /* No cast. `visit` is typed AncVisitData at its source now, which is what
     turns the next engine rename into a compile error rather than six fields
     silently becoming undefined and the score collapsing. */
  const quality = score10T(visit);
  const flags = generateClinicalFlags(clinical as any);
  const referral = shouldRefer(flags);

  const record: QueuedVisit = {
    localId: generateLocalId(),
    profileId: identity.profileId,
    ngoId: identity.ngoId,
    memberId,
    flow: 'anc',
    visitType: values.visitType,
    motherName,
    gestationalWeeks: visit.gestationalWeeks || null,
    daysPostpartum: null,
    // Every field as entered, including the ones the engine does not read.
    // The server maps them explicitly; keeping the raw set means a field added
    // to the form later is not lost by an older client.
    data: {
      ...values,
      skipReasons: skipReasons && Object.keys(skipReasons).length > 0 ? skipReasons : null,
      // What the score itself says is missing, stored beside the reasons so
      // the pair can be read without re-running the engine — and so a later
      // rule change cannot retroactively alter what she was asked about.
      expectedButSkipped: quality.expectedButSkipped,
      // The denominator the form showed her. qualityScore is a ratio rescaled
      // to ten and cannot be read back as "N of M", which is how "3/10" ended
      // up printed next to "6 missing".
      itemsCompleted: quality.completed.length,
      itemsExpected: quality.completed.length + quality.expectedButSkipped.length,
      plan: plan && (plan.accepted.length > 0 || plan.declined.length > 0) ? plan : null,
    },
    qualityScore: quality.score,
    flags: flags.map((f) => ({ type: f.type, severity: f.severity })),
    referNow: referral.refer,
    createdAt: new Date().toISOString(),
    // Her calendar, not UTC's. See QueuedVisit.visitDate.
    visitDate: todayLocal(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}

export async function savePncVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;
  motherName: string;
  values: PncFormValues;
}): Promise<QueuedVisit> {
  const { identity, memberId, motherName, values } = args;
  const input = toPncInput(values);

  // Same engine as the server and the WhatsApp path, run here so the flags
  // stored are the ones she actually saw. There is no 10T equivalent for
  // postnatal care, so qualityScore stays null rather than inventing a number.
  const flags = generatePncFlags(input as any);
  const referral = shouldReferPnc(flags);

  const record: QueuedVisit = {
    localId: generateLocalId(),
    profileId: identity.profileId,
    ngoId: identity.ngoId,
    memberId,
    flow: 'pnc',
    visitType: values.visitType,
    motherName,
    gestationalWeeks: null,
    daysPostpartum: input.daysPostpartum,
    data: { ...values, ...input },
    qualityScore: null,
    flags: flags.map((f) => ({ type: f.type, severity: f.severity })),
    referNow: referral.refer,
    createdAt: new Date().toISOString(),
    // Her calendar, not UTC's. See QueuedVisit.visitDate.
    visitDate: todayLocal(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}

export async function saveDeliveryVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;
  motherName: string;
  values: DeliveryFormValues;
}): Promise<QueuedVisit> {
  const { identity, memberId, motherName, values } = args;
  const input = toDeliveryInput(values);

  const flags = generateDeliveryFlags(input as any);
  const referral = shouldReferDelivery(flags);

  // deliveryAt only when she gave a time. A fabricated midnight would be read
  // by the KF1 window as a real hour, and KF1 is 6–48 HOURS from the birth.
  const deliveryAt = values.deliveryTime.trim()
    ? `${values.deliveryDate}T${values.deliveryTime.trim()}:00`
    : null;

  const record: QueuedVisit = {
    localId: generateLocalId(),
    profileId: identity.profileId,
    ngoId: identity.ngoId,
    memberId,
    flow: 'delivery',
    visitType: 'PERSALINAN',
    motherName,
    gestationalWeeks: input.gestationalWeeks,
    daysPostpartum: null,
    data: {
      ...values,
      ...input,
      deliveryAt,
      // The babies the server writes are the parsed ones; the raw form values
      // ride along in the spread above so a field added later is not lost.
      babies: input.babies.map((b, i) => ({ ...b, name: values.babies[i]?.name || null })),
    },
    qualityScore: null,
    flags: flags.map((f) => ({ type: f.type, severity: f.severity })),
    referNow: referral.refer,
    createdAt: new Date().toISOString(),
    // Her calendar, not UTC's. See QueuedVisit.visitDate.
    visitDate: todayLocal(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}

/**
 * A newborn visit.
 *
 * memberId is THE BABY, not her mother — every other save in this file passes
 * the mother. If it is null the server records the visit unattached rather
 * than matching by name: two babies called "Bayi" in one village would merge
 * into one child, and a wrong merge is not recoverable the way an unattached
 * visit is.
 */
export async function saveKnVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;          // the baby
  motherMemberId?: string | null;   // context, for the register
  babyName: string;
  motherName: string;
  values: KnFormValues;
  /**
   * Register this baby as a person on sync, because she was born elsewhere and
   * is not in the register yet.
   *
   * Only `kn/baru` sets this. It is a DELIBERATE act, which is why it is a
   * flag and not inferred from `memberId` being null: a null member id is
   * usually a dropped pick or a bug, and the server records those unattached
   * rather than minting a child out of one. See mintNewbornForKn in
   * bidan-sync.
   *
   * Her sex travels here rather than in KnFormValues because it is a fact
   * about the person, not a finding of this examination, and the KN form does
   * not ask for it on a baby the register already knows.
   */
  registerNewborn?: { sex: 'L' | 'P' | null };
}): Promise<QueuedVisit> {
  const { identity, memberId, motherMemberId, babyName, motherName, values } = args;
  const input = toKnInput(values);

  const flags = generateKnFlags(input as any);
  const referral = shouldReferKn(flags);

  const record: QueuedVisit = {
    localId: generateLocalId(),
    profileId: identity.profileId,
    ngoId: identity.ngoId,
    memberId,
    flow: 'kn',
    visitType: values.visitType,
    // The mother's name, because the register is searched by "Ibu Sari" long
    // before anyone remembers what the baby was eventually called.
    motherName,
    gestationalWeeks: null,
    daysPostpartum: null,
    data: {
      ...values,
      ...input,
      babyName,
      motherMemberId: motherMemberId ?? null,
      /* Read by the KN branch of bidan-sync. Absent on every ordinary visit,
         so that path is untouched. */
      ...(args.registerNewborn
        ? { registerNewborn: true, babySex: args.registerNewborn.sex }
        : {}),
      // Normalised here as well as in the engine input, because the server
      // reads these two off the raw values and 3,1 kg is not 3 grams.
      weightGrams: toGrams(values.weightGrams),
      birthWeightGrams: toGrams(values.birthWeightGrams),
    },
    // There is no 10T equivalent for a newborn visit, so this stays null
    // rather than inventing a number that would be reported as if it meant
    // the same thing as the antenatal score.
    qualityScore: null,
    flags: flags.map((f) => ({ type: f.type, severity: f.severity })),
    referNow: referral.refer,
    createdAt: new Date().toISOString(),
    // Her calendar, not UTC's. See QueuedVisit.visitDate.
    visitDate: todayLocal(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}

/**
 * A family planning record, as a midwife saves it.
 *
 * NO FLAGS AND NO REFERRAL, and that is not an omission. Every other save in
 * this file runs an engine that can raise a danger sign and generate a
 * referral; family planning has none. @sahaibat/anc-engine is explicit that
 * the KB intervals are PROGRAMME PRACTICE and have NOT had the clinical review
 * dr. Rathi gave the antenatal, postnatal and newborn engines. So this records
 * what she did and computes when the next thing falls due, and it does not
 * raise a clinical alarm it has no signed rule for.
 *
 * The facts are stamped from the VISIT DATE, not from now(): a visit queued on
 * a doorstep and synced three days later must not record the counselling as
 * having happened at sync. See toKbFacts.
 */
export async function saveKbVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;
  motherName: string;
  /** The delivery this episode follows, where the device knows of one. */
  deliveryDate?: string | null;
  values: KbFormValues;
}): Promise<QueuedVisit> {
  const { identity, memberId, motherName, values } = args;
  const facts = toKbFacts(values);

  const record: QueuedVisit = {
    localId: generateLocalId(),
    profileId: identity.profileId,
    ngoId: identity.ngoId,
    memberId,
    flow: 'kb',
    /* The step the episode has reached, which is what a register row should
       say about it. Not a visit "type" in the sense the other flows use, but
       it is the one word that describes this contact. */
    visitType: values.methodCode || 'konseling',
    motherName,
    gestationalWeeks: null,
    daysPostpartum: null,
    data: {
      ...values,
      ...facts,
      deliveryDate: args.deliveryDate ?? null,
      product: values.product || null,
      quantity: values.quantity || null,
      isBreastfeeding: values.isBreastfeeding,
    },
    // There is no quality score for a family planning contact, and inventing
    // one would be reported as if it meant what the 10T score means.
    qualityScore: null,
    flags: [],
    referNow: false,
    createdAt: new Date().toISOString(),
    visitDate: values.visitDate || todayLocal(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}
