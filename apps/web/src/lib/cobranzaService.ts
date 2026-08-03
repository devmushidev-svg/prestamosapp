import { formatLoanNumber, formatMoney, hondurasTodayRange } from "./format";
import { listCustomers } from "./customerService";
import { listLoans, type PrestamoConCliente } from "./loanService";
import { moneyToCents, withInstallmentBalances, type CuotaConSaldo } from "./paymentAllocator";
import { refreshPortfolioStatuses, registerPayment } from "./paymentService";
import { supabase } from "./supabase";
import type { Cliente, Cuota, Gestion, ResultadoGestion } from "../types";

export type PrestamoRuta = {
  prestamo: PrestamoConCliente;
  cuotas: CuotaConSaldo[];
  atrasado: number;
  cuotaCorriente: number;
  cuotasVencidas: number;
  diasAtraso: number;
  pagosRealizados: number;
  proximaFecha: string | null;
};

export type ClienteRuta = {
  cliente: Cliente;
  prestamos: PrestamoRuta[];
  saldoTotal: number;
  atrasado: number;
  /** Mora monetaria: siempre 0 en el MVP; el desglose ya la muestra para activarla después. */
  moratorios: number;
  cuotaCorriente: number;
  pagoRequerido: number;
  pagoSugerido: number;
  cuotasVencidas: number;
  diasAtraso: number;
  visitadoHoy: boolean;
  promesa: { monto: number; fecha: string } | null;
};

export type RutaCobro = {
  clientes: ClienteRuta[];
  /** true cuando la tabla `gestiones` aún no existe en Supabase. */
  migracionPendiente: boolean;
};

export type HistorialCobranzaItem = {
  id: string;
  tipo: "pago" | "gestion";
  fecha: string;
  titulo: string;
  detalle: string | null;
  monto: number | null;
  pagoId: string | null;
};

function isMissingCobranzaMigration(error: { code?: string }) {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(error.code ?? "");
}

function normalizeGestion(row: Gestion): Gestion {
  return {
    ...row,
    monto_prometido: row.monto_prometido == null ? null : Number(row.monto_prometido),
  };
}

/** Días entre una fecha civil YYYY-MM-DD y hoy (Honduras); ambas se parsean como UTC puro. */
function daysUntilToday(fecha: string, hoy: string): number {
  return Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86_400_000);
}

function buildPrestamoRuta(prestamo: PrestamoConCliente, cuotasCrudas: Cuota[], hoy: string): PrestamoRuta {
  const cuotas = withInstallmentBalances(cuotasCrudas);
  let atrasadoCents = 0;
  let cuotaCorrienteCents = 0;
  let cuotasVencidas = 0;
  let diasAtraso = 0;
  let pendientes = 0;
  let proximaFecha: string | null = null;
  for (const cuota of cuotas) {
    const pendienteCents = moneyToCents(cuota.pendiente);
    if (pendienteCents <= 0) continue;
    pendientes += 1;
    if (proximaFecha === null || cuota.fecha_vencimiento < proximaFecha) {
      proximaFecha = cuota.fecha_vencimiento;
    }
    if (cuota.fecha_vencimiento < hoy) {
      atrasadoCents += pendienteCents;
      cuotasVencidas += 1;
      diasAtraso = Math.max(diasAtraso, daysUntilToday(cuota.fecha_vencimiento, hoy));
    } else if (cuota.fecha_vencimiento === hoy) {
      // Solo la cuota que vence hoy pertenece a la ruta operativa del día.
      // Las futuras siguen visibles en Agenda y en el detalle del préstamo.
      cuotaCorrienteCents += pendienteCents;
    }
  }
  return {
    prestamo,
    cuotas,
    atrasado: atrasadoCents / 100,
    cuotaCorriente: cuotaCorrienteCents / 100,
    cuotasVencidas,
    diasAtraso,
    pagosRealizados: Math.max(0, prestamo.plazo - pendientes),
    proximaFecha,
  };
}

function buildClienteRuta(
  cliente: Cliente,
  prestamos: PrestamoRuta[],
  hoy: string,
  visitadoHoy: boolean,
  promesa: { monto: number; fecha: string } | null
): ClienteRuta {
  const saldoTotalCents = prestamos.reduce((s, p) => s + moneyToCents(p.prestamo.saldo), 0);
  const atrasadoCents = prestamos.reduce((s, p) => s + moneyToCents(p.atrasado), 0);
  const cuotaCorrienteCents = prestamos.reduce((s, p) => s + moneyToCents(p.cuotaCorriente), 0);
  const moratoriosCents = 0;
  const cuotasVencidas = prestamos.reduce((s, p) => s + p.cuotasVencidas, 0);
  const diasAtraso = prestamos.reduce((maximo, item) => Math.max(maximo, item.diasAtraso), 0);
  const sugeridoCalendarioCents = atrasadoCents + moratoriosCents + cuotaCorrienteCents;
  const promesaHoyCents = promesa?.fecha === hoy ? Math.max(0, moneyToCents(promesa.monto)) : 0;
  return {
    cliente,
    prestamos,
    saldoTotal: saldoTotalCents / 100,
    atrasado: atrasadoCents / 100,
    moratorios: moratoriosCents / 100,
    cuotaCorriente: cuotaCorrienteCents / 100,
    // min(): tope de seguridad para cuando existan moratorios; hoy nunca recorta.
    pagoRequerido: Math.min(atrasadoCents + moratoriosCents, saldoTotalCents) / 100,
    // Una promesa que vence hoy funciona como sugerencia operativa, pero nunca
    // reduce lo vencido ni permite cobrar más que el saldo real.
    pagoSugerido: Math.min(Math.max(sugeridoCalendarioCents, promesaHoyCents), saldoTotalCents) / 100,
    cuotasVencidas,
    diasAtraso,
    visitadoHoy,
    promesa,
  };
}

export async function getRutaCobro(): Promise<RutaCobro> {
  await refreshPortfolioStatuses();
  const { fecha: hoy, inicioIso } = hondurasTodayRange();

  const [clientes, prestamos, cuotasResult, gestionesHoyResult, promesasResult, pagosHoyResult] =
    await Promise.all([
      listCustomers(),
      listLoans(),
      supabase.from("cuotas").select("*").neq("estado", "pagada"),
      supabase.from("gestiones").select("*").gte("fecha", inicioIso),
      supabase
        .from("gestiones")
        .select("*")
        .eq("resultado", "promesa_pago")
        .gte("fecha_promesa", hoy)
        .order("fecha", { ascending: false }),
      supabase.from("pagos").select("id,prestamo_id,fecha").gte("fecha", inicioIso),
    ]);

  if (cuotasResult.error) throw cuotasResult.error;
  if (pagosHoyResult.error) throw pagosHoyResult.error;
  let migracionPendiente = false;
  for (const result of [gestionesHoyResult, promesasResult]) {
    if (result.error && !isMissingCobranzaMigration(result.error)) throw result.error;
    if (result.error) migracionPendiente = true;
  }
  const gestionesHoy = migracionPendiente
    ? []
    : ((gestionesHoyResult.data ?? []) as Gestion[]).map(normalizeGestion);
  const promesas = migracionPendiente
    ? []
    : ((promesasResult.data ?? []) as Gestion[]).map(normalizeGestion);

  const cuotasPorPrestamo = new Map<string, Cuota[]>();
  for (const row of (cuotasResult.data ?? []) as Cuota[]) {
    const cuota: Cuota = {
      ...row,
      numero: Number(row.numero),
      monto: Number(row.monto),
      monto_pagado: Number(row.monto_pagado ?? 0),
    };
    const grupo = cuotasPorPrestamo.get(cuota.prestamo_id);
    if (grupo) grupo.push(cuota);
    else cuotasPorPrestamo.set(cuota.prestamo_id, [cuota]);
  }

  const prestamosVivos = prestamos.filter(
    (loan) => loan.saldo > 0 && loan.estado !== "pagado" && loan.estado !== "cancelado"
  );
  const prestamosPorCliente = new Map<string, PrestamoRuta[]>();
  for (const loan of prestamosVivos) {
    const item = buildPrestamoRuta(loan, cuotasPorPrestamo.get(loan.id) ?? [], hoy);
    const grupo = prestamosPorCliente.get(loan.cliente_id);
    if (grupo) grupo.push(item);
    else prestamosPorCliente.set(loan.cliente_id, [item]);
  }

  const clientesVisitados = new Set<string>(gestionesHoy.map((gestion) => gestion.cliente_id));
  const prestamoACliente = new Map(prestamos.map((loan) => [loan.id, loan.cliente_id]));
  for (const pago of (pagosHoyResult.data ?? []) as Array<{ id: string; prestamo_id: string }>) {
    const clienteId = prestamoACliente.get(pago.prestamo_id);
    if (clienteId) clientesVisitados.add(clienteId);
  }

  // La más reciente por cliente gana (vienen ordenadas por fecha desc).
  const promesaPorCliente = new Map<string, { monto: number; fecha: string }>();
  for (const gestion of promesas) {
    if (promesaPorCliente.has(gestion.cliente_id)) continue;
    if (gestion.monto_prometido == null || !gestion.fecha_promesa) continue;
    promesaPorCliente.set(gestion.cliente_id, { monto: gestion.monto_prometido, fecha: gestion.fecha_promesa });
  }

  const ruta: ClienteRuta[] = [];
  for (const cliente of clientes) {
    const prestamosCliente = prestamosPorCliente.get(cliente.id);
    if (!prestamosCliente?.length) continue;
    const item = buildClienteRuta(
      cliente,
      prestamosCliente,
      hoy,
      clientesVisitados.has(cliente.id),
      promesaPorCliente.get(cliente.id) ?? null
    );
    // La ruta del día contiene cobros vencidos o que vencen hoy. Quienes ya
    // fueron visitados permanecen visibles hasta que termine la jornada.
    if (item.pagoSugerido > 0 || item.visitadoHoy || item.promesa?.fecha === hoy) {
      ruta.push(item);
    }
  }
  return { clientes: ruta, migracionPendiente };
}

export async function getClienteRuta(clienteId: string): Promise<ClienteRuta | null> {
  // ponytail: reusa getRutaCobro; con <500 clientes no amerita una query dedicada.
  const { clientes } = await getRutaCobro();
  return clientes.find((item) => item.cliente.id === clienteId) ?? null;
}

const RESULTADO_GESTION_LABELS: Record<Exclude<ResultadoGestion, "pago">, string> = {
  no_estaba: "Cliente no estaba",
  promesa_pago: "Promesa de pago",
  se_nego: "Se negó a pagar",
  otro: "Otra gestión",
};

export async function getHistorialCobranza(
  clienteId: string,
  prestamoIds: string[]
): Promise<HistorialCobranzaItem[]> {
  const gestionesPromise = supabase
    .from("gestiones")
    .select("id,fecha,resultado,monto_prometido,fecha_promesa,notas")
    .eq("cliente_id", clienteId)
    .neq("resultado", "pago")
    .order("fecha", { ascending: false })
    .limit(30);
  const pagosPromise = prestamoIds.length
    ? supabase
        .from("pagos")
        .select("id,fecha,monto")
        .in("prestamo_id", prestamoIds)
        .order("fecha", { ascending: false })
        .limit(30)
    : Promise.resolve({ data: [], error: null });
  const [gestionesResult, pagosResult] = await Promise.all([gestionesPromise, pagosPromise]);
  if (gestionesResult.error && !isMissingCobranzaMigration(gestionesResult.error)) {
    throw gestionesResult.error;
  }
  if (pagosResult.error) throw pagosResult.error;

  const gestiones: HistorialCobranzaItem[] = (gestionesResult.data ?? []).map((row) => {
    const resultado = row.resultado as Exclude<ResultadoGestion, "pago">;
    const monto = row.monto_prometido == null ? null : Number(row.monto_prometido);
    const promesa = resultado === "promesa_pago" && row.fecha_promesa
      ? `${monto == null ? "" : `${formatMoney("L", monto)} · `}${row.fecha_promesa}`
      : null;
    return {
      id: `gestion-${row.id}`,
      tipo: "gestion",
      fecha: row.fecha,
      titulo: RESULTADO_GESTION_LABELS[resultado] ?? "Gestión registrada",
      detalle: row.notas?.trim() || promesa,
      monto,
      pagoId: null,
    };
  });
  const pagos: HistorialCobranzaItem[] = (pagosResult.data ?? []).map((row) => ({
    id: `pago-${row.id}`,
    tipo: "pago",
    fecha: row.fecha,
    titulo: "Pago registrado",
    detalle: null,
    monto: Number(row.monto),
    pagoId: row.id,
  }));

  return [...gestiones, ...pagos]
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
    .slice(0, 30);
}

export async function registrarGestion(input: {
  clienteId: string;
  resultado: ResultadoGestion;
  montoPrometido?: number;
  fechaPromesa?: string;
  notas?: string;
  pagoId?: string;
}): Promise<void> {
  const { error } = await supabase.from("gestiones").insert({
    cliente_id: input.clienteId,
    resultado: input.resultado,
    monto_prometido: input.montoPrometido ?? null,
    fecha_promesa: input.fechaPromesa ?? null,
    notas: input.notas?.trim() || null,
    pago_id: input.pagoId ?? null,
  });
  if (error && isMissingCobranzaMigration(error)) {
    throw new Error("Falta aplicar la actualización de cobranza en Supabase.");
  }
  if (error) throw error;
}

export type RepartoCobro = {
  prestamo: PrestamoConCliente;
  monto: number;
};

/**
 * Reparte el monto entre los préstamos del cliente aplicando FIFO global por
 * fecha de vencimiento, igual que hace `registrar_pago` dentro de un préstamo.
 */
export function repartirCobro(cliente: ClienteRuta, monto: number): RepartoCobro[] {
  const pendientes = cliente.prestamos
    .flatMap((item) => item.cuotas.filter((cuota) => cuota.pendiente > 0).map((cuota) => ({ item, cuota })))
    .sort((a, b) =>
      a.cuota.fecha_vencimiento.localeCompare(b.cuota.fecha_vencimiento)
      || a.cuota.numero - b.cuota.numero
      || a.cuota.id.localeCompare(b.cuota.id)
    );

  let restanteCents = Math.max(0, moneyToCents(monto));
  const orden: string[] = [];
  const montos = new Map<string, number>();
  for (const { item, cuota } of pendientes) {
    if (restanteCents <= 0) break;
    const aplicaCents = Math.min(restanteCents, moneyToCents(cuota.pendiente));
    if (aplicaCents <= 0) continue;
    const id = item.prestamo.id;
    if (!montos.has(id)) orden.push(id);
    montos.set(id, (montos.get(id) ?? 0) + aplicaCents);
    restanteCents -= aplicaCents;
  }

  return orden.map((id) => ({
    prestamo: cliente.prestamos.find((item) => item.prestamo.id === id)!.prestamo,
    monto: (montos.get(id) ?? 0) / 100,
  }));
}

/**
 * Cobra a nivel cliente: una llamada a `registrar_pago` por préstamo, del más
 * atrasado al más reciente. Cada préstamo lleva su propia solicitud para que un
 * reintento no duplique lo ya registrado.
 */
export async function cobrarCliente(input: {
  cliente: ClienteRuta;
  monto: number;
  solicitudes: Record<string, string>;
}): Promise<string[]> {
  const reparto = repartirCobro(input.cliente, input.monto);
  if (reparto.length === 0) throw new Error("El monto no se pudo aplicar a ninguna cuota pendiente.");

  const pagoIds: string[] = [];
  for (const parte of reparto) {
    const solicitudId = input.solicitudes[parte.prestamo.id];
    if (!solicitudId) throw new Error("Falta la solicitud del préstamo; vuelva a abrir el cobro.");
    try {
      pagoIds.push(await registerPayment({ solicitudId, prestamoId: parte.prestamo.id, monto: parte.monto }));
    } catch (cause) {
      const detalle = cause instanceof Error ? cause.message : "";
      if (pagoIds.length === 0) throw cause;
      const cobrado = reparto.slice(0, pagoIds.length).reduce((sum, item) => sum + item.monto, 0);
      throw new Error(
        `Se registró ${formatMoney("L", cobrado)} del préstamo ${formatLoanNumber(reparto[0].prestamo.numero, reparto[0].prestamo.id)}, pero falló el resto. Reintente: no se duplicará lo ya cobrado.${detalle ? ` (${detalle})` : ""}`
      );
    }
  }
  return pagoIds;
}

export async function guardarOrdenRuta(items: Array<{ id: string; orden_ruta: number }>): Promise<void> {
  // ponytail: un update por fila; se usa al activar el orden manual (una vez) y al mover (2 filas).
  const results = await Promise.all(
    items.map((item) => supabase.from("clientes").update({ orden_ruta: item.orden_ruta }).eq("id", item.id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
