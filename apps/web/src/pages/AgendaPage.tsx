import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  MessageCircle,
  PhoneCall,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState } from "../components/ui";
import {
  getCollectionAgenda,
  type AgendaFilter,
  type AgendaItem,
  type CollectionAgenda,
} from "../lib/collectionAgendaService";
import { formatDateOnly, formatLoanNumber, formatMoney } from "../lib/format";
import { normalizeHondurasPhone, openWhatsAppReminder } from "../lib/reminderService";
import { openWhatsAppChat } from "../lib/whatsappService";

type AgendaViewFilter = AgendaFilter | "todas";

const FILTERS: Array<{ value: AgendaViewFilter; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "vencidas", label: "Vencidas" },
  { value: "hoy", label: "Hoy" },
  { value: "proximas", label: "Próximas" },
];

const CATEGORY_STYLE: Record<AgendaFilter, { label: string; classes: string; icon: LucideIcon }> = {
  vencidas: {
    label: "Vencido",
    classes: "border-pf-danger-soft bg-pf-danger-soft/55 text-pf-danger",
    icon: AlertTriangle,
  },
  hoy: {
    label: "Vence hoy",
    classes: "border-pf-warning-soft bg-pf-warning-soft/55 text-pf-warning",
    icon: Clock3,
  },
  proximas: {
    label: "Próximo",
    classes: "border-pf-info-soft bg-pf-info-soft/55 text-pf-info",
    icon: CalendarDays,
  },
};

function isViewFilter(value: string | null): value is AgendaViewFilter {
  return value === "todas" || value === "vencidas" || value === "hoy" || value === "proximas";
}

function AgendaStatusBadge({ category }: { category: AgendaFilter }) {
  const style = CATEGORY_STYLE[category];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${style.classes}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {style.label}
    </span>
  );
}

function AgendaMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  active: boolean;
  tone: "danger" | "warning" | "info" | "primary";
  onClick: () => void;
}) {
  const tones = {
    danger: "border-pf-danger-soft from-pf-surface-elevated to-pf-danger-soft/55 text-pf-danger",
    warning: "border-pf-warning-soft from-pf-surface-elevated to-pf-warning-soft/55 text-pf-warning",
    info: "border-pf-info-soft from-pf-surface-elevated to-pf-info-soft/55 text-pf-info",
    primary: "border-pf-primary-soft from-pf-surface-elevated to-pf-primary-soft/55 text-pf-primary-hover",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group min-h-[116px] rounded-2xl border bg-gradient-to-br p-4 text-left shadow-[var(--pf-shadow-warm-md)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary motion-reduce:transform-none ${tones[tone]} ${active ? "ring-2 ring-current ring-offset-2" : ""}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-pf-muted">{label}</span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-white/55" aria-hidden>
          <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.9} />
        </span>
      </span>
      <strong className="mt-2 block truncate text-xl font-black leading-none tracking-tight tabular-nums text-pf-text" title={value}>
        {value}
      </strong>
      <span className="mt-2 block truncate text-xs font-medium text-pf-text-tertiary">{detail}</span>
    </button>
  );
}

function ItemActions({
  item,
  onWhatsApp,
  onWhatsAppCall,
}: {
  item: AgendaItem;
  onWhatsApp: (item: AgendaItem) => void;
  onWhatsAppCall: (item: AgendaItem) => void;
}) {
  const navigate = useNavigate();
  const loanNumber = formatLoanNumber(item.prestamoNumero, item.prestamoId);
  const hasValidPhone = Boolean(normalizeHondurasPhone(item.clienteTelefono));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:justify-end">
      <Button
        type="button"
        className="min-h-10 px-2.5 py-2 text-xs"
        onClick={() => navigate(`/pagos/nuevo?prestamoId=${encodeURIComponent(item.prestamoId)}`)}
        aria-label={`Cobrar ${loanNumber} de ${item.clienteNombre}`}
      >
        <Banknote className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Cobrar
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-10 px-2.5 py-2 text-xs"
        onClick={() => onWhatsApp(item)}
        disabled={!hasValidPhone}
        title={hasValidPhone ? "Preparar recordatorio en WhatsApp" : "El cliente no tiene un teléfono con formato válido"}
        aria-label={hasValidPhone ? `Preparar recordatorio en WhatsApp para ${item.clienteNombre}` : `${item.clienteNombre} no tiene un teléfono con formato válido`}
      >
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        WhatsApp
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-10 px-2.5 py-2 text-xs"
        onClick={() => onWhatsAppCall(item)}
        disabled={!hasValidPhone}
        title={hasValidPhone ? "Abrir el cliente en WhatsApp y confirmar allí la llamada" : "El cliente no tiene un teléfono con formato válido"}
        aria-label={hasValidPhone ? `Abrir WhatsApp para llamar a ${item.clienteNombre}` : `${item.clienteNombre} no tiene un teléfono con formato válido`}
      >
        <PhoneCall className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Abrir para llamar
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="min-h-10 px-2.5 py-2 text-xs"
        onClick={() => navigate(`/prestamos/${item.prestamoId}`)}
        aria-label={`Ver ${loanNumber} de ${item.clienteNombre}`}
      >
        <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Ver
      </Button>
    </div>
  );
}

export function AgendaPage() {
  const { config } = useBusinessConfig();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("filtro");
  const filter: AgendaViewFilter = isViewFilter(requestedFilter) ? requestedFilter : "todas";
  const [agenda, setAgenda] = useState<CollectionAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setAgenda(null);
    try {
      setAgenda(await getCollectionAgenda());
    } catch {
      setError("No pudimos preparar la agenda. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(
    () => (agenda?.items ?? []).filter((item) => filter === "todas" || item.categoria === filter),
    [agenda?.items, filter]
  );

  function selectFilter(nextFilter: AgendaViewFilter) {
    const next = new URLSearchParams(searchParams);
    if (nextFilter === "todas") next.delete("filtro");
    else next.set("filtro", nextFilter);
    setSearchParams(next, { replace: true });
  }

  function sendReminder(item: AgendaItem) {
    setActionError("");
    const opened = openWhatsAppReminder(item, config?.nombre_negocio);
    if (!opened) {
      setActionError(
        normalizeHondurasPhone(item.clienteTelefono)
          ? "El navegador no permitió abrir WhatsApp. Habilite las ventanas emergentes e intente de nuevo."
          : `Agregue o corrija el teléfono de ${item.clienteNombre} para enviar el recordatorio.`
      );
    }
  }

  function callByWhatsApp(item: AgendaItem) {
    setActionError("");
    if (!openWhatsAppChat(item.clienteTelefono, undefined, { fallbackSameTab: true })) {
      setActionError(`Agregue o corrija el teléfono de ${item.clienteNombre}; debe tener un formato válido para WhatsApp.`);
    }
  }

  const activeSummary = agenda?.summary;

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero
        title="Agenda de cobros"
        constrained
        actions={
          <Button type="button" onClick={() => navigate("/pagos/nuevo")}>
            <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />
            Registrar pago
          </Button>
        }
      >
        <p className="pf-page-lead">Priorice vencimientos, cobros de hoy y próximas cuotas.</p>
        <p className="pf-page-lead-muted">Los recordatorios se preparan en WhatsApp; usted decide cuándo enviarlos.</p>
      </PageHero>

      {actionError ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 px-4 py-3 text-sm font-medium text-pf-danger" role="alert">
          <span>{actionError}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => setActionError("")}>
            Cerrar
          </button>
        </div>
      ) : null}

      {agenda && activeSummary ? (
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
          <AgendaMetricCard
            label="Vencidas"
            value={formatMoney("L", activeSummary.vencidas.amount)}
            detail={`${activeSummary.vencidas.installments} cuota${activeSummary.vencidas.installments === 1 ? "" : "s"} · ${activeSummary.vencidas.customers} cliente${activeSummary.vencidas.customers === 1 ? "" : "s"}`}
            icon={AlertTriangle}
            tone="danger"
            active={filter === "vencidas"}
            onClick={() => selectFilter("vencidas")}
          />
          <AgendaMetricCard
            label="Vencen hoy"
            value={formatMoney("L", activeSummary.hoy.amount)}
            detail={`${activeSummary.hoy.installments} cuota${activeSummary.hoy.installments === 1 ? "" : "s"} · ${activeSummary.hoy.customers} cliente${activeSummary.hoy.customers === 1 ? "" : "s"}`}
            icon={Clock3}
            tone="warning"
            active={filter === "hoy"}
            onClick={() => selectFilter("hoy")}
          />
          <AgendaMetricCard
            label="Próximos 7 días"
            value={formatMoney("L", activeSummary.proximas.amount)}
            detail={`${activeSummary.proximas.installments} cuota${activeSummary.proximas.installments === 1 ? "" : "s"} · ${activeSummary.proximas.customers} cliente${activeSummary.proximas.customers === 1 ? "" : "s"}`}
            icon={CalendarDays}
            tone="info"
            active={filter === "proximas"}
            onClick={() => selectFilter("proximas")}
          />
          <AgendaMetricCard
            label="Agenda visible"
            value={formatMoney("L", activeSummary.total.amount)}
            detail={`${activeSummary.total.installments} cuota${activeSummary.total.installments === 1 ? "" : "s"} por atender`}
            icon={CalendarClock}
            tone="primary"
            active={filter === "todas"}
            onClick={() => selectFilter("todas")}
          />
        </div>
      ) : null}

      {agenda ? (
        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-pf-text">Cobros por atender</h2>
              <p className="mt-0.5 text-xs text-pf-muted">
                Desde vencidos hasta el {formatDateOnly(agenda.through)}.
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Filtrar agenda">
              {FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={filter === option.value ? "primary" : "secondary"}
                  className="min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-xs"
                  onClick={() => selectFilter(option.value)}
                  aria-pressed={filter === option.value}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="pf-table-toolbar">
            <div className="flex flex-wrap gap-1.5">
              <span className="pf-filter-chip">{filteredItems.length} cobro(s)</span>
              <span className="pf-filter-chip">
                Pendiente: {formatMoney("L", filteredItems.reduce((sum, item) => sum + item.pendiente, 0))}
              </span>
            </div>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <EmptyState
            title="No se pudo cargar la agenda"
            description={error}
            icon={<CalendarClock className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : loading ? (
        <Card className="p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">
          Preparando agenda…
        </Card>
      ) : agenda && agenda.items.length === 0 ? (
        <Card>
          <EmptyState
            title="Agenda al día"
            description={`No hay cuotas vencidas ni vencimientos hasta el ${formatDateOnly(agenda.through)}.`}
            icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={
              <Button type="button" variant="secondary" onClick={() => navigate("/prestamos")}>
                <WalletCards className="h-4 w-4" strokeWidth={2} aria-hidden />
                Ver préstamos
              </Button>
            }
          />
        </Card>
      ) : agenda && filteredItems.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay cobros en este filtro"
            description="Elija otra fecha de atención para consultar el resto de la agenda."
            icon={<CalendarCheck2 className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={
              <Button type="button" variant="secondary" onClick={() => selectFilter("todas")}>
                Ver toda la agenda
              </Button>
            }
          />
        </Card>
      ) : agenda ? (
        <>
          <div className="space-y-2 md:hidden">
            {filteredItems.map((item) => (
              <Card key={item.id} className="space-y-3 border-white/70 bg-white/90 p-3 shadow-md shadow-stone-900/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-pf-text">{item.clienteNombre}</p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-pf-primary-hover">
                      {formatLoanNumber(item.prestamoNumero, item.prestamoId)}
                    </p>
                  </div>
                  <AgendaStatusBadge category={item.categoria} />
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-pf-surface-soft p-3 text-xs text-pf-text-secondary">
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Vencimiento</span>
                    <strong className="mt-1 block text-pf-text">{formatDateOnly(item.fechaVencimiento)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pendiente</span>
                    <strong className={`mt-1 block text-base tabular-nums ${item.categoria === "vencidas" ? "text-pf-danger" : "text-pf-text"}`}>
                      {formatMoney("L", item.pendiente)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Cuotas</span>
                    <strong className="mt-1 block text-pf-text">{item.cantidadCuotas}</strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Saldo préstamo</span>
                    <strong className="mt-1 block tabular-nums text-pf-text">{formatMoney("L", item.saldoPrestamo)}</strong>
                  </div>
                </div>
                <p className={`text-xs font-medium ${normalizeHondurasPhone(item.clienteTelefono) ? "text-pf-text-tertiary" : "text-pf-warning"}`}>
                  {normalizeHondurasPhone(item.clienteTelefono)
                    ? item.clienteTelefono
                    : item.clienteTelefono
                      ? `${item.clienteTelefono} · formato no válido para WhatsApp`
                      : "Sin teléfono para recordatorio"}
                </p>
                <ItemActions item={item} onWhatsApp={sendReminder} onWhatsAppCall={callByWhatsApp} />
              </Card>
            ))}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="pf-table-thead">
                  <tr>
                    <th className="px-4 py-3">Prioridad</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Préstamo</th>
                    <th className="px-4 py-3">Vencimiento</th>
                    <th className="px-4 py-3 text-center">Cuotas</th>
                    <th className="px-4 py-3 text-right">Pendiente</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="pf-table-body">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="pf-table-row">
                      <td className="px-4 py-3"><AgendaStatusBadge category={item.categoria} /></td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-bold text-pf-text">{item.clienteNombre}</p>
                        <p className={`mt-0.5 truncate text-xs ${normalizeHondurasPhone(item.clienteTelefono) ? "text-pf-muted" : "text-pf-warning"}`}>
                          {normalizeHondurasPhone(item.clienteTelefono)
                            ? item.clienteTelefono
                            : item.clienteTelefono
                              ? `${item.clienteTelefono} · formato no válido para WhatsApp`
                              : "Sin teléfono"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-pf-primary-hover">
                        {formatLoanNumber(item.prestamoNumero, item.prestamoId)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-pf-text-secondary">{formatDateOnly(item.fechaVencimiento)}</td>
                      <td className="px-4 py-3 text-center font-bold tabular-nums">{item.cantidadCuotas}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums ${item.categoria === "vencidas" ? "text-pf-danger" : "text-pf-text"}`}>
                        {formatMoney("L", item.pendiente)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-pf-text-secondary">
                        {formatMoney("L", item.saldoPrestamo)}
                      </td>
                      <td className="px-4 py-3"><ItemActions item={item} onWhatsApp={sendReminder} onWhatsAppCall={callByWhatsApp} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
