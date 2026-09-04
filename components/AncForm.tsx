'use client';

// components/AncForm.tsx
// The 10T antenatal record, as a form rather than one dense WhatsApp line.
//
// WHY THIS SHAPE. On WhatsApp a midwife types ~30 fields into a single message
// and finds out at the end what was parsed, what was missed, and whether
// anything was dangerous. Two things change here, and they are the whole
// argument for the app:
//
//   1. A field is either filled or explicitly empty. Nothing is silently
//      dropped by a regex, so the 10T score means what it says.
//   2. Scoring and flagging run on every keystroke, offline, via
//      @sahaibat/anc-engine — the same rules the WhatsApp path uses. She sees
//      PRE-EKLAMPSIA the moment she enters the blood pressure, not after
//      submitting.

import { useState, useMemo } from 'react';
import { score10T, generateClinicalFlags, shouldRefer, calculateBMI } from '@sahaibat/anc-engine';

const C = {
  teal: '#02C39A',
  white: '#FFFFFF',
  dim: 'rgba(255,255,255,0.55)',
  dimmer: 'rgba(255,255,255,0.3)',
  border: 'rgba(2,195,154,0.28)',
  card: 'rgba(255,255,255,0.05)',
  red: '#FF6B6B',
  amber: '#FFD166',
};

export interface AncFormValues {
  visitType: string;
  gestationalWeeks: string;
  weightKg: string; heightCm: string;
  bpSystolic: string; bpDiastolic: string;
  fundalHeightCm: string; lilaCm: string; djjBpm: string;
  bloodType: string; ttStatus: string; feTablets: string;
  labHb: string; labProtein: string;
  hivStatus: string; syphilisStatus: string; hbsagStatus: string;
  bloodSugarMg: string; malariaRdt: string;
  counselling: string; presentation: string;
  caseManagement: string; followupPlan: string; complaints: string;
}

export const EMPTY_FORM: AncFormValues = {
  visitType: 'K1', gestationalWeeks: '',
  weightKg: '', heightCm: '', bpSystolic: '', bpDiastolic: '',
  fundalHeightCm: '', lilaCm: '', djjBpm: '',
  bloodType: '', ttStatus: '', feTablets: '',
  labHb: '', labProtein: '', hivStatus: '', syphilisStatus: '', hbsagStatus: '',
  bloodSugarMg: '', malariaRdt: '',
  counselling: '', presentation: '',
  caseManagement: '', followupPlan: '', complaints: '',
};

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

/** Form strings → the engine's typed inputs. One place, so the live preview and
 *  the saved record can never diverge. */
export function toEngineInputs(v: AncFormValues, motherAge: number | null) {
  const gw = num(v.gestationalWeeks) ?? 0;
  const bmi = calculateBMI(num(v.weightKg), num(v.heightCm));

  const visit = {
    gestationalWeeks: gw,
    t1WeightKg: num(v.weightKg),
    t2BpSystolic: num(v.bpSystolic),
    t2BpDiastolic: num(v.bpDiastolic),
    t3FundalHeightCm: num(v.fundalHeightCm),
    t4TtStatus: v.ttStatus || null,
    t5FeTablets: num(v.feTablets),
    t6LabHb: num(v.labHb),
    t6LabProtein: v.labProtein || null,
    t6LabOther: null,
    t7CounsellingTopics: v.counselling ? v.counselling.split(',').map(s => s.trim()).filter(Boolean) : null,
    t8Presentation: v.presentation || null,
    t9CaseManagement: v.caseManagement || null,
    t10FollowupPlan: v.followupPlan || null,
  };

  const clinical = {
    gestationalWeeks: gw,
    motherAge,
    bpSystolic: num(v.bpSystolic),
    bpDiastolic: num(v.bpDiastolic),
    labHb: num(v.labHb),
    labProtein: v.labProtein || null,
    fundalHeightCm: num(v.fundalHeightCm),
    presentation: v.presentation || null,
    complaints: v.complaints || null,
    weightKg: num(v.weightKg),
    lilaCm: num(v.lilaCm),
    djjBpm: num(v.djjBpm),
    bmi: bmi.bmi,
    bmiCategory: bmi.category,
    hivStatus: v.hivStatus || null,
    syphilisStatus: v.syphilisStatus || null,
    hbsagStatus: v.hbsagStatus || null,
    bloodSugarMg: num(v.bloodSugarMg),
    malariaRdt: v.malariaRdt || null,
    usgResults: null,
    birthPlan: null,
  };

  return { visit, clinical, bmi };
}

interface Props {
  motherName: string;
  motherAge: number | null;
  subtitle?: string | null;
  values: AncFormValues;
  onChange: (v: AncFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function AncForm({ motherName, motherAge, subtitle, values, onChange, onSave, saving }: Props) {
  const [showLabs, setShowLabs] = useState(false);
  const set = (k: keyof AncFormValues) => (val: string) => onChange({ ...values, [k]: val });

  const gw = num(values.gestationalWeeks) ?? 0;

  const { quality, flags, referral, bmi } = useMemo(() => {
    const { visit, clinical, bmi } = toEngineInputs(values, motherAge);
    const flags = generateClinicalFlags(clinical as any);
    return { quality: score10T(visit as any), flags, referral: shouldRefer(flags), bmi };
  }, [values, motherAge]);

  const emergencies = flags.filter(f => f.severity === 'EMERGENCY');
  const warnings = flags.filter(f => f.severity === 'WARNING');

  return (
    <div style={{ paddingBottom: 120 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{motherName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

      {/* Danger first. On WhatsApp the flag block arrives at the end of a long
          reply and can be truncated by the 1500-character cap; here it sits
          above the form and appears the instant the reading is entered. */}
      {emergencies.length > 0 && (
        <div role="alert" style={{
          border: `1.5px solid ${C.red}`, borderRadius: 11, padding: '13px 15px',
          background: 'rgba(255,107,107,0.12)', marginBottom: 14,
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: C.white, marginBottom: i < emergencies.length - 1 ? 8 : 0 }}>
              {f.message_id}
            </div>
          ))}
        </div>
      )}

      <Section title="Kunjungan">
        <Row>
          <Select label="Jenis" value={values.visitType} onChange={set('visitType')}
            options={['K1', 'K2', 'K3', 'K4', 'K5', 'K6']} />
          <Field label="Usia kehamilan" unit="mgg" value={values.gestationalWeeks}
            onChange={set('gestationalWeeks')} numeric />
        </Row>
      </Section>

      <Section title="T1–T2 · Timbang & Tekanan Darah">
        <Row>
          <Field label="BB" unit="kg" value={values.weightKg} onChange={set('weightKg')} numeric />
          <Field label="TB" unit="cm" value={values.heightCm} onChange={set('heightCm')} numeric />
        </Row>
        {bmi.bmi != null && (
          <Hint>BMI {bmi.bmi.toFixed(1)} — {bmi.category}</Hint>
        )}
        <Row>
          <Field label="TD sistolik" unit="mmHg" value={values.bpSystolic} onChange={set('bpSystolic')} numeric />
          <Field label="TD diastolik" unit="mmHg" value={values.bpDiastolic} onChange={set('bpDiastolic')} numeric />
        </Row>
      </Section>

      <Section title="T3 · Tinggi Fundus, LILA, DJJ">
        <Row>
          <Field label="TFU" unit="cm" value={values.fundalHeightCm} onChange={set('fundalHeightCm')} numeric />
          <Field label="LILA" unit="cm" value={values.lilaCm} onChange={set('lilaCm')} numeric />
        </Row>
        {num(values.lilaCm) != null && num(values.lilaCm)! < 23.5 && (
          <Hint warn>LILA &lt; 23,5 cm — risiko KEK</Hint>
        )}
        <Field label="DJJ" unit="dpm" value={values.djjBpm} onChange={set('djjBpm')} numeric />
      </Section>

      <Section title="T4–T5 · Imunisasi TT & Tablet Fe">
        <Row>
          <Select label="Status TT" value={values.ttStatus} onChange={set('ttStatus')}
            options={['', 'T1', 'T2', 'T3', 'T4', 'T5', 'lengkap']} />
          <Field label="Fe" unit="tablet" value={values.feTablets} onChange={set('feTablets')} numeric />
        </Row>
      </Section>

      <Section title="T6 · Laboratorium">
        <Row>
          <Field label="Hb" unit="g/dL" value={values.labHb} onChange={set('labHb')} numeric />
          <Select label="Protein urine" value={values.labProtein} onChange={set('labProtein')}
            options={['', '-', '+', '++', '+++']} />
        </Row>

        {/* K1 screening is a long block that is only mandated once. Collapsed by
            default so a K3 visit is not a wall of empty fields — but opened
            automatically at K1, where leaving it blank is a real gap. */}
        {(values.visitType === 'K1' || showLabs) ? (
          <>
            <Row>
              <Select label="HIV" value={values.hivStatus} onChange={set('hivStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
              <Select label="Sifilis" value={values.syphilisStatus} onChange={set('syphilisStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
            </Row>
            <Row>
              <Select label="HBsAg" value={values.hbsagStatus} onChange={set('hbsagStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
              <Select label="Gol. darah" value={values.bloodType} onChange={set('bloodType')}
                options={['', 'A', 'B', 'AB', 'O']} />
            </Row>
            <Row>
              <Field label="Gula darah" unit="mg/dL" value={values.bloodSugarMg} onChange={set('bloodSugarMg')} numeric />
              <Select label="Malaria RDT" value={values.malariaRdt} onChange={set('malariaRdt')}
                options={['', 'negatif', 'positif']} />
            </Row>
          </>
        ) : (
          <button onClick={() => setShowLabs(true)} style={ghostBtn}>+ Skrining lab (HIV, sifilis, HBsAg…)</button>
        )}
      </Section>

      <Section title="T7 · Temu Wicara">
        <Field label="Topik konseling" value={values.counselling} onChange={set('counselling')}
          placeholder="tanda bahaya, gizi, KB" />
      </Section>

      {/* T8 only exists from 36 weeks. Hiding it earlier is not cosmetic: the
          scorer does not expect it, so showing an empty field would imply a gap
          that is not one. */}
      {gw >= 36 && (
        <Section title="T8 · Presentasi Janin">
          <Select label="Presentasi" value={values.presentation} onChange={set('presentation')}
            options={['', 'kepala', 'sungsang', 'lintang']} />
        </Section>
      )}

      <Section title="T9–T10 · Tatalaksana & Tindak Lanjut">
        <Field label="Tatalaksana" value={values.caseManagement} onChange={set('caseManagement')}
          placeholder="tindakan yang diberikan" />
        <Field label="Tindak lanjut" value={values.followupPlan} onChange={set('followupPlan')}
          placeholder="kontrol 4 minggu" />
        <Field label="Keluhan" value={values.complaints} onChange={set('complaints')}
          placeholder="jika ada" />
      </Section>

      {warnings.length > 0 && (
        <div style={{
          border: `1px solid ${C.amber}`, borderRadius: 11, padding: '12px 14px',
          background: 'rgba(255,209,102,0.10)', marginBottom: 14,
        }}>
          {warnings.map((f, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.white, marginBottom: i < warnings.length - 1 ? 7 : 0 }}>
              {f.message_id}
            </div>
          ))}
        </div>
      )}

      {/* Sticky, because the score is feedback while she works — not a verdict
          delivered after she submits. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14,
        background: 'rgba(13,31,28,0.96)', borderTop: `1px solid ${C.border}`,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: C.teal }}>{quality.score}/10</span>
            <span style={{ fontSize: 12, color: C.dim }}>
              {quality.expectedButSkipped.length > 0
                ? `belum: ${quality.expectedButSkipped.join(', ')}`
                : 'lengkap'}
            </span>
            {referral.refer && (
              <span style={{
                marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
                padding: '3px 8px', borderRadius: 4,
                background: referral.urgency === 'emergency' ? C.red : C.amber,
                color: '#04241E',
              }}>
                {referral.urgency === 'emergency' ? 'RUJUK DARURAT' : 'RUJUK'}
              </span>
            )}
          </div>
          <button onClick={onSave} disabled={saving} style={{
            width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
            background: saving ? 'rgba(2,195,154,0.35)' : C.teal,
            color: saving ? C.dim : '#04241E', border: 'none', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Menyimpan…' : 'Simpan kunjungan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────
const ghostBtn: React.CSSProperties = {
  width: '100%', padding: 11, borderRadius: 9, background: 'transparent',
  color: C.dim, fontSize: 13, border: `1px dashed ${C.dimmer}`, cursor: 'pointer',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
        color: C.dimmer, margin: '0 0 11px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
}

function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ fontSize: 12, color: warn ? C.amber : C.dim, margin: '-4px 0 10px' }}>{children}</div>
  );
}

function Field({ label, unit, value, onChange, numeric, placeholder }: {
  label: string; unit?: string; value: string; placeholder?: string;
  onChange: (v: string) => void; numeric?: boolean;
}) {
  return (
    <label style={{ flex: 1, display: 'block', marginBottom: 11 }}>
      <span style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 4 }}>
        {label}{unit ? ` (${unit})` : ''}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : 'text'}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 15.5, borderRadius: 9,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1px solid ${C.border}`, outline: 'none',
        }}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label style={{ flex: 1, display: 'block', marginBottom: 11 }}>
      <span style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 4 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 15.5, borderRadius: 9,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1px solid ${C.border}`, outline: 'none', appearance: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ background: '#0D1F1C' }}>{o || '—'}</option>
        ))}
      </select>
    </label>
  );
}
