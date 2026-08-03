import { ArrowLeft, CalendarClock, Camera, CheckCircle2, ClipboardX, Clock3, ExternalLink, HandCoins, History, MapPin, Navigation, Phone, ReceiptText, Route, TriangleAlert, UserRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GestionSinCobroModal } from "../components/GestionSinCobroModal";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState } from "../components/ui";
import { getClienteRuta, getHistorialCobranza, type ClienteRuta, type HistorialCobranzaItem } from "../lib/cobranzaService";
import { getFacadePhotoUrl, uploadFacadePhoto } from "../lib/customerService";
import { formatDate, formatDateOnly, formatLoanNumber, formatMoney } from "../lib/format";
import { FREQUENCY_LABELS } from "../lib/loanCalculator";

function SituacionCredito({ data }: { data: ClienteRuta }) {
  const totalCuotas = data.prestamos.reduce((total, item) => total + item.prestamo.plazo, 0);
  const pagosRealizados = data.prestamos.reduce(
    (total, item) => total + Math.min(item.pagosRealizados, item.prestamo.plazo),
    0,
  );
  const progreso = totalCuotas > 0 ? Math.min(100, Math.round((pagosRealizados / totalCuotas) * 100)) : 0;
  const proximaFecha = data.prestamos
    .map((item) => item.proximaFecha)
    .filter((fecha): fecha is string => Boolean(fecha))
    .sort()[0] ?? null;
  const enAtraso = data.diasAtraso > 0 || data.atrasado > 0;

  return (
    <section
      aria-labelledby="situacion-credito-title"
      className="overflow-hidden rounded-2xl border border-pf-border-soft bg-pf-surface-elevated shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pf-border-soft bg-gradient-to-r from-pf-info-soft/55 via-pf-primary-soft/45 to-pf-warning-soft/35 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-surface-elevated text-pf-primary shadow-sm">
            <WalletCards className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-pf-muted">Resumen actualizado</p>
            <h3 id="situacion-credito-title" className="font-extrabold text-pf-text">Situación del crédito</h3>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${
            enAtraso ? "bg-pf-danger-soft text-pf-danger" : "bg-pf-success-soft text-pf-success"
          }`}
        >
          {enAtraso ? <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />}
          <span className="sr-only">Estado del crédito: </span>
          {enAtraso ? "En atraso" : "Al día"}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-pf-border-soft bg-pf-surface-soft p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-pf-muted">Saldo pendiente</p>
            <p className="mt-1 whitespace-nowrap text-2xl font-extrabold tabular-nums text-pf-text">
              {formatMoney("L", data.saldoTotal)}
            </p>
            <p className="mt-1 text-xs text-pf-text-secondary">
              {data.prestamos.length} {data.prestamos.length === 1 ? "préstamo activo" : "préstamos activos"}
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${enAtraso ? "border-pf-danger-soft bg-pf-danger-soft/35" : "border-pf-primary-soft bg-pf-primary-soft/35"}`}>
            <p className={`text-xs font-bold uppercase tracking-wide ${enAtraso ? "text-pf-danger" : "text-pf-primary-hover"}`}>Pago sugerido</p>
            <p className={`mt-1 whitespace-nowrap text-2xl font-extrabold tabular-nums ${enAtraso ? "text-pf-danger" : "text-pf-text"}`}>
              {formatMoney("L", data.pagoSugerido)}
            </p>
            <p className="mt-1 text-xs text-pf-text-secondary">
              {enAtraso ? "Para cubrir atraso y cuota de hoy." : "Para mantener el crédito al día."}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-3 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-pf-muted">Atrasado</dt>
            <dd className={`mt-1 break-words font-extrabold tabular-nums ${data.atrasado > 0 ? "text-pf-danger" : "text-pf-text"}`}>
              {formatMoney("L", data.atrasado)}
            </dd>
          </div>
          <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-3 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-pf-muted">Cuotas vencidas</dt>
            <dd className={`mt-1 font-extrabold tabular-nums ${data.cuotasVencidas > 0 ? "text-pf-danger" : "text-pf-text"}`}>
              {data.cuotasVencidas}
            </dd>
          </div>
          <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-3 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-pf-muted">Cuota de hoy</dt>
            <dd className="mt-1 break-words font-extrabold tabular-nums text-pf-text">
              {formatMoney("L", data.cuotaCorriente)}
            </dd>
          </div>
          <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-3 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-pf-muted">Días de atraso</dt>
            <dd className={`mt-1 font-extrabold tabular-nums ${data.diasAtraso > 0 ? "text-pf-danger" : "text-pf-text"}`}>
              {data.diasAtraso}
            </dd>
          </div>
        </dl>

        <p className="rounded-xl border border-pf-warning-soft bg-pf-warning-soft/35 px-3 py-2 text-xs leading-relaxed text-pf-text-secondary">
          La mora monetaria todavía no se aplica al saldo ni al pago sugerido.
        </p>

        <div className="grid gap-3 border-t border-pf-border-soft pt-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center">
          <div className="flex items-center gap-3 rounded-xl bg-pf-surface-soft px-3 py-2.5">
            <Clock3 className="h-5 w-5 shrink-0 text-pf-primary" strokeWidth={2} aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-pf-muted">Próxima fecha</p>
              <p className="truncate text-sm font-extrabold text-pf-text">
                {proximaFecha ? formatDateOnly(proximaFecha) : "Sin próxima cuota"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3 text-xs">
              <span className="font-bold text-pf-text-secondary">Pagos realizados</span>
              <strong className="tabular-nums text-pf-text">{pagosRealizados} de {totalCuotas} cuotas</strong>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-pf-border-soft"
              role="progressbar"
              aria-label="Progreso de pagos realizados"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progreso}
              aria-valuetext={`${pagosRealizados} de ${totalCuotas} cuotas cubiertas`}
            >
              <span
                className="block h-full rounded-full bg-gradient-to-r from-pf-primary to-pf-warning transition-[width]"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-pf-muted">{progreso}% completado</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CobranzaClientePage() {
  const navigate = useNavigate();
  const { clienteId = "" } = useParams();
  const [data, setData] = useState<ClienteRuta | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [gestionOpen, setGestionOpen] = useState(false);
  const [historial, setHistorial] = useState<HistorialCobranzaItem[]>([]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoSaving, setFotoSaving] = useState(false);
  const [fotoErr, setFotoErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const result = await getClienteRuta(clienteId);
      if (!result) setErr("Este cliente ya no tiene cobros pendientes.");
      setData(result);
      if (result) {
        const [url, movimientos] = await Promise.all([
          getFacadePhotoUrl(result.cliente.foto_fachada_path),
          getHistorialCobranza(clienteId, result.prestamos.map((item) => item.prestamo.id)).catch(() => []),
        ]);
        setFotoUrl(url);
        setHistorial(movimientos);
      } else {
        setFotoUrl(null);
        setHistorial([]);
      }
    } catch {
      setErr("No pudimos cargar la ficha. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cliente = data?.cliente;
  const direccionCompleta = cliente
    ? [cliente.direccion, cliente.colonia && `Colonia ${cliente.colonia}`, "Honduras"].filter(Boolean).join(", ")
    : "";
  const mapsUrl = direccionCompleta
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}`
    : "";

  async function guardarFoto(file: File | undefined) {
    if (!file || !data) return;
    setFotoSaving(true);
    setFotoErr("");
    try {
      const path = await uploadFacadePhoto(data.cliente.id, file, data.cliente.foto_fachada_path);
      const url = await getFacadePhotoUrl(path);
      setFotoUrl(url);
      setData((current) => current ? { ...current, cliente: { ...current.cliente, foto_fachada_path: path } } : current);
    } catch (cause) {
      setFotoErr(cause instanceof Error ? cause.message : "No pudimos guardar la foto. Intente de nuevo.");
    } finally {
      setFotoSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pf-safe-page max-md:pb-28">
      <PageHero
        title="Gestión de cobro"
        constrained
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate("/cobranza")}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Volver a la ruta
          </Button>
        }
      >
        <p className="pf-page-lead">Revise la situación del cliente antes de cobrar.</p>
      </PageHero>

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando ficha…</Card>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Sin cobros pendientes"
            description={err || "Este cliente no tiene préstamos con saldo."}
            icon={<Route className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={<Button type="button" variant="secondary" onClick={() => navigate("/cobranza")}>Volver a la ruta</Button>}
          />
        </Card>
      ) : (
        <>
          <Card className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${data.diasAtraso > 0 ? "bg-pf-danger-soft text-pf-danger" : "bg-pf-primary-soft text-pf-primary-hover"}`}>
                <UserRound className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className={`truncate text-lg font-extrabold ${data.diasAtraso > 0 ? "text-pf-danger" : "text-pf-text"}`}>{cliente!.nombre}</h2>
                <p className="truncate text-xs text-pf-muted">{cliente!.identidad || "Sin identidad"}</p>
              </div>
              {data.diasAtraso > 0 ? (
                <span className="shrink-0 rounded-full bg-pf-danger-soft px-2.5 py-1 text-xs font-bold text-pf-danger">
                  {data.diasAtraso} {data.diasAtraso === 1 ? "día" : "días"} de atraso
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-pf-success-soft px-2.5 py-1 text-xs font-bold text-pf-success">Al día</span>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-pf-text-secondary">
              <p className="flex min-w-0 items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                <span className="min-w-0 break-words">{[cliente!.direccion, cliente!.colonia && `Col. ${cliente!.colonia}`].filter(Boolean).join(" · ") || "Sin dirección"}</span>
              </p>
              <p className="flex min-w-0 items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                {cliente!.telefono ? (
                  <a href={`tel:${cliente!.telefono}`} className="pf-inline-link-soft min-w-0 break-words font-semibold">{cliente!.telefono}</a>
                ) : (
                  <span className="min-w-0 break-words">Sin teléfono</span>
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pf-btn-secondary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
                >
                  <Navigation className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Cómo llegar
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </a>
              ) : (
                <p className="rounded-xl border border-pf-warning-soft bg-pf-warning-soft/40 px-3 py-2 text-xs text-pf-text-secondary">
                  Agregue la dirección del cliente para abrir la ruta.
                </p>
              )}
              <Link
                to={`/clientes/${cliente!.id}/estado-cuenta`}
                className="pf-btn-secondary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
              >
                <ReceiptText className="h-4 w-4" strokeWidth={2} aria-hidden />
                Estado de cuenta
              </Link>
            </div>

            {data.promesa ? (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${data.promesa.vencida ? "border-pf-danger-soft bg-pf-danger-soft/40 text-pf-danger" : "border-pf-warning-soft bg-pf-warning-soft/45 text-pf-text-secondary"}`} role={data.promesa.vencida ? "alert" : "status"}>
                <CalendarClock className={`mt-0.5 h-4 w-4 shrink-0 ${data.promesa.vencida ? "text-pf-danger" : "text-pf-warning"}`} strokeWidth={2} aria-hidden />
                <p>
                  {data.promesa.vencida ? "Promesa vencida: debía pagar" : "Prometió"}{" "}
                  <strong className="tabular-nums text-pf-text">{formatMoney("L", data.promesa.monto)}</strong>{" "}
                  {data.promesa.vencida ? "el" : "para el"} {formatDateOnly(data.promesa.fecha)}.
                  {data.promesa.montoPagado > 0 ? (
                    <span className="mt-0.5 block text-xs font-medium">
                      Ya abonó {formatMoney("L", data.promesa.montoPagado)} de {formatMoney("L", data.promesa.montoOriginal)}.
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            <SituacionCredito data={data} />
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-pf-muted">Ubicación de la visita</p>
                <h3 className="mt-1 font-extrabold text-pf-text">Foto de la fachada</h3>
              </div>
              <Camera className="h-5 w-5 shrink-0 text-pf-primary" strokeWidth={2} aria-hidden />
            </div>
            {fotoUrl ? (
              <img src={fotoUrl} alt={`Fachada registrada de ${cliente!.nombre}`} className="max-h-72 w-full rounded-2xl border border-pf-border-soft object-cover" />
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-pf-border bg-pf-surface-soft px-4 text-center">
                <Camera className="h-6 w-6 text-pf-muted" strokeWidth={1.8} aria-hidden />
                <p className="mt-2 text-sm font-bold text-pf-text">Sin foto registrada</p>
                <p className="mt-1 text-xs text-pf-muted">Es opcional y ayuda a reconocer la vivienda.</p>
              </div>
            )}
            <label className={`pf-btn-secondary inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${fotoSaving ? "pointer-events-none opacity-50" : ""}`}>
              <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
              {fotoSaving ? "Guardando foto…" : fotoUrl ? "Cambiar foto" : "Tomar foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                disabled={fotoSaving}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void guardarFoto(file);
                }}
              />
            </label>
            {fotoErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{fotoErr}</p> : null}
          </Card>

          <div className="space-y-2">
            <details className="pf-card-surface group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-extrabold text-pf-text">
                <span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />Referencias del cliente</span>
                <span className="text-xs font-semibold text-pf-primary-hover group-open:hidden">Ver</span>
                <span className="hidden text-xs font-semibold text-pf-primary-hover group-open:inline">Ocultar</span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap border-t border-pf-border-soft pt-3 text-sm leading-relaxed text-pf-text-secondary">
                {cliente!.referencias || "No hay referencias registradas."}
              </p>
            </details>

            <details className="pf-card-surface group p-4" open>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-extrabold text-pf-text">
                <span className="flex items-center gap-2"><History className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />Historial del cliente</span>
                <span className="text-xs font-semibold text-pf-primary-hover group-open:hidden">Ver</span>
                <span className="hidden text-xs font-semibold text-pf-primary-hover group-open:inline">Ocultar</span>
              </summary>
              {historial.length ? (
                <ol className="mt-3 space-y-3 border-t border-pf-border-soft pt-3">
                  {historial.slice(0, 10).map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${item.tipo === "pago" ? "bg-pf-success-soft text-pf-success" : "bg-pf-warning-soft text-pf-warning"}`}>
                        {item.tipo === "pago" ? <HandCoins className="h-4 w-4" strokeWidth={2} aria-hidden /> : <ClipboardX className="h-4 w-4" strokeWidth={2} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <strong className="text-sm text-pf-text">{item.titulo}</strong>
                          <span className="text-[11px] text-pf-muted">{formatDate(item.fecha)}</span>
                        </span>
                        {item.monto != null ? <span className="block text-sm font-extrabold tabular-nums text-pf-text">{formatMoney("L", item.monto)}</span> : null}
                        {item.detalle ? <span className="mt-0.5 block text-xs text-pf-text-secondary">{item.detalle}</span> : null}
                        {item.pagoId ? <Link to={`/pagos/${item.pagoId}/recibo`} className="mt-1 inline-flex text-xs font-bold text-pf-primary-hover hover:underline">Ver recibo</Link> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 border-t border-pf-border-soft pt-3 text-sm text-pf-muted">Todavía no hay visitas ni pagos registrados.</p>
              )}
            </details>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-pf-muted">
              Préstamos ({data.prestamos.length})
            </p>
            {data.prestamos.map((item) => (
              <Card key={item.prestamo.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/prestamos/${item.prestamo.id}`} className="font-mono text-xs font-bold text-pf-primary-hover hover:underline">
                      {formatLoanNumber(item.prestamo.numero, item.prestamo.id)}
                    </Link>
                    <p className="mt-0.5 text-xs text-pf-muted">{item.prestamo.plazo} cuotas · {FREQUENCY_LABELS[item.prestamo.frecuencia]}</p>
                  </div>
                  <LoanStatusBadge status={item.prestamo.estado} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-pf-muted">Saldo actual</dt><dd className="font-bold tabular-nums text-pf-text">{formatMoney("L", item.prestamo.saldo)}</dd></div>
                  <div><dt className="text-xs text-pf-muted">Pago requerido</dt><dd className="font-bold tabular-nums text-pf-danger">{formatMoney("L", item.atrasado)}</dd></div>
                  <div><dt className="text-xs text-pf-muted">Cuota de hoy</dt><dd className="tabular-nums text-pf-text-secondary">{formatMoney("L", item.cuotaCorriente)}</dd></div>
                  <div><dt className="text-xs text-pf-muted">Pagos realizados</dt><dd className="tabular-nums text-pf-text-secondary">{item.pagosRealizados} / {item.prestamo.plazo}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-pf-muted">Próxima fecha de pago</dt><dd className="text-pf-text-secondary">{item.proximaFecha ? formatDateOnly(item.proximaFecha) : "—"}</dd></div>
                </dl>
              </Card>
            ))}
            <Card className="flex items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-2 font-bold text-pf-text-secondary">
                <ReceiptText className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />Total
              </span>
              <strong className="text-lg font-extrabold tabular-nums text-pf-text">{formatMoney("L", data.saldoTotal)}</strong>
            </Card>
          </div>

          <div className="grid gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:border-t max-md:border-pf-border-soft max-md:bg-pf-surface-elevated/95 max-md:p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-10px_30px_rgba(15,23,42,0.12)] max-md:backdrop-blur-md sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[52px] w-full max-sm:order-2"
              onClick={() => setGestionOpen(true)}
            >
              <ClipboardX className="h-5 w-5" strokeWidth={2} aria-hidden />
              Gestión sin cobro
            </Button>
            <Button
              type="button"
              className="min-h-[52px] w-full text-base shadow-lg"
              onClick={() => navigate(`/cobranza/${clienteId}/abono`)}
            >
              <HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />
              Gestionar
            </Button>
          </div>

          <GestionSinCobroModal
            open={gestionOpen}
            clienteId={clienteId}
            clienteNombre={cliente!.nombre}
            onClose={() => setGestionOpen(false)}
            onSaved={() => { setGestionOpen(false); navigate("/cobranza"); }}
          />
        </>
      )}
    </div>
  );
}
