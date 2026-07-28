import type { Cuota } from "../types";
import { listLoans, type PrestamoConCliente } from "./loanService";
import { moneyToCents } from "./paymentAllocator";
import { refreshPortfolioStatuses } from "./paymentService";
import { supabase } from "./supabase";

const HONDURAS_TIME_ZONE = "America/Tegucigalpa";

export type AgendaFilter = "vencidas" | "hoy" | "proximas";

export type AgendaInstallment = {
  id: string;
  numero: number;
  fechaVencimiento: string;
  monto: number;
  montoPagado: number;
  pendiente: number;
};

export type AgendaItem = {
  /** Identificador estable para la combinación préstamo + categoría. */
  id: string;
  prestamoId: string;
  prestamoNumero: number | null;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  /** Fecha más antigua incluida en este grupo. */
  fechaVencimiento: string;
  monto: number;
  montoPagado: number;
  pendiente: number;
  saldoPrestamo: number;
  categoria: AgendaFilter;
  cantidadCuotas: number;
  cuotas: AgendaInstallment[];
};

export type AgendaSummary = {
  /** Cantidad de préstamos, no de cuotas. */
  count: number;
  amount: number;
  customers: number;
  installments: number;
};

export type CollectionAgenda = {
  items: AgendaItem[];
  summary: Record<AgendaFilter | "total", AgendaSummary>;
  /** Fecha civil actual en Honduras, YYYY-MM-DD. */
  today: string;
  /** Última fecha incluida en próximos cobros, YYYY-MM-DD. */
  through: string;
};

export type CollectionAgendaOptions = {
  daysAhead?: number;
  now?: Date;
  /** El panel ya actualiza la cartera antes de cargar sus KPIs. */
  refreshStatuses?: boolean;
};

type RawInstallment = Pick<
  Cuota,
  "id" | "prestamo_id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado"
>;

function civilDateInHonduras(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONDURAS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCivilDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function fromCents(value: number): number {
  return value / 100;
}

function normalizeInstallment(row: RawInstallment): AgendaInstallment | null {
  const amountCents = Math.max(0, moneyToCents(Number(row.monto)));
  const paidCents = Math.min(amountCents, Math.max(0, moneyToCents(Number(row.monto_pagado ?? 0))));
  const pendingCents = amountCents - paidCents;
  if (pendingCents <= 0) return null;
  return {
    id: row.id,
    numero: Number(row.numero),
    fechaVencimiento: row.fecha_vencimiento,
    monto: fromCents(amountCents),
    montoPagado: fromCents(paidCents),
    pendiente: fromCents(pendingCents),
  };
}

function categoryForDate(date: string, today: string): AgendaFilter {
  if (date < today) return "vencidas";
  if (date === today) return "hoy";
  return "proximas";
}

function makeAgendaItem(
  category: AgendaFilter,
  loan: PrestamoConCliente,
  installments: AgendaInstallment[]
): AgendaItem {
  const sorted = [...installments].sort(
    (left, right) =>
      left.fechaVencimiento.localeCompare(right.fechaVencimiento) ||
      left.numero - right.numero ||
      left.id.localeCompare(right.id)
  );
  const amountCents = sorted.reduce((sum, installment) => sum + moneyToCents(installment.monto), 0);
  const paidCents = sorted.reduce((sum, installment) => sum + moneyToCents(installment.montoPagado), 0);
  const pendingCents = sorted.reduce((sum, installment) => sum + moneyToCents(installment.pendiente), 0);
  return {
    id: `${category}:${loan.id}`,
    prestamoId: loan.id,
    prestamoNumero: loan.numero,
    clienteId: loan.cliente_id,
    clienteNombre: loan.cliente?.nombre ?? "Cliente no disponible",
    clienteTelefono: loan.cliente?.telefono ?? null,
    fechaVencimiento: sorted[0].fechaVencimiento,
    monto: fromCents(amountCents),
    montoPagado: fromCents(paidCents),
    pendiente: fromCents(pendingCents),
    saldoPrestamo: Number(loan.saldo),
    categoria: category,
    cantidadCuotas: sorted.length,
    cuotas: sorted,
  };
}

function summarize(items: AgendaItem[], uniqueLoans = false): AgendaSummary {
  const loans = new Set(items.map((item) => item.prestamoId));
  return {
    count: uniqueLoans ? loans.size : items.length,
    amount: fromCents(items.reduce((sum, item) => sum + moneyToCents(item.pendiente), 0)),
    customers: new Set(items.map((item) => item.clienteId)).size,
    installments: items.reduce((sum, item) => sum + item.cantidadCuotas, 0),
  };
}

const PAGE_SIZE = 500;

async function listInstallmentsThrough(through: string): Promise<RawInstallment[]> {
  const rows: RawInstallment[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from("cuotas")
      .select("id,prestamo_id,numero,fecha_vencimiento,monto,monto_pagado,estado")
      .lte("fecha_vencimiento", through)
      .order("fecha_vencimiento", { ascending: true })
      .order("prestamo_id", { ascending: true })
      .order("numero", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const batch = (result.data ?? []) as RawInstallment[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

/**
 * Carga cuotas vencidas, de hoy y de los próximos días, agrupadas por préstamo.
 * La categoría se deriva de la fecha civil hondureña y el pendiente se calcula
 * desde monto - monto_pagado; no depende únicamente del estado almacenado.
 */
export async function getCollectionAgenda(options: CollectionAgendaOptions = {}): Promise<CollectionAgenda> {
  const { daysAhead = 7, now = new Date(), refreshStatuses = true } = options;
  const safeDaysAhead = Number.isFinite(daysAhead) ? Math.max(0, Math.min(3_650, Math.floor(daysAhead))) : 7;
  const today = civilDateInHonduras(now);
  const through = addCivilDays(today, safeDaysAhead);

  if (refreshStatuses) await refreshPortfolioStatuses();
  const [loans, installments] = await Promise.all([
    listLoans(),
    listInstallmentsThrough(through),
  ]);

  const loanMap = new Map(
    loans
      .filter((loan) => loan.saldo > 0 && loan.estado !== "pagado" && loan.estado !== "cancelado")
      .map((loan) => [loan.id, loan] as const)
  );
  const groups = new Map<string, { category: AgendaFilter; loan: PrestamoConCliente; installments: AgendaInstallment[] }>();

  for (const row of installments) {
    const loan = loanMap.get(row.prestamo_id);
    if (!loan) continue;
    const installment = normalizeInstallment(row);
    if (!installment) continue;
    const category = categoryForDate(installment.fechaVencimiento, today);
    const key = `${category}:${loan.id}`;
    const current = groups.get(key) ?? { category, loan, installments: [] };
    current.installments.push(installment);
    groups.set(key, current);
  }

  const items = [...groups.values()]
    .map(({ category, loan, installments }) => makeAgendaItem(category, loan, installments))
    .sort(
      (left, right) =>
        left.fechaVencimiento.localeCompare(right.fechaVencimiento) ||
        left.clienteNombre.localeCompare(right.clienteNombre, "es-HN") ||
        left.prestamoId.localeCompare(right.prestamoId)
    );
  const byCategory = (category: AgendaFilter) => items.filter((item) => item.categoria === category);

  return {
    items,
    summary: {
      vencidas: summarize(byCategory("vencidas")),
      hoy: summarize(byCategory("hoy")),
      proximas: summarize(byCategory("proximas")),
      total: summarize(items, true),
    },
    today,
    through,
  };
}
