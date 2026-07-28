import { calculateFixedLoan, type FixedLoanCalculation, type FixedLoanInput } from "./loanCalculator";
import { supabase } from "./supabase";
import type { Cliente, Cuota, DiaPagoSemana, EstadoCliente, Prestamo } from "../types";

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
  const current = await supabase
    .from("clientes")
    .select("id,nombre,identidad,telefono,direccion,estado")
    .neq("estado", "cancelado")
    .order("nombre");
  if (!current.error) return (current.data ?? []) as ClienteResumen[];
  const missingStatus = current.error.code === "PGRST204" || current.error.code === "42703" || current.error.message.includes("estado");
  if (!missingStatus) throw current.error;
  const legacy = await supabase.from("clientes").select("id,nombre,identidad,telefono,direccion").order("nombre");
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as ClienteResumen[];
}

export async function listLoans(): Promise<PrestamoConCliente[]> {
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
}

export async function getLoanDetail(id: string): Promise<PrestamoDetalle> {
  const [loanResult, installmentsResult] = await Promise.all([
    supabase.from("prestamos").select("*,clientes(id,nombre,identidad,telefono,direccion)").eq("id", id).single(),
    supabase.from("cuotas").select("*").eq("prestamo_id", id).order("numero"),
  ]);
  if (loanResult.error) throw loanResult.error;
  if (installmentsResult.error) throw installmentsResult.error;
  return {
    ...normalizeLoan(loanResult.data as RawLoanWithCustomer),
    cuotas: ((installmentsResult.data ?? []) as Cuota[]).map(normalizeInstallment),
  };
}

function isMissingCreateLoanRpc(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

export async function createFixedLoan(
  input: CreateFixedLoanInput
): Promise<{ id: string; calculation: FixedLoanCalculation }> {
  const calculation = calculateFixedLoan(input);
  const { data, error } = await supabase.rpc("crear_prestamo_con_cuotas", {
    p_solicitud_id: input.solicitudId,
    p_cliente_id: input.clienteId,
    p_monto: calculation.capital,
    p_tasa_interes: calculation.tasaInteres,
    p_plazo: input.plazo,
    p_frecuencia: input.frecuencia,
    p_fecha_inicio: input.fechaInicio,
    p_dia_pago_semana: input.frecuencia === "semanal" ? input.diaPagoSemana ?? null : null,
  });

  if (!error && typeof data === "string") return { id: data, calculation };
  if (error && isMissingCreateLoanRpc(error)) {
    throw new Error("Falta aplicar la actualización de planes comerciales en Supabase.");
  }
  if (error) throw error;
  throw new Error("Supabase devolvió una respuesta inesperada. No se reintentó para evitar duplicados.");
}
