import { CalendarDays } from "lucide-react";
import { formatDateOnly, formatMoney } from "../lib/format";
import type { EstadoCuota } from "../types";

export type InstallmentScheduleItem = {
  numero: number;
  fechaVencimiento: string;
  monto: number;
  montoPagado?: number;
  estado?: EstadoCuota;
};

const STATUS: Record<EstadoCuota, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-pf-warning-soft text-pf-warning" },
  pagada: { label: "Pagada", className: "bg-pf-success-soft text-pf-success" },
  vencida: { label: "Vencida", className: "bg-pf-danger-soft text-pf-danger" },
};

function InstallmentBadge({ status = "pendiente", partial = false }: { status?: EstadoCuota; partial?: boolean }) {
  if (partial && status === "vencida") {
    return (
      <span className="inline-flex rounded-full bg-pf-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pf-danger">
        Vencida · parcial
      </span>
    );
  }
  if (partial) {
    return (
      <span className="inline-flex rounded-full bg-pf-info-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pf-info">
        Parcial
      </span>
    );
  }
  const config = STATUS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}

export function InstallmentSchedule({ items }: { items: InstallmentScheduleItem[] }) {
  const normalizedItems = items.map((item) => {
    const defaultPaid = item.estado === "pagada" ? item.monto : 0;
    const paid = Math.min(item.monto, Math.max(0, item.montoPagado ?? defaultPaid));
    const pending = Math.max(0, item.monto - paid);
    return { ...item, paid, pending, partial: paid > 0 && pending > 0 };
  });

  return (
    <>
      <div className="space-y-2 md:hidden">
        {normalizedItems.map((item) => (
          <div
            key={item.numero}
            className="rounded-2xl border border-pf-border-soft bg-pf-surface-elevated p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-pf-muted">Cuota {item.numero}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-pf-text-secondary">
                  <CalendarDays className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                  {formatDateOnly(item.fechaVencimiento)}
                </p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-pf-muted">Total {formatMoney("L", item.monto)}</p>
              </div>
              <InstallmentBadge status={item.estado} partial={item.partial} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-pf-border-soft pt-3 text-right">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pagado</p>
                <p className="mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums text-pf-success">{formatMoney("L", item.paid)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pendiente</p>
                <p className="mt-0.5 whitespace-nowrap text-lg font-extrabold tabular-nums text-pf-text">{formatMoney("L", item.pending)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="max-md:hidden max-h-[36rem] overflow-auto rounded-xl border border-pf-border-soft">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[1]">
            <tr className="pf-table-thead text-left">
              <th className="p-3">N.º</th>
              <th className="p-3">Fecha de vencimiento</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3 text-right">Pagado</th>
              <th className="p-3 text-right">Pendiente</th>
              <th className="p-3 text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="pf-table-body">
            {normalizedItems.map((item) => (
              <tr key={item.numero} className="pf-table-row last:border-b-0">
                <td className="p-3 font-bold text-pf-text">{item.numero}</td>
                <td className="p-3 whitespace-nowrap text-pf-text-secondary">
                  {formatDateOnly(item.fechaVencimiento)}
                </td>
                <td className="p-3 text-right font-bold tabular-nums text-pf-text">
                  {formatMoney("L", item.monto)}
                </td>
                <td className="p-3 text-right font-semibold tabular-nums text-pf-success">
                  {formatMoney("L", item.paid)}
                </td>
                <td className="p-3 text-right font-bold tabular-nums text-pf-text">
                  {formatMoney("L", item.pending)}
                </td>
                <td className="p-3 text-right">
                  <InstallmentBadge status={item.estado} partial={item.partial} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
