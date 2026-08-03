import { ArrowLeft, CheckCircle2, ClipboardX, HandCoins, Route } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GestionSinCobroModal } from "../components/GestionSinCobroModal";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal } from "../components/ui";
import { cobrarCliente, getClienteRuta, registrarGestion, repartirCobro, type ClienteRuta } from "../lib/cobranzaService";
import { formatLoanNumber, formatMoney } from "../lib/format";

const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type OpcionPago = "sugerido" | "requerido" | "otra";

function solicitudesKey(clienteId: string) {
  return `multiprestamos.cobranza-solicitudes-${clienteId}`;
}

/** Un id de solicitud por préstamo: el reintento nunca duplica lo ya cobrado. */
function getOrCreateSolicitudes(clienteId: string, prestamoIds: string[]): Record<string, string> {
  const key = solicitudesKey(clienteId);
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    saved = {};
  }
  const result: Record<string, string> = {};
  for (const id of prestamoIds) result[id] = saved[id] ?? crypto.randomUUID();
  try {
    window.sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    // sessionStorage es solo una protección extra: el cobro sigue siendo válido.
  }
  return result;
}

export function CobranzaAbonoPage() {
  const navigate = useNavigate();
  const { clienteId = "" } = useParams();
  const [data, setData] = useState<ClienteRuta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [opcion, setOpcion] = useState<OpcionPago>("sugerido");
  const [otraCantidad, setOtraCantidad] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gestionOpen, setGestionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const result = await getClienteRuta(clienteId);
      if (!result) setLoadErr("Este cliente ya no tiene cobros pendientes.");
      setData(result);
    } catch {
      setLoadErr("No pudimos cargar el cobro. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const otraValue = Number(otraCantidad);
  const otraDosDecimales = /^\d+(?:\.\d{0,2})?$/.test(otraCantidad);
  const otraValida = Boolean(
    data && otraCantidad && Number.isFinite(otraValue) && otraValue > 0 && otraDosDecimales && otraValue <= data.saldoTotal
  );
  const monto = !data
    ? 0
    : opcion === "sugerido"
      ? data.pagoSugerido
      : opcion === "requerido"
        ? data.pagoRequerido
        : otraValida
          ? otraValue
          : 0;
  const nuevoSaldo = data ? Math.max(0, data.saldoTotal - monto) : 0;
  const reparto = useMemo(() => (data && monto > 0 ? repartirCobro(data, monto) : []), [data, monto]);
  const puedeCobrar = Boolean(data && monto > 0 && monto <= data.saldoTotal && reparto.length > 0);
  const otraError = otraCantidad && !otraValida
    ? !Number.isFinite(otraValue) || otraValue <= 0 || !otraDosDecimales
      ? "Ingrese un monto positivo con máximo dos decimales."
      : `No puede superar el saldo de ${formatMoney("L", data?.saldoTotal ?? 0)}.`
    : "";

  async function confirmar() {
    if (!data || !puedeCobrar) return;
    setSaving(true);
    setErr("");
    try {
      const solicitudes = getOrCreateSolicitudes(clienteId, data.prestamos.map((item) => item.prestamo.id));
      const pagoIds = await cobrarCliente({ cliente: data, monto, solicitudes });
      try {
        window.sessionStorage.removeItem(solicitudesKey(clienteId));
      } catch {
        // El cobro ya quedó registrado; limpiar es solo higiene.
      }
      // Bitácora de la visita. Si falla no se bloquea el cobro: "visitado hoy"
      // también se deduce de los pagos del día.
      await registrarGestion({ clienteId, resultado: "pago", pagoId: pagoIds[0] }).catch(() => {});
      navigate(`/pagos/${pagoIds[0]}/recibo`, { replace: true, state: { created: true, origen: "cobranza" } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setErr(
        message.startsWith("Falta aplicar") || message.startsWith("Se registró") || message.includes("saldo")
          ? message
          : "No pudimos registrar el cobro. Sus datos se conservaron para reintentar."
      );
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function opcionCardClass(active: boolean) {
    return `w-full rounded-2xl border p-4 text-left transition ${
      active ? "border-pf-primary bg-pf-primary-soft/35 shadow-sm" : "border-pf-border-soft bg-pf-surface-elevated hover:bg-pf-surface-soft"
    }`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pf-safe-page max-md:pb-28">
      <PageHero
        title="Abono"
        constrained
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate(`/cobranza/${clienteId}`)}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Volver
          </Button>
        }
      >
        <p className="pf-page-lead">{data ? `Seleccione la opción de pago que ${data.cliente.nombre} vaya a realizar.` : "Seleccione la opción de pago."}</p>
      </PageHero>

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando cobro…</Card>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Sin cobros pendientes"
            description={loadErr || "Este cliente no tiene préstamos con saldo."}
            icon={<Route className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={<Button type="button" variant="secondary" onClick={() => navigate("/cobranza")}>Volver a la ruta</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <button type="button" aria-pressed={opcion === "sugerido"} className={opcionCardClass(opcion === "sugerido")} onClick={() => setOpcion("sugerido")}>
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-pf-text">Pago sugerido</span>
                <strong className="whitespace-nowrap text-xl font-black tabular-nums text-pf-danger">{formatMoney("L", data.pagoSugerido)}</strong>
              </span>
              <span className="mt-3 block space-y-1 border-t border-pf-border-soft pt-2.5 text-xs text-pf-text-secondary">
                <span className="flex justify-between gap-3"><span>Atrasado</span><strong className="tabular-nums">{formatMoney("L", data.atrasado)}</strong></span>
                <span className="flex justify-between gap-3"><span>Moratorios</span><strong className="tabular-nums">{formatMoney("L", data.moratorios)}</strong></span>
                <span className="flex justify-between gap-3"><span>Cuota del período</span><strong className="tabular-nums">{formatMoney("L", data.cuotaCorriente)}</strong></span>
              </span>
            </button>

            {data.pagoRequerido > 0 ? (
              <button type="button" aria-pressed={opcion === "requerido"} className={opcionCardClass(opcion === "requerido")} onClick={() => setOpcion("requerido")}>
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-bold text-pf-text">Pago requerido</span>
                  <strong className="whitespace-nowrap text-xl font-black tabular-nums text-pf-danger">{formatMoney("L", data.pagoRequerido)}</strong>
                </span>
                <span className="mt-3 block space-y-1 border-t border-pf-border-soft pt-2.5 text-xs text-pf-text-secondary">
                  <span className="flex justify-between gap-3"><span>Atrasado</span><strong className="tabular-nums">{formatMoney("L", data.atrasado)}</strong></span>
                  <span className="flex justify-between gap-3"><span>Moratorios</span><strong className="tabular-nums">{formatMoney("L", data.moratorios)}</strong></span>
                </span>
              </button>
            ) : null}

            <button type="button" aria-pressed={opcion === "otra"} className={opcionCardClass(opcion === "otra")} onClick={() => setOpcion("otra")}>
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-pf-text">Pagar otra cantidad</span>
                <span className="text-xs text-pf-muted">Máx. {formatMoney("L", data.saldoTotal)}</span>
              </span>
            </button>

            {opcion === "otra" ? (
              <Card className="space-y-2 p-4">
                <Field label="Monto recibido (L) *" htmlFor="abono-otra">
                  <Input
                    id="abono-otra"
                    data-autofocus="true"
                    className={`${NUMBER_INPUT_CLASS} text-xl font-extrabold tabular-nums`}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={data.saldoTotal}
                    step="0.01"
                    value={otraCantidad}
                    onChange={(event) => { setOtraCantidad(event.target.value); setErr(""); }}
                    placeholder="0.00"
                    aria-invalid={Boolean(otraError)}
                  />
                </Field>
                {otraError ? <p className="text-sm font-medium text-pf-danger" role="alert">{otraError}</p> : null}
              </Card>
            ) : null}
          </div>

          <Card className="space-y-2 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-pf-muted">Está eligiendo la mejor opción de pago</p>
            <p className="flex items-end justify-between gap-3"><span className="text-sm text-pf-text-secondary">Pagando</span><strong className="text-2xl font-black tabular-nums text-pf-text">{formatMoney("L", monto)}</strong></p>
            <p className="flex items-end justify-between gap-3 border-t border-pf-border-soft pt-2"><span className="text-sm text-pf-text-secondary">Su nuevo saldo será de</span><strong className="text-lg font-extrabold tabular-nums text-pf-text">{formatMoney("L", nuevoSaldo)}</strong></p>
            {reparto.length > 1 ? (
              <div className="space-y-1 rounded-xl bg-pf-surface-soft p-3 text-xs text-pf-text-secondary">
                <p className="font-bold text-pf-text">Se repartirá entre {reparto.length} préstamos</p>
                {reparto.map((parte) => (
                  <p key={parte.prestamo.id} className="flex justify-between gap-3">
                    <span className="font-mono">{formatLoanNumber(parte.prestamo.numero, parte.prestamo.id)}</span>
                    <strong className="tabular-nums">{formatMoney("L", parte.monto)}</strong>
                  </p>
                ))}
                <p className="pt-1">Cada préstamo genera su propio recibo.</p>
              </div>
            ) : null}
          </Card>

          {err ? <p className="text-sm font-medium text-pf-danger" role="alert">{err}</p> : null}

          <div className="grid gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:border-t max-md:border-pf-border-soft max-md:bg-pf-surface-elevated/95 max-md:p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-10px_30px_rgba(15,23,42,0.12)] max-md:backdrop-blur-md sm:grid-cols-2">
            <Button type="button" variant="secondary" className="min-h-[52px] w-full max-sm:order-2" disabled={saving} onClick={() => setGestionOpen(true)}>
              <ClipboardX className="h-5 w-5" strokeWidth={2} aria-hidden />
              Gestión sin cobro
            </Button>
            <Button type="button" className="min-h-[52px] w-full text-base shadow-lg" disabled={!puedeCobrar || saving} onClick={() => setConfirmOpen(true)}>
              <HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />
              Cobrar {monto > 0 ? formatMoney("L", monto) : ""}
            </Button>
          </div>

          <GestionSinCobroModal
            open={gestionOpen}
            clienteId={clienteId}
            clienteNombre={data.cliente.nombre}
            onClose={() => setGestionOpen(false)}
            onSaved={() => { setGestionOpen(false); navigate("/cobranza"); }}
          />
        </>
      )}

      <Modal open={confirmOpen} title="Confirmar cobro" onClose={() => { if (!saving) setConfirmOpen(false); }} maxWidthClass="sm:max-w-lg">
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm font-medium text-pf-muted">Monto recibido</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-pf-text">{formatMoney("L", monto)}</p>
          </div>
          <div className="rounded-xl bg-pf-surface-soft p-4 text-sm">
            <p className="flex justify-between gap-3"><span className="text-pf-muted">Cliente</span><strong className="text-right text-pf-text">{data?.cliente.nombre}</strong></p>
            <p className="mt-2 flex justify-between gap-3"><span className="text-pf-muted">Saldo actual</span><strong className="tabular-nums">{formatMoney("L", data?.saldoTotal ?? 0)}</strong></p>
            <p className="mt-2 flex justify-between gap-3 border-t border-pf-border-soft pt-2"><span className="font-bold text-pf-text">Nuevo saldo</span><strong className="text-lg tabular-nums text-pf-text">{formatMoney("L", nuevoSaldo)}</strong></p>
          </div>
          <p className="text-xs leading-relaxed text-pf-muted">El monto se aplicará a las cuotas más antiguas{reparto.length > 1 ? " de cada préstamo" : ""} y se generará el recibo.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Volver y corregir</Button>
            <Button type="button" className="min-h-[48px]" disabled={saving} onClick={() => void confirmar()}>
              {saving ? "Registrando…" : <><CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />Confirmar cobro</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
