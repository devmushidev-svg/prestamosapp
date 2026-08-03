import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, ExternalLink, MapPin, Navigation, Phone, Route, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Select } from "../components/ui";
import { getRutaCobro, guardarOrdenRuta, type ClienteRuta, type RutaCobro } from "../lib/cobranzaService";
import { formatDateOnly, formatMoney } from "../lib/format";

type Orden = "pago_sugerido" | "pago_requerido" | "semanas_atraso" | "colonia" | "manual";
type TabRuta = "pendientes" | "visitados";

const ORDEN_KEY = "multiprestamos.ruta-orden";
const SIN_COLONIA = "__sin_colonia__";

function coloniaKey(cliente: ClienteRuta): string {
  const value = cliente.cliente.colonia?.trim();
  return value ? value.toLocaleLowerCase("es-HN") : SIN_COLONIA;
}

function sortClientes(items: ClienteRuta[], orden: Orden): ClienteRuta[] {
  const sorted = [...items];
  switch (orden) {
    case "pago_sugerido":
      return sorted.sort((a, b) => b.pagoSugerido - a.pagoSugerido || a.cliente.nombre.localeCompare(b.cliente.nombre, "es-HN"));
    case "pago_requerido":
      return sorted.sort((a, b) => b.pagoRequerido - a.pagoRequerido || a.cliente.nombre.localeCompare(b.cliente.nombre, "es-HN"));
    case "semanas_atraso":
      return sorted.sort((a, b) => b.semanasAtraso - a.semanasAtraso || b.pagoSugerido - a.pagoSugerido);
    case "colonia":
      return sorted.sort((a, b) => {
        const ca = a.cliente.colonia?.trim() ?? "";
        const cb = b.cliente.colonia?.trim() ?? "";
        if (!ca && cb) return 1;
        if (ca && !cb) return -1;
        return ca.localeCompare(cb, "es-HN") || a.cliente.nombre.localeCompare(b.cliente.nombre, "es-HN");
      });
    case "manual":
      return sorted.sort((a, b) =>
        (a.cliente.orden_ruta ?? Number.MAX_SAFE_INTEGER) - (b.cliente.orden_ruta ?? Number.MAX_SAFE_INTEGER)
        || a.cliente.nombre.localeCompare(b.cliente.nombre, "es-HN"));
  }
}

export function RutaCobroPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<RutaCobro | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabRuta>("pendientes");
  const [colonia, setColonia] = useState("");
  const [orden, setOrdenState] = useState<Orden>(() => {
    const saved = localStorage.getItem(ORDEN_KEY);
    return saved === "pago_requerido" || saved === "semanas_atraso" || saved === "colonia" || saved === "manual"
      ? saved
      : "pago_sugerido";
  });
  const [movingId, setMovingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setData(await getRutaCobro());
    } catch {
      setErr("No pudimos cargar la ruta de cobro. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientes = useMemo(() => data?.clientes ?? [], [data]);

  const colonias = useMemo(() => {
    const counts = new Map<string, { label: string; total: number }>();
    for (const item of clientes) {
      const key = coloniaKey(item);
      const label = key === SIN_COLONIA ? "Sin colonia" : item.cliente.colonia!.trim();
      const entry = counts.get(key);
      if (entry) entry.total += 1;
      else counts.set(key, { label, total: 1 });
    }
    return [...counts.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => (a.key === SIN_COLONIA ? 1 : b.key === SIN_COLONIA ? -1 : a.label.localeCompare(b.label, "es-HN")));
  }, [clientes]);

  const filtrados = useMemo(
    () => (colonia ? clientes.filter((item) => coloniaKey(item) === colonia) : clientes),
    [clientes, colonia]
  );
  const pendientes = useMemo(() => sortClientes(filtrados.filter((item) => !item.visitadoHoy), orden), [filtrados, orden]);
  const visitados = useMemo(() => sortClientes(filtrados.filter((item) => item.visitadoHoy), orden), [filtrados, orden]);
  const visible = tab === "pendientes" ? pendientes : visitados;
  const porCobrarHoy = useMemo(
    () => clientes.filter((item) => !item.visitadoHoy).reduce((s, item) => s + item.pagoSugerido, 0),
    [clientes]
  );
  const rutaMaps = useMemo(() => {
    const paradas = pendientes
      .filter((item) => item.cliente.direccion?.trim())
      .slice(0, 9)
      .map((item) => [item.cliente.direccion, item.cliente.colonia && `Colonia ${item.cliente.colonia}`, "Honduras"].filter(Boolean).join(", "));
    if (!paradas.length) return { url: "", total: 0 };
    const destination = paradas[paradas.length - 1];
    const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
    if (paradas.length > 1) params.set("waypoints", paradas.slice(0, -1).join("|"));
    return { url: `https://www.google.com/maps/dir/?${params.toString()}`, total: paradas.length };
  }, [pendientes]);

  async function setOrden(next: Orden) {
    const previo = orden;
    setOrdenState(next);
    localStorage.setItem(ORDEN_KEY, next);
    if (next !== "manual" || !data) return;
    // Primera activación: congela el orden visible actual como punto de partida.
    if (!clientes.some((item) => item.cliente.orden_ruta == null)) return;
    const base = sortClientes(clientes, previo === "manual" ? "pago_sugerido" : previo);
    const items = base.map((item, index) => ({ id: item.cliente.id, orden_ruta: index }));
    try {
      setMovingId("__all__");
      await guardarOrdenRuta(items);
      const posiciones = new Map(items.map((item) => [item.id, item.orden_ruta]));
      setData({
        ...data,
        clientes: clientes.map((item) => ({
          ...item,
          cliente: { ...item.cliente, orden_ruta: posiciones.get(item.cliente.id) ?? item.cliente.orden_ruta },
        })),
      });
    } catch {
      setErr("No pudimos guardar el orden manual. Revise la conexión e intente de nuevo.");
      setOrdenState(previo);
      localStorage.setItem(ORDEN_KEY, previo);
    } finally {
      setMovingId("");
    }
  }

  async function mover(index: number, delta: -1 | 1) {
    if (!data) return;
    const actual = visible[index];
    const vecino = visible[index + delta];
    if (!actual || !vecino) return;
    const ordenActual = actual.cliente.orden_ruta ?? 0;
    const ordenVecino = vecino.cliente.orden_ruta ?? 0;
    try {
      setMovingId(actual.cliente.id);
      await guardarOrdenRuta([
        { id: actual.cliente.id, orden_ruta: ordenVecino },
        { id: vecino.cliente.id, orden_ruta: ordenActual },
      ]);
      setData({
        ...data,
        clientes: clientes.map((item) => {
          if (item.cliente.id === actual.cliente.id) return { ...item, cliente: { ...item.cliente, orden_ruta: ordenVecino } };
          if (item.cliente.id === vecino.cliente.id) return { ...item, cliente: { ...item.cliente, orden_ruta: ordenActual } };
          return item;
        }),
      });
    } catch {
      setErr("No pudimos mover el cliente. Revise la conexión e intente de nuevo.");
    } finally {
      setMovingId("");
    }
  }

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero title="Ruta de cobro" constrained>
        <p className="pf-page-lead max-w-2xl">Clientes con cobro pendiente, listos para la visita del día.</p>
        <p className="pf-page-lead-muted">El pago sugerido suma lo atrasado más la cuota del período.</p>
      </PageHero>

      {data?.migracionPendiente ? (
        <div className="flex items-start gap-3 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/55 px-4 py-3 text-sm text-pf-text-secondary" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-pf-warning" strokeWidth={2} aria-hidden />
          <div>
            <p className="font-bold text-pf-text">Actualización de cobranza pendiente</p>
            <p className="mt-0.5 text-xs">Falta aplicar la actualización de cobranza en Supabase. La ruta funciona, pero las visitas sin cobro y las promesas se guardarán después de aplicarla.</p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando ruta…</Card>
      ) : err && !data ? (
        <Card><EmptyState title="No se pudo cargar la ruta" description={err} icon={<Route className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : clientes.length === 0 ? (
        <Card><EmptyState title="No hay cobros pendientes" description="Cuando existan préstamos con saldo, los clientes aparecerán aquí ordenados para la visita." icon={<Route className="h-5 w-5" strokeWidth={2} aria-hidden />} /></Card>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pf-filter-chip">TODOS ({clientes.length})</span>
            <span className="pf-filter-chip">Por cobrar hoy: <strong className="ml-1 tabular-nums">{formatMoney("L", porCobrarHoy)}</strong></span>
          </div>

          {rutaMaps.url && tab === "pendientes" ? (
            <a
              href={rutaMaps.url}
              target="_blank"
              rel="noreferrer"
              className="pf-btn-primary-gradient inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
            >
              <Navigation className="h-5 w-5" strokeWidth={2} aria-hidden />
              Abrir ruta en Maps ({rutaMaps.total} {rutaMaps.total === 1 ? "parada" : "paradas"})
              <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
            </a>
          ) : null}

          <Card className="space-y-3 p-3 sm:p-4">
            <div className="pf-settings-tabs-nav" role="tablist" aria-label="Estado de visita">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "pendientes"}
                className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${tab === "pendientes" ? "pf-settings-tab-active" : "pf-settings-tab-idle"}`}
                onClick={() => setTab("pendientes")}
              >
                No visitados ({pendientes.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "visitados"}
                className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${tab === "visitados" ? "pf-settings-tab-active" : "pf-settings-tab-idle"}`}
                onClick={() => setTab("visitados")}
              >
                Visitados ({visitados.length})
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Colonia" htmlFor="ruta-colonia" compact>
                <Select id="ruta-colonia" value={colonia} onChange={(event) => setColonia(event.target.value)}>
                  <option value="">Todas las colonias ({clientes.length})</option>
                  {colonias.map((item) => (
                    <option key={item.key} value={item.key}>{item.label} ({item.total})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Ordenar resultados por" htmlFor="ruta-orden" compact>
                <Select id="ruta-orden" value={orden} onChange={(event) => void setOrden(event.target.value as Orden)} disabled={movingId === "__all__"}>
                  <option value="pago_sugerido">Pago sugerido</option>
                  <option value="pago_requerido">Pago requerido</option>
                  <option value="semanas_atraso">Semanas de atraso</option>
                  <option value="colonia">Colonia</option>
                  <option value="manual">Orden manual</option>
                </Select>
              </Field>
            </div>
          </Card>

          {err ? <p className="text-sm font-medium text-pf-danger" role="alert">{err}</p> : null}

          {visible.length === 0 ? (
            <Card><EmptyState title={tab === "pendientes" ? "Sin visitas pendientes" : "Aún no hay visitados hoy"} description={tab === "pendientes" ? "Todos los clientes de este filtro ya fueron visitados hoy." : "Los clientes con pago o gestión registrada hoy aparecerán aquí."} icon={<Route className="h-5 w-5" strokeWidth={2} aria-hidden />} /></Card>
          ) : (
            <div className="space-y-2 pf-stagger">
              {visible.map((item, index) => {
                const moroso = item.semanasAtraso > 0;
                return (
                  <Card key={item.cliente.id} className="overflow-hidden p-0">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        className="pf-list-row-hover flex min-w-0 flex-1 items-start gap-3 p-3 text-left"
                        onClick={() => navigate(`/cobranza/${item.cliente.id}`)}
                        aria-label={`Gestionar a ${item.cliente.nombre}`}
                      >
                        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${moroso ? "bg-pf-danger-soft text-pf-danger" : "bg-pf-primary-soft text-pf-primary-hover"}`}>
                          <UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-extrabold ${moroso ? "text-pf-danger" : "text-pf-text"}`}>{item.cliente.nombre}</span>
                          <span className="mt-0.5 flex min-w-0 items-start gap-1.5 text-xs text-pf-muted">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                            <span className="min-w-0 break-words">{[item.cliente.direccion, item.cliente.colonia && `Col. ${item.cliente.colonia}`].filter(Boolean).join(" · ") || "Sin dirección"}</span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-end justify-between gap-2">
                            <span>
                              {item.promesa ? (
                                <>
                                  <span className="block text-xs font-semibold text-pf-muted">Monto prometido:</span>
                                  <span className="block text-lg font-black tabular-nums text-pf-warning">{formatMoney("L", item.promesa.monto)}</span>
                                  <span className="flex items-center gap-1 text-[11px] font-semibold text-pf-warning">
                                    <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                    Para el {formatDateOnly(item.promesa.fecha)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="block text-xs font-semibold text-pf-muted">Pago sugerido:</span>
                                  <span className="block text-lg font-black tabular-nums text-pf-danger">{formatMoney("L", item.pagoSugerido)}</span>
                                </>
                              )}
                            </span>
                            {moroso ? (
                              <span className="rounded-full bg-pf-danger-soft px-2.5 py-1 text-xs font-bold text-pf-danger">
                                {item.semanasAtraso} {item.semanasAtraso === 1 ? "semana" : "semanas"} de atraso
                              </span>
                            ) : (
                              <span className="rounded-full bg-pf-success-soft px-2.5 py-1 text-xs font-bold text-pf-success">Al día</span>
                            )}
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-col items-center justify-center gap-1 border-l border-pf-border-soft px-2 py-2">
                        {orden === "manual" ? (
                          <>
                            <Button type="button" variant="ghost" className="min-h-0 rounded-lg p-2" aria-label={`Subir a ${item.cliente.nombre}`} disabled={index === 0 || Boolean(movingId)} onClick={() => void mover(index, -1)}>
                              <ChevronUp className="h-5 w-5" strokeWidth={2} aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" className="min-h-0 rounded-lg p-2" aria-label={`Bajar a ${item.cliente.nombre}`} disabled={index === visible.length - 1 || Boolean(movingId)} onClick={() => void mover(index, 1)}>
                              <ChevronDown className="h-5 w-5" strokeWidth={2} aria-hidden />
                            </Button>
                          </>
                        ) : item.cliente.telefono ? (
                          <a
                            href={`tel:${item.cliente.telefono}`}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-pf-primary transition-colors hover:bg-pf-primary-soft"
                            aria-label={`Llamar a ${item.cliente.nombre}`}
                          >
                            <Phone className="h-5 w-5" strokeWidth={2} aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
