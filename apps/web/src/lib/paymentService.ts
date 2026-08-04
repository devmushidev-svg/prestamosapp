import { supabase } from "./supabase";
import {
  getLoanDetail,
  INSTALLMENTS_CACHE_KEY,
  listLoans,
  LOANS_CACHE_KEY,
  type PrestamoConCliente,
  type PrestamoDetalle,
} from "./loanService";
import { moneyToCents, previewPayment, withInstallmentBalances, type CuotaConSaldo } from "./paymentAllocator";
import type { Cuota, Pago, PagoAplicacion } from "../types";
import {
  isNetworkFailure,
  queueOfflineOperation,
  readCache,
  readThroughCache,
  resolveOfflineAlias,
  updateCache,
  writeCache,
} from "./offlineDb";

export type PaymentContext = {
  prestamo: PrestamoDetalle;
  cuotas: CuotaConSaldo[];
};

export type PaymentSummary = Pago & {
  prestamo: PrestamoConCliente | null;
};

export type PaymentApplicationDetail = PagoAplicacion & {
  cuota: Pick<Cuota, "id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado"> | null;
};

export type PaymentDetail = {
  pago: Pago;
  prestamo: PrestamoDetalle;
  aplicaciones: PaymentApplicationDetail[];
};

type RawPayment = Partial<Pago> & Pick<Pago, "id" | "prestamo_id" | "fecha" | "monto">;

export const PAYMENTS_CACHE_KEY = "payments";
const paymentDetailCacheKey = (id: string) => `payment-detail:${id}`;
const loanDetailCacheKey = (id: string) => `loan-detail:${id}`;

function normalizePayment(row: RawPayment): Pago {
  return {
    id: row.id,
    prestamo_id: row.prestamo_id,
    cuota_id: row.cuota_id ?? null,
    solicitud_id: row.solicitud_id ?? null,
    numero_recibo: row.numero_recibo == null ? null : Number(row.numero_recibo),
    fecha: row.fecha,
    monto: Number(row.monto),
    recibo: row.recibo ?? null,
    saldo_anterior: row.saldo_anterior == null ? null : Number(row.saldo_anterior),
    saldo_posterior: row.saldo_posterior == null ? null : Number(row.saldo_posterior),
    notas: row.notas ?? null,
    datos_recibo: row.datos_recibo ?? null,
    creado_en: row.creado_en ?? row.fecha,
  };
}

function isMissingRpc(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "42883";
}

function isMissingPaymentMigration(error: { code?: string }) {
  return ["PGRST205", "42P01", "PGRST204", "42703", "PGRST200"].includes(error.code ?? "");
}

export async function refreshPortfolioStatuses(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const { error } = await supabase.rpc("actualizar_estados_cartera");
    if (error && isNetworkFailure(error)) return;
    if (error && !isMissingRpc(error)) throw error;
  } catch (cause) {
    if (!isNetworkFailure(cause)) throw cause;
  }
}

export async function listLoansForPayment(): Promise<PrestamoConCliente[]> {
  await refreshPortfolioStatuses();
  return (await listLoans()).filter(
    (loan) => loan.saldo > 0 && loan.estado !== "pagado" && loan.estado !== "cancelado"
  );
}

export async function getPaymentContext(prestamoId: string): Promise<PaymentContext> {
  await refreshPortfolioStatuses();
  const prestamo = await getLoanDetail(prestamoId);
  return { prestamo, cuotas: withInstallmentBalances(prestamo.cuotas) };
}

function hondurasToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function saveProvisionalPayment(input: {
  solicitudId: string;
  prestamoId: string;
  monto: number;
}): Promise<string> {
  const context = await getPaymentContext(input.prestamoId);
  const amountCents = moneyToCents(input.monto);
  const previousBalanceCents = moneyToCents(context.prestamo.saldo);
  if (amountCents <= 0 || amountCents > previousBalanceCents) {
    throw new Error("El pago no puede superar el saldo pendiente.");
  }
  const preview = previewPayment(input.monto, context.cuotas);
  if (moneyToCents(preview.montoSinAplicar) > 0) {
    throw new Error("El pago no se pudo aplicar completamente a las cuotas pendientes.");
  }

  const applicationByInstallment = new Map(
    preview.aplicaciones.map((application) => [application.cuotaId, moneyToCents(application.monto)]),
  );
  const today = hondurasToday();
  const updatedInstallments = context.prestamo.cuotas.map((installment): Cuota => {
    const paidCents = Math.min(
      moneyToCents(installment.monto),
      moneyToCents(installment.monto_pagado) + (applicationByInstallment.get(installment.id) ?? 0),
    );
    const fullyPaid = paidCents >= moneyToCents(installment.monto);
    return {
      ...installment,
      monto_pagado: paidCents / 100,
      estado: fullyPaid ? "pagada" : installment.fecha_vencimiento < today ? "vencida" : "pendiente",
    };
  });
  const remainingBalance = (previousBalanceCents - amountCents) / 100;
  const hasOverdue = updatedInstallments.some(
    (installment) => installment.estado !== "pagada" && installment.fecha_vencimiento < today,
  );
  const updatedLoan: PrestamoDetalle = {
    ...context.prestamo,
    saldo: remainingBalance,
    estado: remainingBalance === 0 ? "pagado" : hasOverdue ? "en_mora" : "al_dia",
    cuotas: updatedInstallments,
  };
  const localPaymentId = input.solicitudId;
  const capturedAt = new Date().toISOString();
  const pago: Pago = {
    id: localPaymentId,
    prestamo_id: input.prestamoId,
    cuota_id: preview.aplicaciones[0]?.cuotaId ?? null,
    solicitud_id: input.solicitudId,
    numero_recibo: null,
    fecha: capturedAt,
    monto: input.monto,
    recibo: `PEND-${input.solicitudId.slice(0, 8).toUpperCase()}`,
    saldo_anterior: previousBalanceCents / 100,
    saldo_posterior: remainingBalance,
    notas: "Pendiente de sincronización",
    datos_recibo: null,
    creado_en: capturedAt,
  };
  const aplicaciones: PaymentApplicationDetail[] = preview.aplicaciones.map((application) => {
    const cuota = updatedInstallments.find((item) => item.id === application.cuotaId) ?? null;
    return {
      id: crypto.randomUUID(),
      pago_id: localPaymentId,
      prestamo_id: input.prestamoId,
      cuota_id: application.cuotaId,
      monto: application.monto,
      creado_en: capturedAt,
      cuota,
    };
  });

  await queueOfflineOperation({
    id: `payment:${input.solicitudId}`,
    type: "payment.create",
    entityId: localPaymentId,
    requestId: input.solicitudId,
    payload: { localId: localPaymentId, input: { ...input, capturedAt } },
    dependsOn: [`loan:${input.prestamoId}`],
  });
  await Promise.all([
    updateCache<PrestamoConCliente[]>(LOANS_CACHE_KEY, (loans = []) => loans.map((loan) =>
      loan.id === input.prestamoId ? { ...loan, saldo: updatedLoan.saldo, estado: updatedLoan.estado } : loan
    )),
    updateCache<Cuota[]>(INSTALLMENTS_CACHE_KEY, (installments = []) => installments.map((installment) =>
      installment.prestamo_id === input.prestamoId
        ? updatedInstallments.find((item) => item.id === installment.id) ?? installment
        : installment
    )),
    writeCache<PrestamoDetalle>(loanDetailCacheKey(input.prestamoId), updatedLoan),
    updateCache<PaymentSummary[]>(PAYMENTS_CACHE_KEY, (payments = []) => [{
      ...pago,
      prestamo: updatedLoan,
    }, ...payments.filter((item) => item.id !== localPaymentId)]),
    writeCache<PaymentDetail>(paymentDetailCacheKey(localPaymentId), { pago, prestamo: updatedLoan, aplicaciones }),
  ]);
  return localPaymentId;
}

export async function registerPayment(input: {
  solicitudId: string;
  prestamoId: string;
  monto: number;
}): Promise<string> {
  if (!navigator.onLine) return saveProvisionalPayment(input);

  let data: unknown = null;
  let error: { code?: string; message: string } | null = null;
  try {
    const result = await supabase.rpc("registrar_pago", {
      p_solicitud_id: input.solicitudId,
      p_prestamo_id: await resolveOfflineAlias(input.prestamoId),
      p_monto: input.monto,
    });
    data = result.data;
    error = result.error;
  } catch (cause) {
    if (!isNetworkFailure(cause)) throw cause;
    error = { message: cause instanceof Error ? cause.message : "Sin conexión" };
  }
  if (!error && typeof data === "string") return data;
  if (error && isNetworkFailure(error)) return saveProvisionalPayment(input);
  if (error && isMissingRpc(error)) throw new Error("Falta aplicar la actualización de pagos en Supabase.");
  if (error) throw new Error(error.message);
  throw new Error("Supabase devolvió una respuesta inesperada. No se reintentó para evitar duplicados.");
}

export async function listPayments(prestamoId?: string): Promise<PaymentSummary[]> {
  const payments = await readThroughCache(PAYMENTS_CACHE_KEY, async () => {
    const paymentRows: RawPayment[] = [];
    const loansPromise = listLoans();
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const paymentResult = await supabase
        .from("pagos")
        .select("*")
        .order("fecha", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (paymentResult.error) throw paymentResult.error;
      const batch = (paymentResult.data ?? []) as RawPayment[];
      paymentRows.push(...batch);
      if (batch.length < pageSize) break;
    }
    const loans = await loansPromise;
    const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
    return paymentRows.map((row) => {
      const pago = normalizePayment(row);
      return { ...pago, prestamo: loanMap.get(pago.prestamo_id) ?? null };
    });
  });
  return prestamoId ? payments.filter((payment) => payment.prestamo_id === prestamoId) : payments;
}

type RawApplication = PagoAplicacion & {
  cuotas:
    | Pick<Cuota, "id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado">
    | Array<Pick<Cuota, "id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado">>
    | null;
};

async function loadRemotePaymentDetail(id: string): Promise<PaymentDetail> {
  const paymentResult = await supabase.from("pagos").select("*").eq("id", id).single();
  if (paymentResult.error) throw paymentResult.error;
  const pago = normalizePayment(paymentResult.data as RawPayment);
  const [prestamo, applicationResult] = await Promise.all([
    getLoanDetail(pago.prestamo_id),
    supabase
      .from("pago_aplicaciones")
      .select("*,cuotas(id,numero,fecha_vencimiento,monto,monto_pagado,estado)")
      .eq("pago_id", id)
      .order("creado_en"),
  ]);
  if (applicationResult.error && !isMissingPaymentMigration(applicationResult.error)) throw applicationResult.error;
  if (applicationResult.error) {
    const legacyInstallment = pago.cuota_id
      ? prestamo.cuotas.find((installment) => installment.id === pago.cuota_id) ?? null
      : null;
    const aplicaciones: PaymentApplicationDetail[] = legacyInstallment
      ? [{
          id: `legacy-${pago.id}`,
          pago_id: pago.id,
          prestamo_id: pago.prestamo_id,
          cuota_id: legacyInstallment.id,
          monto: pago.monto,
          creado_en: pago.fecha,
          cuota: legacyInstallment,
        }]
      : [];
    return { pago, prestamo, aplicaciones };
  }
  const aplicaciones = ((applicationResult.data ?? []) as RawApplication[]).map((row) => {
    const related = Array.isArray(row.cuotas) ? row.cuotas[0] ?? null : row.cuotas;
    return {
      id: row.id,
      pago_id: row.pago_id,
      prestamo_id: row.prestamo_id,
      cuota_id: row.cuota_id,
      monto: Number(row.monto),
      creado_en: row.creado_en,
      cuota: related
        ? {
            ...related,
            numero: Number(related.numero),
            monto: Number(related.monto),
            monto_pagado: Number(related.monto_pagado),
          }
        : null,
    };
  });
  return { pago, prestamo, aplicaciones };
}

export async function getPaymentDetail(id: string): Promise<PaymentDetail> {
  const resolvedId = await resolveOfflineAlias(id);
  if (resolvedId === id) {
    const provisional = await readCache<PaymentDetail>(paymentDetailCacheKey(id));
    if (provisional) return provisional;
  }
  try {
    return await readThroughCache(paymentDetailCacheKey(resolvedId), () => loadRemotePaymentDetail(resolvedId));
  } catch (cause) {
    if (!isNetworkFailure(cause) && navigator.onLine) throw cause;
    const payments = await readCache<PaymentSummary[]>(PAYMENTS_CACHE_KEY);
    const summary = payments?.find((item) => item.id === resolvedId || item.id === id);
    if (!summary) throw cause;
    const prestamo = await getLoanDetail(summary.prestamo_id);
    const snapshotApplications = summary.datos_recibo?.aplicaciones ?? [];
    const aplicaciones: PaymentApplicationDetail[] = snapshotApplications.map((application, index) => ({
      id: `snapshot-${summary.id}-${index}`,
      pago_id: summary.id,
      prestamo_id: summary.prestamo_id,
      cuota_id: summary.cuota_id ?? `snapshot-${index}`,
      monto: Number(application.monto),
      creado_en: summary.fecha,
      cuota: {
        id: summary.cuota_id ?? `snapshot-${index}`,
        numero: Number(application.numeroCuota),
        fecha_vencimiento: "",
        monto: Number(application.monto),
        monto_pagado: Number(application.monto),
        estado: "pagada",
      },
    }));
    const detail = { pago: summary, prestamo, aplicaciones } satisfies PaymentDetail;
    await writeCache(paymentDetailCacheKey(resolvedId), detail);
    return detail;
  }
}

export async function getPaymentDetails(ids: string[]): Promise<PaymentDetail[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  return Promise.all(uniqueIds.map((id) => getPaymentDetail(id)));
}
