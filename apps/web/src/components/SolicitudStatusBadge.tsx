import type { EstadoSolicitud } from "../types";

const STATUS: Record<EstadoSolicitud, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-pf-warning-soft text-pf-warning" },
  aprobada: { label: "Aprobada", className: "bg-pf-success-soft text-pf-success" },
  rechazada: { label: "Rechazada", className: "bg-pf-danger-soft text-pf-danger" },
};

export function SolicitudStatusBadge({ estado }: { estado: EstadoSolicitud }) {
  const config = STATUS[estado];
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}
