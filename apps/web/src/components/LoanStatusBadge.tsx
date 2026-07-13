import type { EstadoPrestamo } from "../types";

const STATUS: Record<EstadoPrestamo, { label: string; className: string }> = {
  activo: { label: "Activo", className: "bg-pf-info-soft text-pf-info" },
  al_dia: { label: "Al día", className: "bg-pf-success-soft text-pf-success" },
  en_mora: { label: "En mora", className: "bg-pf-danger-soft text-pf-danger" },
  pagado: { label: "Pagado", className: "bg-pf-success-soft text-pf-success" },
  cancelado: { label: "Cancelado", className: "bg-pf-surface-muted text-pf-muted" },
};

export function LoanStatusBadge({ status }: { status: EstadoPrestamo }) {
  const config = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}
