import type { Cuota, EstadoPrestamo } from "../types";
import { listLoans, type PrestamoConCliente } from "./loanService";
import { listPayments, refreshPortfolioStatuses, type PaymentSummary } from "./paymentService";
import { formatDate, formatLoanNumber, formatPaymentNumber } from "./format";
import { supabase } from "./supabase";

export type PortfolioReportRow = {
  prestamo: PrestamoConCliente;
  totalPactado: number;
  pagado: number;
  pendiente: number;
  vencido: number;
  interesPactado: number;
  interesCobradoEstimado: number;
  proximaCuota: string | null;
};

export type PortfolioReport = {
  desde: string;
  hasta: string;
  rows: PortfolioReportRow[];
  payments: PaymentSummary[];
  totals: {
    capitalPrestado: number;
    porCobrar: number;
    vencido: number;
    cobradoPeriodo: number;
    interesPactado: number;
    interesCobradoEstimado: number;
    activos: number;
    cancelados: number;
    pagados: number;
    morosos: number;
  };
};

function normalizeInstallment(row: Cuota): Cuota {
  const amount = Number(row.monto);
  return {
    ...row,
    numero: Number(row.numero),
    monto: amount,
    monto_pagado: Number(row.monto_pagado ?? (row.estado === "pagada" ? amount : 0)),
  };
}

function hondurasBoundary(date: string) {
  return new Date(`${date}T00:00:00-06:00`).getTime();
}

export async function getPortfolioReport(desde: string, hasta: string): Promise<PortfolioReport> {
  await refreshPortfolioStatuses();
  const [loans, installmentResult, allPayments] = await Promise.all([
    listLoans(),
    supabase.from("cuotas").select("*").order("fecha_vencimiento"),
    listPayments(),
  ]);
  if (installmentResult.error) throw installmentResult.error;

  const installments = ((installmentResult.data ?? []) as Cuota[]).map(normalizeInstallment);
  const legacyPaidByInstallment = new Map<string, number>();
  for (const payment of allPayments) {
    if (!payment.cuota_id) continue;
    legacyPaidByInstallment.set(
      payment.cuota_id,
      (legacyPaidByInstallment.get(payment.cuota_id) ?? 0) + payment.monto
    );
  }
  const installmentMap = new Map<string, Cuota[]>();
  for (const installment of installments) {
    const current = installmentMap.get(installment.prestamo_id) ?? [];
    current.push(installment);
    installmentMap.set(installment.prestamo_id, current);
  }

  const rows = loans.map((prestamo): PortfolioReportRow => {
    const loanInstallments = installmentMap.get(prestamo.id) ?? [];
    const totalPactado = loanInstallments.reduce((sum, installment) => sum + installment.monto, 0);
    const pendiente = Number(prestamo.saldo);
    const pagado = Math.max(0, totalPactado - pendiente);
    const pendingFor = (installment: Cuota) => Math.max(
      0,
      installment.monto - Math.min(
        installment.monto,
        Math.max(installment.monto_pagado, legacyPaidByInstallment.get(installment.id) ?? 0)
      )
    );
    const vencido = loanInstallments
      .filter((installment) => installment.estado === "vencida")
      .reduce((sum, installment) => sum + pendingFor(installment), 0);
    const interesPactado = Math.max(0, totalPactado - Number(prestamo.monto));
    const interesCobradoEstimado = totalPactado > 0
      ? Math.min(interesPactado, interesPactado * (pagado / totalPactado))
      : 0;
    const proximaCuota = loanInstallments.find((installment) => pendingFor(installment) > 0)?.fecha_vencimiento ?? null;
    return {
      prestamo,
      totalPactado,
      pagado,
      pendiente,
      vencido,
      interesPactado,
      interesCobradoEstimado,
      proximaCuota,
    };
  });

  const start = hondurasBoundary(desde);
  const endExclusive = hondurasBoundary(hasta) + 24 * 60 * 60 * 1000;
  const payments = allPayments.filter((payment) => {
    const timestamp = new Date(payment.fecha).getTime();
    return timestamp >= start && timestamp < endExclusive;
  });
  const activeRows = rows.filter((row) => row.prestamo.estado !== "cancelado");
  const statusCount = (status: EstadoPrestamo) => rows.filter((row) => row.prestamo.estado === status).length;

  return {
    desde,
    hasta,
    rows,
    payments,
    totals: {
      capitalPrestado: activeRows.reduce((sum, row) => sum + row.prestamo.monto, 0),
      porCobrar: activeRows.reduce((sum, row) => sum + row.pendiente, 0),
      vencido: activeRows.reduce((sum, row) => sum + row.vencido, 0),
      cobradoPeriodo: payments.reduce((sum, payment) => sum + payment.monto, 0),
      interesPactado: activeRows.reduce((sum, row) => sum + row.interesPactado, 0),
      interesCobradoEstimado: activeRows.reduce((sum, row) => sum + row.interesCobradoEstimado, 0),
      activos: rows.filter((row) => ["activo", "al_dia", "en_mora"].includes(row.prestamo.estado)).length,
      cancelados: statusCount("cancelado"),
      pagados: statusCount("pagado"),
      morosos: statusCount("en_mora"),
    },
  };
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadPortfolioCsv(report: PortfolioReport) {
  const lines: Array<Array<string | number | null>> = [
    ["REPORTE DE CARTERA", `${report.desde} al ${report.hasta}`],
    [],
    ["Préstamo", "Cliente", "Estado", "Capital", "Total pactado", "Pagado", "Pendiente", "Vencido", "Interés pactado", "Interés cobrado estimado", "Próxima cuota"],
    ...report.rows.map((row) => [
      formatLoanNumber(row.prestamo.numero, row.prestamo.id),
      row.prestamo.cliente?.nombre ?? "Cliente no disponible",
      row.prestamo.estado,
      row.prestamo.monto.toFixed(2),
      row.totalPactado.toFixed(2),
      row.pagado.toFixed(2),
      row.pendiente.toFixed(2),
      row.vencido.toFixed(2),
      row.interesPactado.toFixed(2),
      row.interesCobradoEstimado.toFixed(2),
      row.proximaCuota,
    ]),
    [],
    ["PAGOS DEL PERÍODO"],
    ["Recibo", "Fecha", "Cliente", "Préstamo", "Monto", "Saldo posterior"],
    ...report.payments.map((payment) => [
      formatPaymentNumber(payment.numero_recibo, payment.recibo),
      formatDate(payment.fecha),
      payment.prestamo?.cliente?.nombre ?? "Cliente no disponible",
      payment.prestamo ? formatLoanNumber(payment.prestamo.numero, payment.prestamo.id) : "",
      payment.monto.toFixed(2),
      payment.saldo_posterior?.toFixed(2) ?? "",
    ]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cartera-${report.desde}-a-${report.hasta}.csv`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
