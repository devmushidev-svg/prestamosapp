import { CalendarDays } from "lucide-react";
import { formatDateOnly, formatMoney } from "../lib/format";
import type { EstadoCuota } from "../types";

export type InstallmentScheduleItem = {
  numero: number;
  fechaVencimiento: string;
  monto: number;
  estado?: EstadoCuota;
};

const STATUS: Record<EstadoCuota, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-pf-warning-soft text-pf-warning" },
  pagada: { label: "Pagada", className: "bg-pf-success-soft text-pf-success" },
  vencida: { label: "Vencida", className: "bg-pf-danger-soft text-pf-danger" },
};

function InstallmentBadge({ status = "pendiente" }: { status?: EstadoCuota }) {
  const config = STATUS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}

export function InstallmentSchedule({ items }: { items: InstallmentScheduleItem[] }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
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
              </div>
              <InstallmentBadge status={item.estado} />
            </div>
            <div className="mt-3 border-t border-pf-border-soft pt-3 text-right">
              <span className="whitespace-nowrap text-lg font-extrabold tabular-nums text-pf-text">
                {formatMoney("L", item.monto)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="max-md:hidden overflow-hidden rounded-xl border border-pf-border-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="pf-table-thead text-left">
              <th className="p-3">N.º</th>
              <th className="p-3">Fecha de vencimiento</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3 text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="pf-table-body">
            {items.map((item) => (
              <tr key={item.numero} className="pf-table-row last:border-b-0">
                <td className="p-3 font-bold text-pf-text">{item.numero}</td>
                <td className="p-3 whitespace-nowrap text-pf-text-secondary">
                  {formatDateOnly(item.fechaVencimiento)}
                </td>
                <td className="p-3 text-right font-bold tabular-nums text-pf-text">
                  {formatMoney("L", item.monto)}
                </td>
                <td className="p-3 text-right">
                  <InstallmentBadge status={item.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
