import type { DiaPagoSemana, FrecuenciaPago } from "../types";

const HONDURAS_TIME_ZONE = "America/Tegucigalpa";
const RATE_SCALE = 10_000n;
const MAX_INSTALLMENTS = 600;
const MAX_DATABASE_CENTS = 99_999_999_999_999n;

export const FREQUENCY_LABELS: Record<FrecuenciaPago, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export const NEW_LOAN_FREQUENCIES = ["diario", "semanal", "quincenal"] as const;
export type NewLoanFrequency = (typeof NEW_LOAN_FREQUENCIES)[number];

export const WEEKDAY_LABELS: Record<DiaPagoSemana, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export type LoanTermOption = {
  plazo: number;
  label: string;
  detail: string;
};

const TERM_OPTIONS: Record<NewLoanFrequency, LoanTermOption[]> = {
  diario: [
    { plazo: 24, label: "24 días", detail: "24 pagos diarios" },
    { plazo: 40, label: "40 días", detail: "40 pagos diarios" },
  ],
  semanal: [
    { plazo: 12, label: "3 meses", detail: "12 pagos semanales" },
    { plazo: 24, label: "6 meses", detail: "24 pagos semanales" },
    { plazo: 36, label: "9 meses", detail: "36 pagos semanales" },
    { plazo: 48, label: "12 meses", detail: "48 pagos semanales" },
  ],
  quincenal: [
    { plazo: 18, label: "9 meses", detail: "18 pagos quincenales" },
    { plazo: 24, label: "12 meses", detail: "24 pagos quincenales" },
  ],
};

const DAILY_RATE_OPTIONS: Record<number, number[]> = {
  24: [15, 20],
  40: [30, 40],
};

export function getLoanTermOptions(frequency: NewLoanFrequency): LoanTermOption[] {
  return TERM_OPTIONS[frequency];
}

export function getDailyRateOptions(plazo: number): number[] {
  return DAILY_RATE_OPTIONS[plazo] ?? [];
}

export function formatLoanPlan(frequency: FrecuenciaPago, plazo: number): string {
  if (frequency === "diario") return `${plazo} días · ${plazo} pagos diarios`;
  if (frequency === "semanal") {
    const months = plazo / 4;
    return Number.isInteger(months)
      ? `${months} meses · ${plazo} pagos semanales`
      : `${plazo} pagos semanales`;
  }
  if (frequency === "quincenal") {
    const months = plazo / 2;
    return Number.isInteger(months)
      ? `${months} meses · ${plazo} pagos quincenales`
      : `${plazo} pagos quincenales`;
  }
  return `${plazo} pagos mensuales`;
}

export type CalculatedInstallment = {
  numero: number;
  fechaVencimiento: string;
  monto: number;
};

export type FixedLoanCalculation = {
  capital: number;
  tasaInteres: number;
  interes: number;
  totalPagar: number;
  fechaPrimerPago: string;
  cuotas: CalculatedInstallment[];
};

export type FixedLoanInput = {
  capital: number;
  tasaInteres: number;
  plazo: number;
  frecuencia: FrecuenciaPago;
  fechaInicio: string;
  diaPagoSemana?: DiaPagoSemana | null;
};

type CivilDateParts = { year: number; month: number; day: number };

function parseCivilDate(value: string): CivilDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("La fecha de inicio no es válida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("La fecha de inicio no es válida.");
  }
  return { year, month, day };
}

function formatCivilDate({ year, month, day }: CivilDateParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const { year, month, day } = parseCivilDate(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatCivilDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function addMonthsClamped(value: string, months: number): string {
  const start = parseCivilDate(value);
  const monthIndex = start.month - 1 + months;
  const year = start.year + Math.floor(monthIndex / 12);
  const monthZeroBased = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
  return formatCivilDate({ year, month: monthZeroBased + 1, day: Math.min(start.day, lastDay) });
}

function isoWeekday(value: string): number {
  const { year, month, day } = parseCivilDate(value);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function getDefaultWeeklyPaymentDay(fechaInicio: string): DiaPagoSemana {
  const weekday = isoWeekday(fechaInicio);
  return weekday >= 1 && weekday <= 6 ? weekday as DiaPagoSemana : 1;
}

export function getFirstPaymentDate(
  fechaInicio: string,
  frecuencia: FrecuenciaPago,
  diaPagoSemana?: DiaPagoSemana | null
): string {
  parseCivilDate(fechaInicio);
  if (frecuencia === "diario") return addDays(fechaInicio, 1);
  if (frecuencia === "quincenal") return addDays(fechaInicio, 15);
  if (frecuencia === "mensual") return addMonthsClamped(fechaInicio, 1);
  if (!diaPagoSemana || diaPagoSemana < 1 || diaPagoSemana > 6) {
    throw new Error("Seleccione un día de cobro entre lunes y sábado.");
  }
  const startWeekday = isoWeekday(fechaInicio);
  const rawDelta = (diaPagoSemana - startWeekday + 7) % 7;
  return addDays(fechaInicio, rawDelta === 0 ? 7 : rawDelta);
}

function dueDate(input: FixedLoanInput, numero: number): string {
  if (input.frecuencia === "mensual") return addMonthsClamped(input.fechaInicio, numero);
  const firstPayment = getFirstPaymentDate(input.fechaInicio, input.frecuencia, input.diaPagoSemana);
  if (input.frecuencia === "diario") return addDays(firstPayment, numero - 1);
  if (input.frecuencia === "semanal") return addDays(firstPayment, (numero - 1) * 7);
  return addDays(firstPayment, (numero - 1) * 15);
}

function validateCommercialPlan(input: FixedLoanInput, normalizedRate: number) {
  if (input.frecuencia === "diario") {
    if (![24, 40].includes(input.plazo)) {
      throw new Error("El cobro diario solo permite planes de 24 o 40 días.");
    }
    if (!getDailyRateOptions(input.plazo).includes(normalizedRate)) {
      throw new Error(`Para ${input.plazo} días seleccione una tasa permitida.`);
    }
    if (input.diaPagoSemana != null) throw new Error("El plan diario no utiliza un día semanal.");
    return;
  }
  if (input.frecuencia === "semanal") {
    if (![12, 24, 36, 48].includes(input.plazo)) {
      throw new Error("El cobro semanal solo permite planes de 3, 6, 9 o 12 meses.");
    }
    if (!input.diaPagoSemana || input.diaPagoSemana < 1 || input.diaPagoSemana > 6) {
      throw new Error("Seleccione un día de cobro entre lunes y sábado.");
    }
    return;
  }
  if (input.frecuencia === "quincenal") {
    if (![18, 24].includes(input.plazo)) {
      throw new Error("El cobro quincenal solo permite planes de 9 o 12 meses.");
    }
    if (input.diaPagoSemana != null) throw new Error("El plan quincenal no utiliza un día semanal.");
  }
}

function toScaledInteger(value: number, scale: number, label: string): bigint {
  if (!Number.isFinite(value)) throw new Error(`${label} no es válido.`);
  const rawScaled = value * scale;
  const scaled = Math.round(rawScaled);
  if (Math.abs(rawScaled - scaled) > 0.000001) {
    throw new Error(`${label} debe tener máximo dos decimales.`);
  }
  if (!Number.isSafeInteger(scaled)) throw new Error(`${label} es demasiado alto.`);
  return BigInt(scaled);
}

function centsToNumber(value: bigint): number {
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) throw new Error("El total del préstamo es demasiado alto.");
  return asNumber / 100;
}

export function hondurasToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HONDURAS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calculateFixedLoan(input: FixedLoanInput): FixedLoanCalculation {
  if (!Number.isFinite(input.capital) || input.capital <= 0) {
    throw new Error("El capital debe ser mayor que cero.");
  }
  if (!Number.isFinite(input.tasaInteres) || input.tasaInteres < 0) {
    throw new Error("La tasa de interés no puede ser negativa.");
  }
  const capitalCents = toScaledInteger(input.capital, 100, "El capital");
  const rateHundredths = toScaledInteger(input.tasaInteres, 100, "La tasa de interés");
  const normalizedRate = Number(rateHundredths) / 100;

  if (capitalCents > MAX_DATABASE_CENTS) throw new Error("El capital es demasiado alto.");
  if (rateHundredths > 999_999n) throw new Error("La tasa de interés es demasiado alta.");
  if (!Number.isInteger(input.plazo) || input.plazo < 1 || input.plazo > MAX_INSTALLMENTS) {
    throw new Error(`El plazo debe estar entre 1 y ${MAX_INSTALLMENTS} cuotas.`);
  }
  parseCivilDate(input.fechaInicio);
  validateCommercialPlan(input, normalizedRate);

  const interestCents = (capitalCents * rateHundredths + RATE_SCALE / 2n) / RATE_SCALE;
  const totalCents = capitalCents + interestCents;
  if (totalCents > MAX_DATABASE_CENTS) throw new Error("El total del préstamo es demasiado alto.");
  const installmentCount = BigInt(input.plazo);
  const baseCents = totalCents / installmentCount;
  const remainder = totalCents % installmentCount;
  if (baseCents < 1n) throw new Error("El total es demasiado bajo para la cantidad de cuotas.");

  const cuotas = Array.from({ length: input.plazo }, (_, index) => {
    const numero = index + 1;
    const amountCents = baseCents + (BigInt(numero) <= remainder ? 1n : 0n);
    return {
      numero,
      fechaVencimiento: dueDate(input, numero),
      monto: centsToNumber(amountCents),
    };
  });

  return {
    capital: centsToNumber(capitalCents),
    tasaInteres: normalizedRate,
    interes: centsToNumber(interestCents),
    totalPagar: centsToNumber(totalCents),
    fechaPrimerPago: cuotas[0].fechaVencimiento,
    cuotas,
  };
}
