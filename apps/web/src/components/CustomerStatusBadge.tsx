import type { EstadoCliente } from "../types";

const LABELS: Record<EstadoCliente, string> = {
  activo: "Activo",
  moroso: "Moroso",
  cancelado: "Cancelado",
};

const STYLES: Record<EstadoCliente, string> = {
  activo: "border-pf-success-soft bg-pf-success-soft/60 text-pf-success",
  moroso: "border-pf-danger-soft bg-pf-danger-soft/60 text-pf-danger",
  cancelado: "border-pf-border-soft bg-pf-surface-soft text-pf-muted",
};

export function CustomerStatusBadge({ status }: { status: EstadoCliente }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
