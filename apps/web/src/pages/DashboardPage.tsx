import { AlertTriangle, ArrowRight, Banknote, BarChart3, CheckCircle2, FilePlus2, HandCoins, Landmark, TrendingUp, Users, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Card } from "../components/ui";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import { refreshPortfolioStatuses } from "../lib/paymentService";

const SYM = "L";

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "primary" | "info" | "warning" | "success" | "danger";
  to?: string;
}) {
  const accentMap = {
    primary: {
      surface: "border-pf-primary-soft from-pf-surface-elevated via-pf-surface-elevated to-pf-primary-soft/55",
      bar: "from-pf-primary via-pf-primary-mid to-pf-primary-hover",
      halo: "bg-pf-primary-soft/70",
      chip: "border-pf-primary-soft bg-pf-primary-soft/75 text-pf-primary-hover",
      arrow: "border-pf-primary-soft bg-pf-primary-soft/65 text-pf-primary-hover",
    },
    info: {
      surface: "border-pf-info-soft from-pf-surface-elevated via-pf-surface-elevated to-pf-info-soft/55",
      bar: "from-pf-info/65 via-pf-info to-pf-info/75",
      halo: "bg-pf-info-soft/70",
      chip: "border-pf-info-soft bg-pf-info-soft/75 text-pf-info",
      arrow: "border-pf-info-soft bg-pf-info-soft/65 text-pf-info",
    },
    warning: {
      surface: "border-pf-warning-soft from-pf-surface-elevated via-pf-surface-elevated to-pf-warning-soft/55",
      bar: "from-pf-warning/65 via-pf-warning to-pf-warning/75",
      halo: "bg-pf-warning-soft/70",
      chip: "border-pf-warning-soft bg-pf-warning-soft/75 text-pf-warning",
      arrow: "border-pf-warning-soft bg-pf-warning-soft/65 text-pf-warning",
    },
    success: {
      surface: "border-pf-success-soft from-pf-surface-elevated via-pf-surface-elevated to-pf-success-soft/55",
      bar: "from-pf-success/65 via-pf-success to-pf-success/75",
      halo: "bg-pf-success-soft/70",
      chip: "border-pf-success-soft bg-pf-success-soft/75 text-pf-success",
      arrow: "border-pf-success-soft bg-pf-success-soft/65 text-pf-success",
    },
    danger: {
      surface: "border-pf-danger-soft from-pf-surface-elevated via-pf-surface-elevated to-pf-danger-soft/55",
      bar: "from-pf-danger/65 via-pf-danger to-pf-danger/75",
      halo: "bg-pf-danger-soft/70",
      chip: "border-pf-danger-soft bg-pf-danger-soft/75 text-pf-danger",
      arrow: "border-pf-danger-soft bg-pf-danger-soft/65 text-pf-danger",
    },
  };
  const style = accentMap[accent];

  const content = (
    <div
      className={`relative h-full min-h-[118px] overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 pt-4 shadow-[var(--pf-shadow-warm-md)] transition duration-200 motion-safe:active:scale-[0.985] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none hover:shadow-lg sm:p-4 sm:pt-[1.125rem] ${style.surface}`}
    >
      <div className={`absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-gradient-to-r sm:inset-x-4 ${style.bar}`} aria-hidden />
      <div className={`pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-full opacity-60 blur-2xl ${style.halo}`} aria-hidden />

      <div className="relative flex h-full min-w-0 flex-col">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold uppercase leading-[1.15] tracking-[0.09em] text-pf-muted sm:text-[11px]">
            {label}
          </p>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-sm sm:h-9 sm:w-9 ${style.chip}`} aria-hidden>
            <Icon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" strokeWidth={1.9} />
          </div>
        </div>

        <p
          className="mt-2 truncate text-[clamp(1.05rem,4.8vw,1.5rem)] font-black leading-none tracking-[-0.035em] tabular-nums text-pf-text"
          title={value}
        >
          {value}
        </p>

        <div className="mt-auto flex min-w-0 items-end justify-between gap-1 pt-2">
          {sub ? <p className="min-w-0 truncate text-[11px] font-medium leading-tight text-pf-text-tertiary sm:text-xs">{sub}</p> : <span />}
          {to ? (
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none sm:h-6 sm:w-6 ${style.arrow}`} aria-hidden>
              <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.2} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="group block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary-hover"
      >
        {content}
      </Link>
    );
  }
  return content;
}

type Kpis = {
  clientesActivos: number;
  totalPrestado: number;
  prestamosCount: number;
  porCobrar: number;
  conSaldoCount: number;
  enMora: number;
  moraCount: number;
  cobradoHoy: number;
  pagosHoyCount: number;
};

export function DashboardPage() {
  const { user } = useAuth();
  const { config } = useBusinessConfig();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr("");
      setKpis(null);
      await refreshPortfolioStatuses();
      const fechaHonduras = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Tegucigalpa",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const inicioHoyMs = new Date(`${fechaHonduras}T00:00:00-06:00`).getTime();
      const inicioHoy = new Date(inicioHoyMs).toISOString();
      const inicioManana = new Date(inicioHoyMs + 24 * 60 * 60 * 1000).toISOString();
      const [pr, pa, cl] = await Promise.all([
        supabase.from("prestamos").select("monto,saldo,estado"),
        supabase.from("pagos").select("monto").gte("fecha", inicioHoy).lt("fecha", inicioManana),
        supabase.from("clientes").select("*"),
      ]);
      if (pr.error) throw new Error(pr.error.message);
      if (pa.error) throw new Error(pa.error.message);
      if (cl.error) throw new Error(cl.error.message);
      // ponytail: agregados en el cliente; pasar a una vista SQL cuando la cartera pase de unos miles de préstamos
      const vivos = pr.data.filter((p) => p.estado !== "cancelado");
      const conSaldo = vivos.filter((p) => p.estado === "activo" || p.estado === "al_dia" || p.estado === "en_mora");
      const mora = vivos.filter((p) => p.estado === "en_mora");
      if (cancelled) return;
      setKpis({
        clientesActivos: cl.data.filter((customer) => !customer.estado || customer.estado === "activo").length,
        totalPrestado: vivos.reduce((s, p) => s + Number(p.monto), 0),
        prestamosCount: vivos.length,
        porCobrar: conSaldo.reduce((s, p) => s + Number(p.saldo), 0),
        conSaldoCount: conSaldo.length,
        enMora: mora.reduce((s, p) => s + Number(p.saldo), 0),
        moraCount: mora.length,
        cobradoHoy: pa.data.reduce((s, p) => s + Number(p.monto), 0),
        pagosHoyCount: pa.data.length,
      });
    }
    load().catch(() => {
      if (!cancelled) setErr("No pudimos cargar el resumen. Revise la conexión e intente de nuevo.");
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-2 py-4 pf-safe-page md:px-4 md:py-6">
      {/* Encabezado */}
      <Card className="pf-glass-card-panel relative overflow-hidden p-5 md:p-6">
        <div className="pf-dashboard-card-glow" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="pf-logo-fallback-ring !rounded-xl !p-2 shrink-0">
              <BrandLogo size={40} withShadow className="opacity-90" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight text-pf-text md:text-xl">
                {config?.nombre_negocio || "MultiPréstamos"}
              </h1>
              <p className="text-sm text-pf-text-tertiary">
                {config?.nombre_propietario || "Cartera de préstamos"}
              </p>
              <p className="mt-0.5 text-xs text-pf-muted">{user?.email}</p>
            </div>
          </div>
        </div>
      </Card>

      {err ? (
        <Card className="pf-glass-card-panel p-5 text-center text-sm text-pf-danger" role="alert">
          <p>{err}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setReloadKey((value) => value + 1)}>
            Reintentar
          </Button>
        </Card>
      ) : kpis === null ? (
        <Card className="pf-glass-card-panel p-8 text-center text-sm text-pf-muted">Cargando…</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            label="Clientes activos"
            value={String(kpis.clientesActivos)}
            sub="Fichas habilitadas"
            icon={Users}
            accent="primary"
            to="/clientes"
          />
          <KpiCard
            label="Préstamos activos"
            value={String(kpis.conSaldoCount)}
            sub="Con saldo pendiente"
            icon={WalletCards}
            accent="info"
            to="/prestamos"
          />
          <KpiCard
            label="Total prestado"
            value={formatMoney(SYM, kpis.totalPrestado)}
            sub={`${kpis.prestamosCount} préstamo${kpis.prestamosCount !== 1 ? "s" : ""}`}
            icon={HandCoins}
            accent="primary"
            to="/prestamos"
          />
          <KpiCard
            label="Por cobrar"
            value={formatMoney(SYM, kpis.porCobrar)}
            sub={`${kpis.conSaldoCount} con saldo`}
            icon={Landmark}
            accent="info"
            to="/prestamos"
          />
          <KpiCard
            label="En mora"
            value={formatMoney(SYM, kpis.enMora)}
            sub={`${kpis.moraCount} préstamo${kpis.moraCount !== 1 ? "s" : ""}`}
            icon={kpis.moraCount > 0 ? AlertTriangle : CheckCircle2}
            accent={kpis.moraCount > 0 ? "danger" : "success"}
            to="/prestamos"
          />
          <KpiCard
            label="Cobrado hoy"
            value={formatMoney(SYM, kpis.cobradoHoy)}
            sub={`${kpis.pagosHoyCount} pago${kpis.pagosHoyCount !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            accent="success"
            to="/pagos"
          />
        </div>
      )}

      {/* Acceso rápido */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-pf-muted">Acceso rápido</p>
        <div className="grid max-w-5xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { to: "/prestamos/nuevo", label: "Nuevo préstamo", icon: FilePlus2, primary: true },
            { to: "/pagos/nuevo", label: "Registrar pago", icon: Banknote, primary: false },
            { to: "/prestamos", label: "Préstamos", icon: WalletCards, primary: false },
            { to: "/clientes", label: "Clientes", icon: Users, primary: false },
            { to: "/reportes", label: "Reportes", icon: BarChart3, primary: false },
          ].map(
            ({ to, label, icon: Icon, primary }) => (
              <Link
                key={to}
                to={to}
                className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold shadow-sm transition active:scale-[0.98] touch-manipulation hover:shadow-md ${
                  primary
                    ? "pf-btn-primary-gradient border-transparent !rounded-xl"
                    : "border-pf-border-soft bg-pf-surface-elevated text-pf-text hover:bg-pf-surface-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                {label}
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
