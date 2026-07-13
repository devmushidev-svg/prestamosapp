import { supabase } from "./supabase";
import { getLoanDetail, listLoans, type PrestamoConCliente, type PrestamoDetalle } from "./loanService";
import { withInstallmentBalances, type CuotaConSaldo } from "./paymentAllocator";
import type { Cuota, Pago, PagoAplicacion } from "../types";

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
  const { error } = await supabase.rpc("actualizar_estados_cartera");
  if (error && !isMissingRpc(error)) throw error;
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

export async function registerPayment(input: {
  solicitudId: string;
  prestamoId: string;
  monto: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("registrar_pago", {
    p_solicitud_id: input.solicitudId,
    p_prestamo_id: input.prestamoId,
    p_monto: input.monto,
  });
  if (!error && typeof data === "string") return data;
  if (error && isMissingRpc(error)) throw new Error("Falta aplicar la actualización de pagos en Supabase.");
  if (error) throw new Error(error.message);
  throw new Error("Supabase devolvió una respuesta inesperada. No se reintentó para evitar duplicados.");
}

export async function listPayments(prestamoId?: string): Promise<PaymentSummary[]> {
  let query = supabase.from("pagos").select("*").order("fecha", { ascending: false });
  if (prestamoId) query = query.eq("prestamo_id", prestamoId);
  const [paymentResult, loans] = await Promise.all([query, listLoans()]);
  if (paymentResult.error) throw paymentResult.error;
  const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
  return ((paymentResult.data ?? []) as RawPayment[]).map((row) => {
    const pago = normalizePayment(row);
    return { ...pago, prestamo: loanMap.get(pago.prestamo_id) ?? null };
  });
}

type RawApplication = PagoAplicacion & {
  cuotas:
    | Pick<Cuota, "id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado">
    | Array<Pick<Cuota, "id" | "numero" | "fecha_vencimiento" | "monto" | "monto_pagado" | "estado">>
    | null;
};

export async function getPaymentDetail(id: string): Promise<PaymentDetail> {
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
