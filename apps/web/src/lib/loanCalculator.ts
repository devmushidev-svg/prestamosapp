import type { FrecuenciaPago } from "../types";

const HONDURAS_TIME_ZONE = "America/Tegucigalpa";
const RATE_SCALE = 10_000n;
const MAX_INSTALLMENTS = 600;
const MAX_DATABASE_CENTS = 99_999_999_999_999n;

export const FREQUENCY_LABELS: Record<FrecuenciaPago, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

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
  cuotas: CalculatedInstallment[];
};

export type FixedLoanInput = {
  capital: number;
  tasaInteres: number;
  plazo: number;
  frecuencia: FrecuenciaPago;
  fechaInicio: string;
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

function dueDate(fechaInicio: string, frecuencia: FrecuenciaPago, numero: number): string {
  if (frecuencia === "semanal") return addDays(fechaInicio, numero * 7);
  if (frecuencia === "quincenal") return addDays(fechaInicio, numero * 15);
  return addMonthsClamped(fechaInicio, numero);
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

  if (capitalCents > MAX_DATABASE_CENTS) throw new Error("El capital es demasiado alto.");
  if (rateHundredths > 999_999n) throw new Error("La tasa de interés es demasiado alta.");
  if (!Number.isInteger(input.plazo) || input.plazo < 1 || input.plazo > MAX_INSTALLMENTS) {
    throw new Error(`El plazo debe estar entre 1 y ${MAX_INSTALLMENTS} cuotas.`);
  }
  parseCivilDate(input.fechaInicio);

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
      fechaVencimiento: dueDate(input.fechaInicio, input.frecuencia, numero),
      monto: centsToNumber(amountCents),
    };
  });

  return {
    capital: centsToNumber(capitalCents),
    tasaInteres: Number(rateHundredths) / 100,
    interes: centsToNumber(interestCents),
    totalPagar: centsToNumber(totalCents),
    cuotas,
  };
}
