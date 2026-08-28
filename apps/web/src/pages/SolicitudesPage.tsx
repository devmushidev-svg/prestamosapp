import { CheckCircle2, ClipboardList, TriangleAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHero } from "../components/PageHero";
import { SolicitudStatusBadge } from "../components/SolicitudStatusBadge";
import { Button, Card, EmptyState, Field, Modal, Textarea } from "../components/ui";
import { formatDate, formatDateOnly, formatMoney } from "../lib/format";
import { listCustomers } from "../lib/customerService";
import { listSolicitudesPrestamo, resolverSolicitudPrestamo, type SolicitudConSolicitante } from "../lib/solicitudService";
import type { Cliente, EstadoSolicitud } from "../types";

type FiltroEstado = EstadoSolicitud | "todas";

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "todas", label: "Todas" },
];

export function SolicitudesPage() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<FiltroEstado>("pendiente");
  const [solicitudes, setSolicitudes] = useState<SolicitudConSolicitante[]>([]);
  const [customers, setCustomers] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reviewing, setReviewing] = useState<SolicitudConSolicitante | null>(null);
  const [decision, setDecision] = useState<"aprobada" | "rechazada" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState("");

  const load = useCallback(async (estado: FiltroEstado) => {
    setLoading(true);
    setError("");
    try {
      const [rows, clientes] = await Promise.all([
        listSolicitudesPrestamo(estado === "todas" ? undefined : estado),
        listCustomers(),
      ]);
      setSolicitudes(rows);
      setCustomers(clientes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filtro);
  }, [filtro, load]);

  const customerName = (clienteId: string) => customers.find((customer) => customer.id === clienteId)?.nombre ?? "Cliente";
  const solicitanteName = (solicitud: SolicitudConSolicitante) =>
    solicitud.solicitante ? `${solicitud.solicitante.nombre} ${solicitud.solicitante.apellido ?? ""}`.trim() : "Usuario";

  function openReview(solicitud: SolicitudConSolicitante) {
    setReviewing(solicitud);
    setDecision(null);
    setMotivo("");
    setResolveErr("");
  }

  function closeReview() {
    if (resolving) return;
    setReviewing(null);
    setDecision(null);
  }

  async function confirmDecision() {
    if (!reviewing || !decision || resolving) return;
    setResolving(true);
    setResolveErr("");
    try {
      await resolverSolicitudPrestamo(reviewing.id, decision, motivo);
      setReviewing(null);
      setDecision(null);
      await load(filtro);
    } catch (cause) {
      setResolveErr(cause instanceof Error ? cause.message : "No pudimos procesar la solicitud.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero title="Solicitudes">
        <p className="pf-page-lead">Revise y decida las solicitudes de préstamo enviadas por su equipo.</p>
      </PageHero>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${
              filtro === item.value ? "pf-btn-primary-gradient" : "pf-btn-secondary"
            }`}
            onClick={() => setFiltro(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando solicitudes…</Card>
      ) : error ? (
        <Card><EmptyState title="No se pudieron cargar las solicitudes" description={error} icon={<ClipboardList className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load(filtro)}>Reintentar</Button>} /></Card>
      ) : solicitudes.length === 0 ? (
        <Card><EmptyState title="No hay solicitudes" description="Cuando su equipo solicite préstamos, aparecerán aquí." icon={<ClipboardList className="h-5 w-5" strokeWidth={2} aria-hidden />} /></Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {solicitudes.map((solicitud) => (
              <Card key={solicitud.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-pf-text">{customerName(solicitud.datos.clienteId)}</p>
                    <p className="truncate text-xs text-pf-muted">Solicitado por {solicitanteName(solicitud)}</p>
                  </div>
                  <SolicitudStatusBadge estado={solicitud.estado} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-pf-text">{formatMoney("L", solicitud.datos.monto)}</span>
                  <span className="text-xs text-pf-muted">{formatDate(solicitud.creado_en)}</span>
                </div>
                <Button type="button" variant="secondary" className="w-full" onClick={() => openReview(solicitud)}>Revisar</Button>
              </Card>
            ))}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="pf-table-thead">
                  <tr>
                    <th className="px-4 py-3">Solicitante</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="pf-table-body">
                  {solicitudes.map((solicitud) => (
                    <tr key={solicitud.id} className="pf-table-row">
                      <td className="px-4 py-3 font-bold text-pf-text">{solicitanteName(solicitud)}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{customerName(solicitud.datos.clienteId)}</td>
                      <td className="px-4 py-3 tabular-nums text-pf-text-secondary">{formatMoney("L", solicitud.datos.monto)}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{formatDate(solicitud.creado_en)}</td>
                      <td className="px-4 py-3"><SolicitudStatusBadge estado={solicitud.estado} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" variant="secondary" className="min-h-9 rounded-lg px-3 py-1.5 text-xs" onClick={() => openReview(solicitud)}>
                          Revisar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal open={Boolean(reviewing)} title="Revisar solicitud de préstamo" onClose={closeReview}>
        {reviewing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-extrabold text-pf-text">{customerName(reviewing.datos.clienteId)}</p>
                <p className="text-xs text-pf-muted">Solicitado por {solicitanteName(reviewing)} · {formatDate(reviewing.creado_en)}</p>
              </div>
              <SolicitudStatusBadge estado={reviewing.estado} />
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-pf-surface-soft p-3 text-sm sm:grid-cols-3">
              <div><p className="text-[10px] font-bold uppercase text-pf-muted">Capital</p><p className="font-bold text-pf-text">{formatMoney("L", reviewing.datos.monto)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-pf-muted">Tasa</p><p className="font-bold text-pf-text">{reviewing.datos.tasaInteres}%</p></div>
              <div><p className="text-[10px] font-bold uppercase text-pf-muted">Plazo</p><p className="font-bold text-pf-text">{reviewing.datos.plazo} cuotas</p></div>
              <div><p className="text-[10px] font-bold uppercase text-pf-muted">Frecuencia</p><p className="font-bold capitalize text-pf-text">{reviewing.datos.frecuencia}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-pf-muted">Inicio</p><p className="font-bold text-pf-text">{formatDateOnly(reviewing.datos.fechaInicio)}</p></div>
              {reviewing.datos.diaPagoSemana ? (
                <div><p className="text-[10px] font-bold uppercase text-pf-muted">Día de cobro</p><p className="font-bold text-pf-text">Día {reviewing.datos.diaPagoSemana}</p></div>
              ) : null}
            </div>

            {reviewing.motivo_solicitud ? (
              <div>
                <p className="text-xs font-bold uppercase text-pf-muted">Observaciones del solicitante</p>
                <p className="mt-1 text-sm text-pf-text-secondary">{reviewing.motivo_solicitud}</p>
              </div>
            ) : null}

            {reviewing.estado !== "pendiente" ? (
              <div className="rounded-xl border border-pf-border-soft p-3 text-sm text-pf-text-secondary">
                <p>Esta solicitud ya fue {reviewing.estado === "aprobada" ? "aprobada" : "rechazada"}{reviewing.resuelto_en ? ` el ${formatDate(reviewing.resuelto_en)}` : ""}.</p>
                {reviewing.motivo_resolucion ? <p className="mt-1">Nota: {reviewing.motivo_resolucion}</p> : null}
              </div>
            ) : decision ? (
              <div className="space-y-3 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/30 p-3">
                <div className="flex gap-2 text-sm text-pf-text-secondary">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-pf-warning" strokeWidth={2} aria-hidden />
                  <p>
                    {decision === "aprobada"
                      ? "¿Aprobar solicitud de préstamo? Al aprobar esta solicitud se creará el préstamo correspondiente."
                      : "¿Rechazar solicitud de préstamo? No se creará ningún préstamo."}
                  </p>
                </div>
                <Field label={decision === "aprobada" ? "Nota (opcional)" : "Motivo del rechazo"} htmlFor="solicitud-motivo">
                  <Textarea id="solicitud-motivo" rows={2} value={motivo} onChange={(event) => setMotivo(event.target.value)} />
                </Field>
                {resolveErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{resolveErr}</p> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setDecision(null)} disabled={resolving}>Cancelar</Button>
                  <Button
                    type="button"
                    variant={decision === "aprobada" ? "primary" : "danger"}
                    onClick={() => void confirmDecision()}
                    disabled={resolving}
                  >
                    {resolving ? "Procesando…" : decision === "aprobada" ? "Confirmar aprobación" : "Confirmar rechazo"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="danger" onClick={() => setDecision("rechazada")}>
                  <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Rechazar
                </Button>
                <Button type="button" onClick={() => setDecision("aprobada")}>
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Aprobar
                </Button>
              </div>
            )}

            {reviewing.estado === "aprobada" && reviewing.prestamo_resultante_id ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => navigate(`/prestamos/${reviewing.prestamo_resultante_id}`)}>
                Ver préstamo creado
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
