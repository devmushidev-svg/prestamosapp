import { AlertTriangle, ArrowRight, HandCoins, Landmark, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Card } from "../components/ui";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";

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
    primary: "from-pf-primary-soft/70 to-pf-surface-elevated border-pf-primary-soft text-pf-primary-hover",
    info: "from-pf-info-soft/70 to-pf-surface-elevated border-pf-info-soft text-pf-info",
    warning: "from-pf-warning-soft/70 to-pf-surface-elevated border-pf-warning-soft text-pf-warning",
    success: "from-pf-success-soft/70 to-pf-surface-elevated border-pf-success-soft text-pf-success",
    danger: "from-pf-danger-soft/70 to-pf-surface-elevated border-pf-danger-soft text-pf-danger",
  };

  const content = (
    <div
      className={`flex items-start gap-3 rounded-xl border bg-gradient-to-br p-4 shadow-sm transition hover:shadow-md ${accentMap[accent]}`}
    >
      {/* En móvil el espacio es para la cifra; el icono vuelve en ≥sm. */}
      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pf-surface-elevated/80 shadow-sm sm:flex">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-pf-muted">{label}</p>
        <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold tracking-tight tabular-nums text-pf-text sm:text-lg">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-pf-text-tertiary">{sub}</p>}
      </div>
      {to && <ArrowRight className="mt-2.5 hidden h-4 w-4 shrink-0 text-pf-muted sm:block" strokeWidth={2} />}
    </div>
  );

  if (to) return <Link to={to} className="block">{content}</Link>;
  return content;
}

type Kpis = {
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
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const inicioManana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();
      const [pr, pa] = await Promise.all([
        supabase.from("prestamos").select("monto,saldo,estado"),
        supabase.from("pagos").select("monto").gte("fecha", inicioHoy).lt("fecha", inicioManana),
      ]);
      if (pr.error) throw new Error(pr.error.message);
      if (pa.error) throw new Error(pa.error.message);
      // ponytail: agregados en el cliente; pasar a una vista SQL cuando la cartera pase de unos miles de préstamos
      const vivos = pr.data.filter((p) => p.estado !== "cancelado");
      const conSaldo = vivos.filter((p) => p.estado === "activo" || p.estado === "al_dia" || p.estado === "en_mora");
      const mora = vivos.filter((p) => p.estado === "en_mora");
      if (cancelled) return;
      setKpis({
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
              <h1 className="text-lg font-extrabold tracking-tight text-pf-text md:text-xl">MultiPréstamos</h1>
              <p className="text-sm text-pf-text-tertiary">Cartera de préstamos</p>
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
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total prestado"
            value={formatMoney(SYM, kpis.totalPrestado)}
            sub={`${kpis.prestamosCount} préstamo${kpis.prestamosCount !== 1 ? "s" : ""}`}
            icon={HandCoins}
            accent="primary"
          />
          <KpiCard
            label="Por cobrar"
            value={formatMoney(SYM, kpis.porCobrar)}
            sub={`${kpis.conSaldoCount} con saldo`}
            icon={Landmark}
            accent="info"
          />
          <KpiCard
            label="En mora"
            value={formatMoney(SYM, kpis.enMora)}
            sub={`${kpis.moraCount} préstamo${kpis.moraCount !== 1 ? "s" : ""}`}
            icon={AlertTriangle}
            accent={kpis.moraCount > 0 ? "danger" : "success"}
          />
          <KpiCard
            label="Cobrado hoy"
            value={formatMoney(SYM, kpis.cobradoHoy)}
            sub={`${kpis.pagosHoyCount} pago${kpis.pagosHoyCount !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            accent="success"
          />
        </div>
      )}

      {/* Acceso rápido — se agregan Nuevo préstamo / Pagos / Reportes conforme avanza el MVP */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-pf-muted">Acceso rápido</p>
        <div className="grid max-w-sm grid-cols-1 gap-2">
          {[{ to: "/clientes", label: "Clientes", icon: Users, primary: true }].map(
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
