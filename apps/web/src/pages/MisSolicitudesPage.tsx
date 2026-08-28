import { CalendarClock, FileClock, Percent, SendHorizonal, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHero } from "../components/PageHero";
import { SolicitudStatusBadge } from "../components/SolicitudStatusBadge";
import { Button, Card, EmptyState } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { listCustomersForLoan, type ClienteResumen } from "../lib/loanService";
import { listMisSolicitudesPrestamo } from "../lib/solicitudService";
import type { Solicitud } from "../types";

export function MisSolicitudesPage() {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [customers, setCustomers] = useState<ClienteResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [misSolicitudes, misClientes] = await Promise.all([listMisSolicitudesPrestamo(), listCustomersForLoan()]);
      setSolicitudes(misSolicitudes);
      setCustomers(misClientes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar sus solicitudes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerName = (clienteId: string) => customers.find((customer) => customer.id === clienteId)?.nombre ?? "Cliente";

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero
        title="Mis solicitudes de préstamo"
        actions={
          <Button type="button" onClick={() => navigate("/prestamos/solicitar")}>
            <SendHorizonal className="h-4 w-4" strokeWidth={2} aria-hidden />
            Nueva solicitud
          </Button>
        }
      >
        <p className="pf-page-lead">Aquí puede ver el estado de las solicitudes que ha enviado.</p>
      </PageHero>

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando solicitudes…</Card>
      ) : error ? (
        <Card><EmptyState title="No se pudieron cargar sus solicitudes" description={error} icon={<FileClock className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : solicitudes.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no ha enviado solicitudes"
            description="Cuando solicite un préstamo, su estado aparecerá aquí."
            icon={<FileClock className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={<Button type="button" onClick={() => navigate("/prestamos/solicitar")}><SendHorizonal className="h-4 w-4" strokeWidth={2} aria-hidden />Solicitar préstamo</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {solicitudes.map((solicitud) => (
            <Card key={solicitud.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold text-pf-text">{customerName(solicitud.datos.clienteId)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-pf-muted">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    Enviada el {formatDate(solicitud.creado_en)}
                  </p>
                </div>
                <SolicitudStatusBadge estado={solicitud.estado} />
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-pf-surface-soft p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-bold uppercase text-pf-muted">Capital</p>
                  <p className="font-bold text-pf-text">{formatMoney("L", solicitud.datos.monto)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-pf-muted">Tasa</p>
                  <p className="flex items-center gap-1 font-bold text-pf-text"><Percent className="h-3 w-3" strokeWidth={2} aria-hidden />{solicitud.datos.tasaInteres}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-pf-muted">Plazo</p>
                  <p className="font-bold text-pf-text">{solicitud.datos.plazo} cuotas</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-pf-muted">Frecuencia</p>
                  <p className="font-bold capitalize text-pf-text">{solicitud.datos.frecuencia}</p>
                </div>
              </div>
              {solicitud.estado === "rechazada" && solicitud.motivo_resolucion ? (
                <p className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/30 p-3 text-xs text-pf-danger">
                  Motivo del rechazo: {solicitud.motivo_resolucion}
                </p>
              ) : null}
              {solicitud.estado === "aprobada" && solicitud.prestamo_resultante_id ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(`/prestamos/${solicitud.prestamo_resultante_id}`)}
                >
                  <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Ver préstamo creado
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
