import { calculateFixedLoan, type FixedLoanCalculation, type FixedLoanInput } from "./loanCalculator";
import { supabase } from "./supabase";
import type { Cliente, Cuota, DiaPagoSemana, EstadoCliente, Prestamo } from "../types";
import { listCustomers } from "./customerService";
import {
  isNetworkFailure,
  listOfflineOperations,
  queueOfflineOperation,
  readCache,
  readThroughCache,
  resolveOfflineAlias,
  updateCache,
  writeCache,
} from "./offlineDb";

export type ClienteResumen = Pick<Cliente, "id" | "nombre" | "identidad" | "telefono" | "direccion"> & {
  estado?: EstadoCliente;
};

export type PrestamoConCliente = Prestamo & {
  cliente: ClienteResumen | null;
};

export type PrestamoDetalle = PrestamoConCliente & {
  cuotas: Cuota[];
};

export type CreateFixedLoanInput = FixedLoanInput & { clienteId: string; solicitudId: string };

type RawLoanWithCustomer = Prestamo & {
  clientes: ClienteResumen | ClienteResumen[] | null;
};

export const LOANS_CACHE_KEY = "loans";
export const INSTALLMENTS_CACHE_KEY = "installments";
const loanDetailCacheKey = (id: string) => `loan-detail:${id}`;

function normalizeLoan(row: RawLoanWithCustomer): PrestamoConCliente {
  const relatedCustomer = Array.isArray(row.clientes) ? row.clientes[0] ?? null : row.clientes;
  return {
    id: row.id,
    numero: row.numero == null ? null : Number(row.numero),
    cliente_id: row.cliente_id,
    monto: Number(row.monto),
    tasa_interes: Number(row.tasa_interes),
    plazo: Number(row.plazo),
    frecuencia: row.frecuencia,
    fecha_inicio: row.fecha_inicio,
    fecha_primer_pago: row.fecha_primer_pago ?? null,
    dia_pago_semana: row.dia_pago_semana == null ? null : Number(row.dia_pago_semana) as DiaPagoSemana,
    tasa_mora: Number(row.tasa_mora ?? 0),
    saldo: Number(row.saldo),
    estado: row.estado,
    solicitud_id: row.solicitud_id ?? null,
    creado_en: row.creado_en,
    cliente: relatedCustomer,
  };
}

function normalizeInstallment(row: Cuota): Cuota {
  const amount = Number(row.monto);
  return {
    ...row,
    numero: Number(row.numero),
    monto: amount,
    // Compatibilidad con el esquema inicial: una cuota que ya figuraba pagada
    // equivale a tener todo su monto aplicado aunque la columna aún no existiera.
    monto_pagado: Number(row.monto_pagado ?? (row.estado === "pagada" ? amount : 0)),
  };
}

export async function listCustomersForLoan(): Promise<ClienteResumen[]> {
  return (await listCustomers())
    .filter((customer) => customer.estado !== "cancelado")
    .map(({ id, nombre, identidad, telefono, direccion, estado }) => ({
      id,
      nombre,
      identidad,
      telefono,
      direccion,
      estado,
    }));
}

export async function listLoans(): Promise<PrestamoConCliente[]> {
  return readThroughCache(LOANS_CACHE_KEY, async () => {
    const pageSize = 500;
    const rows: RawLoanWithCustomer[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("prestamos")
        .select("*,clientes(id,nombre,identidad,telefono,direccion)")
        .order("creado_en", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = (data ?? []) as RawLoanWithCustomer[];
      rows.push(...batch);
      if (batch.length < pageSize) return rows.map(normalizeLoan);
    }
  });
}

export async function listAllInstallments(): Promise<Cuota[]> {
  return readThroughCache(INSTALLMENTS_CACHE_KEY, async () => {
    const pageSize = 500;
    const rows: Cuota[] = [];
    for (let from = 0; ; from += pageSize) {
      const result = await supabase
        .from("cuotas")
        .select("*")
        .order("fecha_vencimiento", { ascending: true })
        .order("prestamo_id", { ascending: true })
        .order("numero", { ascending: true })
        .range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      const batch = ((result.data ?? []) as Cuota[]).map(normalizeInstallment);
      rows.push(...batch);
      if (batch.length < pageSize) return rows;
    }
  });
}

export async function getLoanDetail(id: string): Promise<PrestamoDetalle> {
  const resolvedId = await resolveOfflineAlias(id);
  if (resolvedId !== id) {
    const [local, operations] = await Promise.all([
      readCache<PrestamoDetalle>(loanDetailCacheKey(id)),
      listOfflineOperations(),
    ]);
    const keepsOptimisticPayment = operations.some((operation) => {
      if (operation.type !== "payment.create") return false;
      const payload = operation.payload as { input?: { prestamoId?: string } };
      return payload.input?.prestamoId === id;
    });
    if (local && keepsOptimisticPayment) return local;
  }
  try {
    return await readThroughCache(loanDetailCacheKey(resolvedId), async () => {
      const [loanResult, installmentsResult] = await Promise.all([
        supabase.from("prestamos").select("*,clientes(id,nombre,identidad,telefono,direccion)").eq("id", resolvedId).single(),
        supabase.from("cuotas").select("*").eq("prestamo_id", resolvedId).order("numero"),
      ]);
      if (loanResult.error) throw loanResult.error;
      if (installmentsResult.error) throw installmentsResult.error;
      return {
        ...normalizeLoan(loanResult.data as RawLoanWithCustomer),
        cuotas: ((installmentsResult.data ?? []) as Cuota[]).map(normalizeInstallment),
      };
    });
  } catch (cause) {
    if (!isNetworkFailure(cause)) throw cause;
    const local = await readCache<PrestamoDetalle>(loanDetailCacheKey(id));
    if (local) return local;
    const [loans, installments] = await Promise.all([listLoans(), listAllInstallments()]);
    const loan = loans.find((item) => item.id === id || item.id === resolvedId);
    if (!loan) throw cause;
    return {
      ...loan,
      cuotas: installments.filter((item) => item.prestamo_id === loan.id).map(normalizeInstallment),
    };
  }
}

function isMissingCreateLoanRpc(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

export async function createFixedLoan(
  input: CreateFixedLoanInput
): Promise<{ id: string; calculation: FixedLoanCalculation }> {
  const calculation = calculateFixedLoan(input);
  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  if (navigator.onLine) {
    try {
      const result = await supabase.rpc("crear_prestamo_con_cuotas", {
        p_solicitud_id: input.solicitudId,
        p_cliente_id: input.clienteId,
        p_monto: calculation.capital,
        p_tasa_interes: calculation.tasaInteres,
        p_plazo: input.plazo,
        p_frecuencia: input.frecuencia,
        p_fecha_inicio: input.fechaInicio,
        p_dia_pago_semana: input.frecuencia === "semanal" ? input.diaPagoSemana ?? null : null,
      });
      data = result.data;
      error = result.error;
    } catch (cause) {
      if (!isNetworkFailure(cause)) throw cause;
      error = { message: cause instanceof Error ? cause.message : "Sin conexión" };
    }
  } else {
    error = { message: "Sin conexión" };
  }

  if (!error && typeof data === "string") return { id: data, calculation };
  if (error && isNetworkFailure(error)) {
    const localId = input.solicitudId;
    const cliente = (await listCustomersForLoan()).find((item) => item.id === input.clienteId) ?? null;
    const creadoEn = new Date().toISOString();
    const localLoan: PrestamoConCliente = {
      id: localId,
      numero: null,
      cliente_id: input.clienteId,
      monto: calculation.capital,
      tasa_interes: calculation.tasaInteres,
      plazo: input.plazo,
      frecuencia: input.frecuencia,
      fecha_inicio: input.fechaInicio,
      fecha_primer_pago: calculation.fechaPrimerPago,
      dia_pago_semana: input.frecuencia === "semanal" ? input.diaPagoSemana ?? null : null,
      tasa_mora: 1.5,
      saldo: calculation.totalPagar,
      estado: "activo",
      solicitud_id: input.solicitudId,
      creado_en: creadoEn,
      cliente,
    };
    const localInstallments: Cuota[] = calculation.cuotas.map((installment) => ({
      id: crypto.randomUUID(),
      prestamo_id: localId,
      numero: installment.numero,
      fecha_vencimiento: installment.fechaVencimiento,
      monto: installment.monto,
      monto_pagado: 0,
      estado: "pendiente",
    }));
    await queueOfflineOperation({
      id: `loan:${input.solicitudId}`,
      type: "loan.create",
      entityId: localId,
      requestId: input.solicitudId,
      payload: {
        localId,
        input: {
          solicitudId: input.solicitudId,
          clienteId: input.clienteId,
          monto: calculation.capital,
          tasaInteres: calculation.tasaInteres,
          plazo: input.plazo,
          frecuencia: input.frecuencia,
          fechaInicio: input.fechaInicio,
          diaPagoSemana: input.frecuencia === "semanal" ? input.diaPagoSemana ?? null : null,
        },
      },
    });
    await Promise.all([
      updateCache<PrestamoConCliente[]>(LOANS_CACHE_KEY, (loans = []) => [
        localLoan,
        ...loans.filter((loan) => loan.id !== localId),
      ]),
      updateCache<Cuota[]>(INSTALLMENTS_CACHE_KEY, (installments = []) => [
        ...installments.filter((item) => item.prestamo_id !== localId),
        ...localInstallments,
      ]),
      writeCache<PrestamoDetalle>(loanDetailCacheKey(localId), { ...localLoan, cuotas: localInstallments }),
    ]);
    return { id: localId, calculation };
  }
  if (error && isMissingCreateLoanRpc(error)) {
    throw new Error("Falta aplicar la actualización de planes comerciales en Supabase.");
  }
  if (error) throw error;
  throw new Error("Supabase devolvió una respuesta inesperada. No se reintentó para evitar duplicados.");
}
