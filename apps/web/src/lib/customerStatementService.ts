import type {
  Cliente,
  ConfiguracionPrestamista,
  Cuota,
  Pago,
  Prestamo,
} from "../types";
import { listCustomers } from "./customerService";
import { formatDate, formatDateOnly, formatLoanNumber, formatMoney, formatPaymentNumber } from "./format";
import { formatLoanPlan } from "./loanCalculator";
import { listAllInstallments, listLoans } from "./loanService";
import { listPayments } from "./paymentService";

export type CustomerStatementLoan = Prestamo & {
  cuotas: Cuota[];
  pagos: Pago[];
  totalPactado: number;
  pagado: number;
  pendiente: number;
  vencido: number;
  proximaCuota: Cuota | null;
};

export type CustomerStatementPayment = Pago & {
  prestamoId: string;
  numeroPrestamo: string;
};

export type CustomerStatement = {
  cliente: Cliente;
  prestamos: CustomerStatementLoan[];
  pagos: CustomerStatementPayment[];
  generadoEn: string;
  totals: {
    capitalOtorgado: number;
    totalPactado: number;
    pagado: number;
    pendiente: number;
    vencido: number;
    prestamosVigentes: number;
  };
};

type RawStatementLoan = Prestamo & {
  cuotas: Cuota[] | null;
  pagos: Pago[] | null;
};

function normalizeInstallment(row: Cuota): Cuota {
  const amount = Number(row.monto);
  return {
    id: row.id,
    prestamo_id: row.prestamo_id,
    numero: Number(row.numero),
    fecha_vencimiento: row.fecha_vencimiento,
    monto: amount,
    monto_pagado: Number(row.monto_pagado ?? (row.estado === "pagada" ? amount : 0)),
    estado: row.estado,
  };
}

function normalizePayment(row: Pago): Pago {
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

function hondurasToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pendingFor(installment: Cuota) {
  return Math.max(0, installment.monto - Math.min(installment.monto, installment.monto_pagado));
}

function normalizeLoan(row: RawStatementLoan, today: string): CustomerStatementLoan {
  const cuotas = (row.cuotas ?? [])
    .map(normalizeInstallment)
    .sort((left, right) => left.numero - right.numero);
  const pagos = (row.pagos ?? [])
    .map(normalizePayment)
    .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());
  const capital = Number(row.monto);
  const saldo = Number(row.saldo);
  const installmentTotal = cuotas.reduce((total, installment) => total + installment.monto, 0);
  const calculatedTotal = capital * (1 + Number(row.tasa_interes) / 100);
  const totalPactado = installmentTotal > 0 ? installmentTotal : Math.max(saldo, calculatedTotal);
  const pagado = Math.min(totalPactado, Math.max(0, totalPactado - saldo));
  const pendingInstallments = cuotas.filter((installment) => pendingFor(installment) > 0.005);
  const vencido = pendingInstallments
    .filter((installment) => installment.fecha_vencimiento < today)
    .reduce((total, installment) => total + pendingFor(installment), 0);

  return {
    id: row.id,
    numero: row.numero == null ? null : Number(row.numero),
    cliente_id: row.cliente_id,
    monto: capital,
    tasa_interes: Number(row.tasa_interes),
    plazo: Number(row.plazo),
    frecuencia: row.frecuencia,
    fecha_inicio: row.fecha_inicio,
    fecha_primer_pago: row.fecha_primer_pago ?? null,
    dia_pago_semana: row.dia_pago_semana == null ? null : Number(row.dia_pago_semana) as Prestamo["dia_pago_semana"],
    tasa_mora: Number(row.tasa_mora ?? 0),
    saldo,
    estado: row.estado,
    solicitud_id: row.solicitud_id ?? null,
    creado_en: row.creado_en,
    cuotas,
    pagos,
    totalPactado,
    pagado,
    pendiente: saldo,
    vencido,
    proximaCuota: pendingInstallments[0] ?? null,
  };
}

export async function getCustomerStatement(clienteId: string): Promise<CustomerStatement> {
  if (!clienteId.trim()) throw new Error("El cliente no es válido.");
  const [customers, allLoans, allInstallments, allPayments] = await Promise.all([
    listCustomers(),
    listLoans(),
    listAllInstallments() as Promise<Cuota[]>,
    listPayments(),
  ]);
  const cliente = customers.find((customer) => customer.id === clienteId);
  if (!cliente) throw new Error("El cliente no existe.");

  const installmentsByLoan = new Map<string, Cuota[]>();
  for (const installment of allInstallments) {
    const current = installmentsByLoan.get(installment.prestamo_id) ?? [];
    current.push(installment);
    installmentsByLoan.set(installment.prestamo_id, current);
  }
  const paymentsByLoan = new Map<string, Pago[]>();
  for (const payment of allPayments) {
    const current = paymentsByLoan.get(payment.prestamo_id) ?? [];
    current.push(payment);
    paymentsByLoan.set(payment.prestamo_id, current);
  }

  const today = hondurasToday();
  const prestamos = allLoans
    .filter((loan) => loan.cliente_id === clienteId)
    .map((loan) => normalizeLoan({
      ...loan,
      cuotas: installmentsByLoan.get(loan.id) ?? [],
      pagos: paymentsByLoan.get(loan.id) ?? [],
    }, today));
  const vigentes = prestamos.filter((loan) => loan.estado !== "cancelado");
  const pagos = prestamos
    .flatMap((loan) => loan.pagos.map((payment): CustomerStatementPayment => ({
      ...payment,
      prestamoId: loan.id,
      numeroPrestamo: formatLoanNumber(loan.numero, loan.id),
    })))
    .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());

  return {
    cliente,
    prestamos,
    pagos,
    generadoEn: new Date().toISOString(),
    totals: {
      capitalOtorgado: vigentes.reduce((total, loan) => total + loan.monto, 0),
      totalPactado: vigentes.reduce((total, loan) => total + loan.totalPactado, 0),
      pagado: vigentes.reduce((total, loan) => total + loan.pagado, 0),
      pendiente: vigentes.reduce((total, loan) => total + loan.pendiente, 0),
      vencido: vigentes.reduce((total, loan) => total + loan.vencido, 0),
      prestamosVigentes: vigentes.filter((loan) => loan.saldo > 0 && loan.estado !== "pagado").length,
    },
  };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const LOAN_STATUS_LABELS: Record<Prestamo["estado"], string> = {
  activo: "Activo",
  al_dia: "Al día",
  en_mora: "En mora",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

function statementHtml(statement: CustomerStatement, business: ConfiguracionPrestamista | null) {
  const businessName = business?.nombre_negocio || "MultiPréstamos";
  const loans = statement.prestamos.map((loan) => `
    <tr>
      <td><strong>${escapeHtml(formatLoanNumber(loan.numero, loan.id))}</strong><br><span>${escapeHtml(formatDateOnly(loan.fecha_inicio))}</span></td>
      <td>${escapeHtml(formatLoanPlan(loan.frecuencia, loan.plazo))}</td>
      <td>${escapeHtml(LOAN_STATUS_LABELS[loan.estado])}</td>
      <td class="number">${escapeHtml(formatMoney("L", loan.monto))}</td>
      <td class="number">${escapeHtml(formatMoney("L", loan.pagado))}</td>
      <td class="number">${escapeHtml(formatMoney("L", loan.pendiente))}</td>
      <td class="number danger">${escapeHtml(formatMoney("L", loan.vencido))}</td>
      <td>${loan.proximaCuota ? escapeHtml(formatDateOnly(loan.proximaCuota.fecha_vencimiento)) : "—"}</td>
    </tr>`).join("");
  const payments = statement.pagos.map((payment) => `
    <tr>
      <td>${escapeHtml(formatPaymentNumber(payment.numero_recibo, payment.recibo))}</td>
      <td>${escapeHtml(formatDate(payment.fecha))}</td>
      <td>${escapeHtml(payment.numeroPrestamo)}</td>
      <td class="number">${escapeHtml(formatMoney("L", payment.monto))}</td>
      <td class="number">${payment.saldo_posterior == null ? "—" : escapeHtml(formatMoney("L", payment.saldo_posterior))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta - ${escapeHtml(statement.cliente.nombre)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.4; }
  h1, h2, p { margin: 0; }
  header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 12px; border-bottom: 2px solid #f97316; }
  .business { font-size: 18px; font-weight: 900; color: #111827; }
  .muted { color: #667085; }
  .title { text-align: right; }
  .title h1 { font-size: 17px; letter-spacing: .04em; text-transform: uppercase; }
  .client { margin-top: 14px; padding: 12px; border: 1px solid #dbe3ef; border-radius: 10px; background: #f8fafc; }
  .client h2 { margin-bottom: 5px; font-size: 15px; }
  .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
  .metric { padding: 9px; border: 1px solid #dbe3ef; border-radius: 9px; }
  .metric span { display: block; color: #667085; font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
  .metric strong { display: block; margin-top: 3px; font-size: 13px; }
  section { margin-top: 14px; }
  section h2 { margin-bottom: 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eef3f9; color: #344054; font-size: 8px; text-align: left; text-transform: uppercase; }
  th, td { padding: 6px; border: 1px solid #dbe3ef; vertical-align: top; }
  td span { color: #667085; font-size: 8px; }
  .number { white-space: nowrap; text-align: right; }
  .danger { color: #b42318; font-weight: 700; }
  .empty { padding: 16px; border: 1px solid #dbe3ef; color: #667085; text-align: center; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #dbe3ef; color: #667085; font-size: 8px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
</style></head><body>
  <header>
    <div>
      <p class="business">${escapeHtml(businessName)}</p>
      ${business?.nombre_propietario ? `<p>${escapeHtml(business.nombre_propietario)}</p>` : ""}
      ${business?.rtn ? `<p class="muted">RTN ${escapeHtml(business.rtn)}</p>` : ""}
      ${business?.telefono ? `<p class="muted">Tel. ${escapeHtml(business.telefono)}</p>` : ""}
      ${business?.direccion ? `<p class="muted">${escapeHtml(business.direccion)}</p>` : ""}
    </div>
    <div class="title"><h1>Estado de cuenta</h1><p class="muted">Emitido: ${escapeHtml(formatDate(statement.generadoEn))}</p></div>
  </header>
  <div class="client">
    <h2>${escapeHtml(statement.cliente.nombre)}</h2>
    <div class="client-grid">
      <p><strong>DNI:</strong> ${escapeHtml(statement.cliente.identidad || "No registrado")}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(statement.cliente.telefono || "No registrado")}</p>
      <p><strong>Dirección:</strong> ${escapeHtml(statement.cliente.direccion || "No registrada")}</p>
      <p><strong>Trabajo:</strong> ${escapeHtml(statement.cliente.lugar_trabajo || "No registrado")}</p>
    </div>
  </div>
  <div class="metrics">
    <div class="metric"><span>Capital otorgado</span><strong>${escapeHtml(formatMoney("L", statement.totals.capitalOtorgado))}</strong></div>
    <div class="metric"><span>Pagado</span><strong>${escapeHtml(formatMoney("L", statement.totals.pagado))}</strong></div>
    <div class="metric"><span>Saldo pendiente</span><strong>${escapeHtml(formatMoney("L", statement.totals.pendiente))}</strong></div>
    <div class="metric"><span>Vencido</span><strong class="danger">${escapeHtml(formatMoney("L", statement.totals.vencido))}</strong></div>
  </div>
  <section><h2>Préstamos (${statement.prestamos.length})</h2>
    ${loans ? `<table><thead><tr><th>Préstamo</th><th>Plan</th><th>Estado</th><th class="number">Capital</th><th class="number">Pagado</th><th class="number">Saldo</th><th class="number">Vencido</th><th>Próxima cuota</th></tr></thead><tbody>${loans}</tbody></table>` : `<p class="empty">Este cliente todavía no tiene préstamos.</p>`}
  </section>
  <section><h2>Historial de pagos (${statement.pagos.length})</h2>
    ${payments ? `<table><thead><tr><th>Recibo</th><th>Fecha</th><th>Préstamo</th><th class="number">Pago</th><th class="number">Saldo posterior</th></tr></thead><tbody>${payments}</tbody></table>` : `<p class="empty">Todavía no hay pagos registrados.</p>`}
  </section>
  <footer>Documento informativo generado por ${escapeHtml(businessName)}. El saldo refleja los movimientos registrados en el sistema al momento de emisión.</footer>
</body></html>`;
}

export function emitirEstadoCuenta(
  statement: CustomerStatement,
  business: ConfiguracionPrestamista | null
): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", `Estado de cuenta de ${statement.cliente.nombre}`);
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(failsafe);
    iframe.remove();
  };
  const failsafe = window.setTimeout(cleanup, 120_000);
  iframe.addEventListener("load", () => {
    const target = iframe.contentWindow;
    if (!target) {
      cleanup();
      return;
    }
    target.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      target.focus();
      target.print();
    }, 100);
  }, { once: true });
  iframe.srcdoc = statementHtml(statement, business);
  document.body.appendChild(iframe);
}
