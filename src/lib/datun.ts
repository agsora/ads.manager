import raw from "./datun-data.json";

/**
 * "Tools Dana Tunai" calculator (R4 = mobil, R2 = motor). Every table in datun-data.json is copied from the workbook
 * (MRP prices, DBRATE sell rates, DBKOMISI agent commission, DBASR insurance); the formulas below follow its cells.
 */

type Table = { t: number[]; loans: number[]; v: (number | null)[][] };
interface Data {
  period: string;
  carYears: number[];
  cars: [string, string, string, string, string, (number | null)[]][]; // brand, family, type, body, moving class, prices (Rp million) by year
  motorYears: number[];
  motors: [string, string, string, string, (number | null)[]][]; // kind, brand, type, moving class, prices (Rp million) by year
  carRate: Record<"nonMahal" | "murah" | "roMahal" | "pickup", Table>;
  carKomisi: Record<"nonMahal" | "murah" | "roMahal" | "pickup", Table>;
  motorRate: Record<"non" | "ro", Table>;
  motorKomisi: Record<"non" | "ro", Table>;
  motorAsr: Record<string, number>;
  carAsr: { passangerBands: [number | null, number][]; pickup: number };
  adm: { car: number; motor: number };
}
const D = raw as unknown as Data;

export const DATUN_PERIOD = D.period;
export const CAR_TENORS = D.carRate.murah.t;
export const MOTOR_TENORS = D.motorRate.non.t;
export const CAR_STEP = 5_000_000;
export const MOTOR_STEP = 500_000;
export const CAR_LOAN_RANGE = [D.carRate.murah.loans[0], D.carRate.murah.loans[D.carRate.murah.loans.length - 1]] as const;
export const MOTOR_LOAN_RANGE = [D.motorRate.non.loans[0], D.motorRate.non.loans[D.motorRate.non.loans.length - 1]] as const;
export const CAR_ADM = D.adm.car;
export const MOTOR_ADM = D.adm.motor;

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

// ---- price lists (MRP sheet) ----
export const carBrands = () => uniq(D.cars.map((c) => c[0]));
export const carFamilies = (brand: string) => uniq(D.cars.filter((c) => c[0] === brand).map((c) => c[1]));
export const carTypes = (brand: string, family: string) => uniq(D.cars.filter((c) => c[0] === brand && c[1] === family).map((c) => c[2]));
export const carYearsFor = (type: string) => {
  const row = D.cars.find((c) => c[2] === type);
  return row ? D.carYears.filter((_, i) => row[5][i] != null) : [];
};
/** OTR in rupiah (the sheet keeps millions); the first row with that type name wins, like the sheet's MATCH. */
export function carOtr(type: string, year: number): number | null {
  const row = D.cars.find((c) => c[2] === type);
  const i = D.carYears.indexOf(year);
  const p = row && i >= 0 ? row[5][i] : null;
  return p == null ? null : Math.round(p * 1_000_000);
}

export const motorBrands = () => uniq(D.motors.map((m) => m[1]));
export const motorTypes = (brand: string) => uniq(D.motors.filter((m) => m[1] === brand).map((m) => m[2]));
export const motorYearsFor = (type: string) => {
  const row = D.motors.find((m) => m[2] === type);
  return row ? D.motorYears.filter((_, i) => row[4][i] != null) : [];
};
export function motorOtr(type: string, year: number): number | null {
  const row = D.motors.find((m) => m[2] === type);
  const i = D.motorYears.indexOf(year);
  const p = row && i >= 0 ? row[4][i] : null;
  return p == null ? null : Math.round(p * 1_000_000);
}

// ---- helpers ----
const roundUp1000 = (x: number) => Math.ceil(x / 1000 - 1e-9) * 1000; // Excel ROUNDUP(x,-3)
const floorTo = (x: number, step: number) => Math.floor(x / step + 1e-9) * step;

/** Value of a (loan × tenor) table; the loan is matched on its tier, tenors must exist in the table. */
function lookup(tb: Table, loan: number, tenor: number): number | null {
  const r = tb.loans.indexOf(loan);
  const c = tb.t.indexOf(tenor);
  return r < 0 || c < 0 ? null : tb.v[r][c];
}

export type CarKind = "PASSANGER" | "PICKUP";
export interface Quote {
  tenor: number;
  loan: number;
  rate: number; // sell rate from the rate table
  asr: number; // insurance premium
  adm: number; // admin + policy
  principal: number; // pokok hutang
  installment: number; // angsuran per bulan
  commission: number | null; // komisi agen (internal)
}

// ---- mobil (R4) ----
export interface CarInput {
  kind: CarKind;
  ro: boolean;
  mahal: boolean;
  otr: number;
  unitYear: number;
  nowYear?: number;
}

const carTable = (k: CarInput, set: "carRate" | "carKomisi") => {
  const t = D[set];
  if (k.kind === "PICKUP") return t.pickup;
  if (!k.mahal) return t.murah;
  return k.ro ? t.roMahal : t.nonMahal;
};

/** Insurance over the life of the loan: the sum insured shrinks to 80% / 70% / 65% each year (DBASR). */
function carAsr(k: CarInput, loan: number, tenor: number): number {
  const years = tenor / 12;
  const now = k.nowYear ?? new Date().getFullYear();
  const shrink = [1, 0.8, 0.7, 0.65];
  const tsi1 = loan + D.adm.car;
  let sum = 0;
  for (let n = 0; n < years; n++) {
    const tsi = tsi1 * (shrink[n] ?? shrink[shrink.length - 1]);
    if (k.kind === "PICKUP") {
      sum += tsi * D.carAsr.pickup;
      continue;
    }
    const base = D.carAsr.passangerBands.find(([cap]) => cap === null || tsi < cap)![1];
    const age = now + n - k.unitYear;
    // older cars carry a loading: +5% at 11 years, +10% / +15% / +20% for 12 / 13 / 14; none beyond (as in the sheet)
    const load = age < 11 ? 1 : age === 11 ? 1.05 : age === 12 ? 1.1 : age === 13 ? 1.15 : age === 14 ? 1.2 : 0;
    sum += tsi * base * load;
  }
  return sum;
}

export function carQuote(k: CarInput, loan: number, tenor: number): Quote | null {
  const rate = lookup(carTable(k, "carRate"), loan, tenor);
  if (rate == null) return null;
  const asr = carAsr(k, loan, tenor);
  const adm = D.adm.car;
  const principal = loan + asr + adm;
  return { tenor, loan, rate, asr, adm, principal, installment: roundUp1000((principal * rate + principal) / tenor), commission: lookup(carTable(k, "carKomisi"), loan, tenor) };
}

/** Largest loan tier the unit supports at an LTV cap (the sheet shows LTV but does not cap it itself). */
export function carMaxLoan(otr: number, ltvMax: number): number | null {
  const m = floorTo(otr * ltvMax, CAR_STEP);
  return m < CAR_LOAN_RANGE[0] ? null : Math.min(m, CAR_LOAN_RANGE[1]);
}
export const snapCarLoan = (loan: number) => Math.min(Math.max(floorTo(loan, CAR_STEP), CAR_LOAN_RANGE[0]), CAR_LOAN_RANGE[1]);

// ---- motor (R2) ----
export interface MotorInput {
  ro: boolean;
}

export function motorQuote(k: MotorInput, loan: number, tenor: number): Quote | null {
  const rate = lookup(k.ro ? D.motorRate.ro : D.motorRate.non, loan, tenor);
  const insRate = D.motorAsr[String(tenor)];
  if (rate == null || insRate == null) return null;
  const adm = D.adm.motor;
  const asr = (loan + adm) / (1 - insRate) - (loan + adm);
  const principal = loan + asr + adm;
  return {
    tenor,
    loan,
    rate,
    asr,
    adm,
    principal,
    installment: roundUp1000((principal * rate * (tenor / 12) + principal) / tenor),
    commission: lookup(k.ro ? D.motorKomisi.ro : D.motorKomisi.non, loan, tenor),
  };
}
export function motorMaxLoan(otr: number, ltvMax: number): number | null {
  const m = floorTo(otr * ltvMax, MOTOR_STEP);
  return m < MOTOR_LOAN_RANGE[0] ? null : Math.min(m, MOTOR_LOAN_RANGE[1]);
}
export const snapMotorLoan = (loan: number) => Math.min(Math.max(floorTo(loan, MOTOR_STEP), MOTOR_LOAN_RANGE[0]), MOTOR_LOAN_RANGE[1]);
