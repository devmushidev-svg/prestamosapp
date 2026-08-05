import { formatLoanNumber, formatMoney, hondurasTodayRange } from "./format";
import { CUSTOMERS_CACHE_KEY, listCustomers } from "./customerService";
import { listAllInstallments, listLoans, type PrestamoConCliente } from "./loanService";
import { moneyToCents, withInstallmentBalances, type CuotaConSaldo } from "./paymentAllocator";
import { listPayments, refreshPortfolioStatuses, registerPayment } from "./paymentService";
import { supabase } from "./supabase";
import type { Cliente, Cuota, Gestion, ResultadoGestion } from "../types";
import {
  isNetworkFailure,
  queueOfflineOperation,
  readThroughCache,
  updateCache,
} from "./offlineDb";

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
  promesa: {
    monto: number;
    montoOriginal: number;
    montoPagado: number;
    fecha: string;
    vencida: boolean;
  } | null;
};

export type RutaCobro = {
  /** Clientes exigibles hoy: vencidos, cuota de hoy, promesa o visita del día. */
  clientes: ClienteRuta[];
  /** Todos los clientes con al menos un préstamo activo y saldo pendiente. */
  cartera: ClienteRuta[];
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

type PagoRutaRow = { id: string; prestamo_id: string; fecha: string; monto: number };
type PromesaGestionRow = Pick<
  Gestion,
  "id" | "cliente_id" | "fecha" | "monto_prometido" | "fecha_promesa" | "creado_en"
>;

export const GESTIONES_CACHE_KEY = "gestiones";
type GestionesSnapshot = { rows: Gestion[]; migracionPendiente: boolean };

export async function downloadAllGestiones(): Promise<GestionesSnapshot> {
    const pageSize = 500;
    const rows: Gestion[] = [];
    for (let from = 0; ; from += pageSize) {
      const result = await supabase
        .from("gestiones")
        .select("*")
        .order("fecha", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);
      if (result.error && isMissingCobranzaMigration(result.error)) {
        return { rows: [], migracionPendiente: true };
      }
      if (result.error) throw result.error;
      const batch = ((result.data ?? []) as Gestion[]).map(normalizeGestion);
      rows.push(...batch);
      if (batch.length < pageSize) return { rows, migracionPendiente: false };
    }
}

export async function listAllGestiones(): Promise<GestionesSnapshot> {
  return readThroughCache(GESTIONES_CACHE_KEY, downloadAllGestiones);
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
  promesa: ClienteRuta["promesa"]
): ClienteRuta {
  const saldoTotalCents = prestamos.reduce((s, p) => s + moneyToCents(p.prestamo.saldo), 0);
  const atrasadoCents = prestamos.reduce((s, p) => s + moneyToCents(p.atrasado), 0);
  const cuotaCorrienteCents = prestamos.reduce((s, p) => s + moneyToCents(p.cuotaCorriente), 0);
  const moratoriosCents = 0;
  const cuotasVencidas = prestamos.reduce((s, p) => s + p.cuotasVencidas, 0);
  const diasAtraso = prestamos.reduce((maximo, item) => Math.max(maximo, item.diasAtraso), 0);
  const sugeridoCalendarioCents = atrasadoCents + moratoriosCents + cuotaCorrienteCents;
  const promesaExigibleCents = promesa?.fecha && promesa.fecha <= hoy
    ? Math.max(0, moneyToCents(promesa.monto))
    : 0;
  return {
    cliente,
    prestamos,
    saldoTotal: saldoTotalCents / 100,
    atrasado: atrasadoCents / 100,
    moratorios: moratoriosCents / 100,
    cuotaCorriente: cuotaCorrienteCents / 100,
    // min(): tope de seguridad para cuando existan moratorios; hoy nunca recorta.
    pagoRequerido: Math.min(atrasadoCents + moratoriosCents, saldoTotalCents) / 100,
    // Una promesa de hoy o vencida funciona como sugerencia operativa, pero
    // nunca reduce lo vencido ni permite cobrar más que el saldo real.
    pagoSugerido: Math.min(Math.max(sugeridoCalendarioCents, promesaExigibleCents), saldoTotalCents) / 100,
    cuotasVencidas,
    diasAtraso,
    visitadoHoy,
    promesa,
  };
}

export async function getRutaCobro(): Promise<RutaCobro> {
  await refreshPortfolioStatuses();
  const { fecha: hoy, inicioIso } = hondurasTodayRange();

  const [clientes, prestamos, cuotas, gestionesSnapshot, pagos] = await Promise.all([
    listCustomers(),
    listLoans(),
    listAllInstallments(),
    listAllGestiones(),
    listPayments(),
  ]);
  const gestionesHoy = gestionesSnapshot.rows.filter((gestion) => gestion.fecha >= inicioIso);
  const promesas = gestionesSnapshot.rows
    .filter((gestion) => gestion.resultado === "promesa_pago")
    .sort((left, right) =>
      right.fecha.localeCompare(left.fecha)
      || right.creado_en.localeCompare(left.creado_en)
      || right.id.localeCompare(left.id)
    ) as PromesaGestionRow[];

  // Primero se conserva solo la promesa más reciente por cliente; una promesa
  // antigua no debe reaparecer si la nueva ya fue cumplida.
  const ultimaPromesaPorCliente = new Map<string, PromesaGestionRow>();
  for (const gestion of promesas) {
    if (!ultimaPromesaPorCliente.has(gestion.cliente_id)) {
      ultimaPromesaPorCliente.set(gestion.cliente_id, gestion);
    }
  }
  const pagosDesde = Array.from(ultimaPromesaPorCliente.values()).reduce(
    (masAntigua, gestion) => gestion.fecha < masAntigua ? gestion.fecha : masAntigua,
    inicioIso,
  );
  const pagosCobranza: PagoRutaRow[] = pagos
    .filter((pago) => pago.fecha >= pagosDesde)
    .map((pago) => ({ id: pago.id, prestamo_id: pago.prestamo_id, fecha: pago.fecha, monto: pago.monto }));

  const cuotasPorPrestamo = new Map<string, Cuota[]>();
  for (const row of cuotas.filter((cuota) => cuota.estado !== "pagada")) {
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
  const pagosPorCliente = new Map<string, PagoRutaRow[]>();
  for (const pago of pagosCobranza) {
    const clienteId = prestamoACliente.get(pago.prestamo_id);
    if (!clienteId) continue;
    if (pago.fecha >= inicioIso) clientesVisitados.add(clienteId);
    const grupo = pagosPorCliente.get(clienteId);
    if (grupo) grupo.push(pago);
    else pagosPorCliente.set(clienteId, [pago]);
  }

  const promesaPorCliente = new Map<string, NonNullable<ClienteRuta["promesa"]>>();
  for (const gestion of ultimaPromesaPorCliente.values()) {
    if (gestion.monto_prometido == null || !gestion.fecha_promesa) continue;
    const montoOriginalCents = moneyToCents(gestion.monto_prometido);
    const montoPagadoCents = (pagosPorCliente.get(gestion.cliente_id) ?? []).reduce(
      (total, pago) => pago.fecha > gestion.fecha ? total + moneyToCents(pago.monto) : total,
      0,
    );
    const montoPendienteCents = Math.max(0, montoOriginalCents - montoPagadoCents);
    if (montoPendienteCents === 0) continue;
    promesaPorCliente.set(gestion.cliente_id, {
      monto: montoPendienteCents / 100,
      montoOriginal: montoOriginalCents / 100,
      montoPagado: Math.min(montoPagadoCents, montoOriginalCents) / 100,
      fecha: gestion.fecha_promesa,
      vencida: gestion.fecha_promesa < hoy,
    });
  }

  const ruta: ClienteRuta[] = [];
  const cartera: ClienteRuta[] = [];
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
    cartera.push(item);
    // La ruta del día contiene cobros vencidos o que vencen hoy. Quienes ya
    // fueron visitados permanecen visibles hasta que termine la jornada.
    if (item.pagoSugerido > 0 || item.visitadoHoy || Boolean(item.promesa && item.promesa.fecha <= hoy)) {
      ruta.push(item);
    }
  }
  return { clientes: ruta, cartera, migracionPendiente: gestionesSnapshot.migracionPendiente };
}

export async function getClienteRuta(clienteId: string): Promise<ClienteRuta | null> {
  // ponytail: reusa getRutaCobro; con <500 clientes no amerita una query dedicada.
  const { cartera } = await getRutaCobro();
  return cartera.find((item) => item.cliente.id === clienteId) ?? null;
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
  const [gestionesSnapshot, allPayments] = await Promise.all([listAllGestiones(), listPayments()]);
  const gestionRows = gestionesSnapshot.rows
    .filter((row) => row.cliente_id === clienteId && row.resultado !== "pago")
    .sort((left, right) => right.fecha.localeCompare(left.fecha))
    .slice(0, 30);
  const paymentRows = allPayments
    .filter((row) => prestamoIds.includes(row.prestamo_id))
    .sort((left, right) => right.fecha.localeCompare(left.fecha))
    .slice(0, 30);

  const gestiones: HistorialCobranzaItem[] = gestionRows.map((row) => {
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
  const pagos: HistorialCobranzaItem[] = paymentRows.map((row) => ({
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
  const capturedAt = new Date().toISOString();
  const row: Gestion = {
    id: crypto.randomUUID(),
    cliente_id: input.clienteId,
    fecha: capturedAt,
    resultado: input.resultado,
    monto_prometido: input.montoPrometido ?? null,
    fecha_promesa: input.fechaPromesa ?? null,
    notas: input.notas?.trim() || null,
    pago_id: input.pagoId ?? null,
    creado_en: capturedAt,
  };
  let error: { code?: string; message: string } | null = null;
  if (!navigator.onLine) {
    error = { message: "Sin conexión" };
  } else {
    try {
      const result = await supabase
        .from("gestiones")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true });
      error = result.error;
    } catch (cause) {
      if (!isNetworkFailure(cause)) throw cause;
      error = { message: cause instanceof Error ? cause.message : "Sin conexión" };
    }
  }
  if (error && isMissingCobranzaMigration(error)) {
    throw new Error("Falta aplicar la actualización de cobranza en Supabase.");
  }
  if (error && !isNetworkFailure(error)) throw error;
  if (error) {
    await queueOfflineOperation({
      type: "gestion.create",
      entityId: row.id,
      payload: { row },
      dependsOn: input.pagoId ? [`payment:${input.pagoId}`] : [],
    });
  }
  await updateCache<GestionesSnapshot>(GESTIONES_CACHE_KEY, (snapshot) => ({
    rows: [row, ...(snapshot?.rows ?? []).filter((item) => item.id !== row.id)],
    migracionPendiente: false,
  }));
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
  if (!items.length) return;
  const saveLocalOrder = async (queue: boolean) => {
    if (queue) {
      await queueOfflineOperation({ type: "route.update", payload: { items }, entityId: "route" });
    }
    const offlineOrder = new Map(items.map((item) => [item.id, item.orden_ruta]));
    await updateCache<Cliente[]>(CUSTOMERS_CACHE_KEY, (customers = []) => customers.map((customer) =>
      offlineOrder.has(customer.id) ? { ...customer, orden_ruta: offlineOrder.get(customer.id)! } : customer
    ));
  };
  if (!navigator.onLine) {
    await saveLocalOrder(true);
    return;
  }

  try {
    const ids = items.map((item) => item.id);
    const previousResult = await supabase.from("clientes").select("id,orden_ruta").in("id", ids);
    if (previousResult.error) throw previousResult.error;
    const previous = new Map((previousResult.data ?? []).map((item) => [item.id, item.orden_ruta]));
    const updated: string[] = [];
    for (const item of items) {
      const result = await supabase.from("clientes").update({ orden_ruta: item.orden_ruta }).eq("id", item.id);
      if (result.error) {
        // Supabase REST no agrupa varios UPDATE en una transacción. Si uno falla,
        // se restauran los ya aplicados para no dejar posiciones duplicadas.
        await Promise.allSettled(updated.map((id) =>
          supabase.from("clientes").update({ orden_ruta: previous.get(id) ?? null }).eq("id", id)
        ));
        throw result.error;
      }
      updated.push(item.id);
    }
  } catch (cause) {
    if (!isNetworkFailure(cause)) throw cause;
    await saveLocalOrder(true);
    return;
  }
  await saveLocalOrder(false);
}
