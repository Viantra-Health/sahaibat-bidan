// lib/saveVisit.ts
// Turns a filled form into a queued visit and hands it to IndexedDB.
//
// Scoring and flags are computed HERE, on the device, and stored with the
// record — not recomputed at sync. Two reasons: the midwife saw a specific
// score and specific flags when she saved, and that is what the record should
// say; and if the rules change next month, an old visit keeps the assessment
// that was actually made at the time.

import { score10T, generateClinicalFlags, shouldRefer } from '@sahaibat/anc-engine';
import { saveVisit as put, generateLocalId, type QueuedVisit } from './offlineStore';
import { toEngineInputs, type AncFormValues } from '../components/AncForm';
import type { BidanIdentity } from './auth';

export async function saveAncVisit(args: {
  identity: BidanIdentity;
  memberId: string | null;
  motherName: string;
  motherAge: number | null;
  values: AncFormValues;
}): Promise<QueuedVisit> {
  const { identity, memberId, motherName, motherAge, values } = args;
  const { visit, clinical } = toEngineInputs(values, motherAge);

  const quality = score10T(visit as any);
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
    data: { ...values },
    qualityScore: quality.score,
    flags: flags.map((f) => ({ type: f.type, severity: f.severity })),
    referNow: referral.refer,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  };

  await put(record);
  return record;
}
