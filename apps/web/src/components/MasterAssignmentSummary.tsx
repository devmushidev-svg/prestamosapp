import { BriefcaseBusiness, Landmark, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listCustomers } from "../lib/customerService";
import { formatLoanNumber, formatMoney } from "../lib/format";
import type { PortfolioReportRow } from "../lib/reportService";
import type { Cliente, Profile } from "../types";
import { Button, Card, Modal } from "./ui";

type AssignmentSummary = {
  id: string;
  profile: Profile | null;
  customers: number;
  activeCustomers: number;
  activeLoans: number;
  managedBalance: number;
  customerRows: Cliente[];
  activeLoanRows: PortfolioReportRow[];
};

const ACTIVE_LOAN_STATUSES = new Set(["activo", "al_dia", "en_mora"]);

function fullName(profile: Profile | null) {
  if (!profile) return "Responsable no disponible";
  return [profile.nombre, profile.apellido].filter(Boolean).join(" ");
}

function buildSummary(
  profiles: Profile[],
  customers: Cliente[],
  reportRows: PortfolioReportRow[],
): AssignmentSummary[] {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const ownerIds = new Set(profilesById.keys());
  customers.forEach((customer) => ownerIds.add(customer.prestamista_id));
  reportRows.forEach((row) => ownerIds.add(row.prestamo.prestamista_id));

  return Array.from(ownerIds)
    .filter(Boolean)
    .map((id) => {
      const assignedCustomers = customers.filter((customer) => customer.prestamista_id === id);
      const activeLoans = reportRows.filter(
        (row) => row.prestamo.prestamista_id === id && ACTIVE_LOAN_STATUSES.has(row.prestamo.estado),
      );
      return {
        id,
        profile: profilesById.get(id) ?? null,
        customers: assignedCustomers.length,
        activeCustomers: assignedCustomers.filter((customer) => customer.estado !== "cancelado").length,
        activeLoans: activeLoans.length,
        managedBalance: activeLoans.reduce((total, row) => total + row.pendiente, 0),
        customerRows: assignedCustomers.sort((left, right) => left.nombre.localeCompare(right.nombre, "es-HN")),
        activeLoanRows: activeLoans,
      };
    })
    .sort((left, right) => {
      if (left.profile?.rol === "admin" && right.profile?.rol !== "admin") return -1;
      if (left.profile?.rol !== "admin" && right.profile?.rol === "admin") return 1;
      return fullName(left.profile).localeCompare(fullName(right.profile), "es-HN");
    });
}

function RoleBadges({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return <span className="rounded-full bg-pf-warning-soft px-2.5 py-1 text-[10px] font-bold text-pf-warning">Revisar asignación</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className="rounded-full bg-pf-info-soft px-2.5 py-1 text-[10px] font-bold text-pf-info">
        {profile.rol === "admin" ? "Cuenta maestra" : "Prestamista"}
      </span>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${profile.activo ? "bg-pf-success-soft text-pf-success" : "bg-pf-danger-soft text-pf-danger"}`}>
        {profile.activo ? "Activo" : "Inactivo"}
      </span>
    </span>
  );
}

export function MasterAssignmentSummary({
  profiles,
  reportRows,
  onViewPortfolio,
}: {
  profiles: Profile[];
  reportRows: PortfolioReportRow[];
  onViewPortfolio: (prestamistaId: string) => void;
}) {
  const [customers, setCustomers] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOwnerId, setDetailOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listCustomers()
      .then((nextCustomers) => {
        if (!active) return;
        setCustomers(nextCustomers);
      })
      .catch(() => {
        if (active) setError("No pudimos cargar la distribución de la cartera.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(
    () => buildSummary(profiles, customers, reportRows),
    [customers, profiles, reportRows],
  );
  const totals = useMemo(() => summary.reduce(
    (current, row) => ({
      customers: current.customers + row.customers,
      activeLoans: current.activeLoans + row.activeLoans,
      managedBalance: current.managedBalance + row.managedBalance,
    }),
    { customers: 0, activeLoans: 0, managedBalance: 0 },
  ), [summary]);
  const detailOwner = summary.find((row) => row.id === detailOwnerId) ?? null;

  return (
    <Card className="space-y-4 p-4 print:hidden sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
              <UsersRound className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-pf-text">Cartera por prestamista</h2>
              <p className="mt-0.5 text-xs text-pf-muted">Asignaciones actuales visibles para la cuenta maestra.</p>
            </div>
          </div>
        </div>
        {!loading && !error ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Totales de la distribución">
            <span className="pf-filter-chip">{totals.customers} cliente(s)</span>
            <span className="pf-filter-chip">{totals.activeLoans} préstamo(s) activo(s)</span>
            <span className="pf-filter-chip">{formatMoney("L", totals.managedBalance)} por cobrar</span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-xl border border-pf-border-soft bg-pf-surface-elevated px-4 py-5 text-center text-sm font-medium text-pf-muted" aria-live="polite">
          Cargando distribución de cartera…
        </p>
      ) : error ? (
        <p className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 px-4 py-3 text-sm font-medium text-pf-danger" role="alert">{error}</p>
      ) : summary.length === 0 ? (
        <p className="rounded-xl border border-pf-border-soft bg-pf-surface-elevated px-4 py-5 text-center text-sm text-pf-muted">
          No hay usuarios para mostrar.
        </p>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {summary.map((row) => (
              <article key={row.id} className="rounded-2xl border border-pf-border-soft bg-pf-surface-elevated p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-pf-text">{fullName(row.profile)}</strong>
                    <div className="mt-1.5"><RoleBadges profile={row.profile} /></div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => setDetailOwnerId(row.id)}>Detalle</Button>
                    <Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => onViewPortfolio(row.id)}>Ver cartera</Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-pf-border-soft pt-3">
                  <div><dt className="text-[9px] font-bold uppercase tracking-wide text-pf-muted">Clientes</dt><dd className="mt-1 text-sm font-extrabold tabular-nums text-pf-text">{row.customers}</dd><dd className="text-[9px] text-pf-muted">{row.activeCustomers} vigentes</dd></div>
                  <div><dt className="text-[9px] font-bold uppercase tracking-wide text-pf-muted">Préstamos</dt><dd className="mt-1 text-sm font-extrabold tabular-nums text-pf-text">{row.activeLoans}</dd><dd className="text-[9px] text-pf-muted">activos</dd></div>
                  <div className="text-right"><dt className="text-[9px] font-bold uppercase tracking-wide text-pf-muted">Saldo</dt><dd className="mt-1 text-sm font-extrabold tabular-nums text-pf-primary-hover">{formatMoney("L", row.managedBalance)}</dd><dd className="text-[9px] text-pf-muted">por cobrar</dd></div>
                </dl>
              </article>
            ))}
          </div>

          <div className="max-md:hidden overflow-hidden rounded-xl border border-pf-border-soft">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="pf-table-thead">
                  <tr>
                    <th className="p-3">Responsable</th>
                    <th className="p-3">Acceso</th>
                    <th className="p-3 text-right">Clientes asignados</th>
                    <th className="p-3 text-right">Préstamos activos</th>
                    <th className="p-3 text-right">Saldo administrado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="pf-table-body">
                  {summary.map((row) => (
                    <tr key={row.id} className="pf-table-row">
                      <td className="p-3">
                        <span className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pf-primary-soft text-pf-primary-hover"><BriefcaseBusiness className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                          <strong className="text-pf-text">{fullName(row.profile)}</strong>
                        </span>
                      </td>
                      <td className="p-3"><RoleBadges profile={row.profile} /></td>
                      <td className="p-3 text-right"><strong className="tabular-nums text-pf-text">{row.customers}</strong><span className="ml-1 text-[10px] text-pf-muted">({row.activeCustomers} vigentes)</span></td>
                      <td className="p-3 text-right font-bold tabular-nums text-pf-text">{row.activeLoans}</td>
                      <td className="p-3 text-right font-extrabold tabular-nums text-pf-primary-hover">{formatMoney("L", row.managedBalance)}</td>
                      <td className="p-3 text-right">
                        <span className="inline-flex gap-1.5">
                          <Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => setDetailOwnerId(row.id)}>Detalle</Button>
                          <Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => onViewPortfolio(row.id)}><Landmark className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Ver cartera</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        open={Boolean(detailOwner)}
        title={detailOwner ? `Asignaciones de ${fullName(detailOwner.profile)}` : "Asignaciones"}
        onClose={() => setDetailOwnerId(null)}
      >
        {detailOwner ? (
          <div className="space-y-5">
            <section>
              <h3 className="font-bold text-pf-text">Clientes asignados ({detailOwner.customers})</h3>
              <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {detailOwner.customerRows.length === 0 ? (
                  <p className="rounded-xl bg-pf-surface-soft px-3 py-2.5 text-sm text-pf-muted">No tiene clientes asignados.</p>
                ) : detailOwner.customerRows.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-elevated px-3 py-2.5">
                    <strong className="min-w-0 truncate text-sm text-pf-text">{customer.nombre}</strong>
                    <span className="shrink-0 text-[10px] font-bold uppercase text-pf-muted">{customer.estado}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="font-bold text-pf-text">Préstamos activos asignados ({detailOwner.activeLoans})</h3>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {detailOwner.activeLoanRows.length === 0 ? (
                  <p className="rounded-xl bg-pf-surface-soft px-3 py-2.5 text-sm text-pf-muted">No tiene préstamos activos asignados.</p>
                ) : detailOwner.activeLoanRows.map((row) => (
                  <div key={row.prestamo.id} className="flex items-center justify-between gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-elevated px-3 py-2.5">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm text-pf-text">{row.prestamo.cliente?.nombre ?? "Cliente no disponible"}</strong>
                      <span className="block font-mono text-[10px] text-pf-muted">{formatLoanNumber(row.prestamo.numero, row.prestamo.id)}</span>
                    </span>
                    <strong className="shrink-0 text-sm tabular-nums text-pf-primary-hover">{formatMoney("L", row.pendiente)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-end border-t border-pf-border-soft pt-4">
              <Button type="button" onClick={() => {
                onViewPortfolio(detailOwner.id);
                setDetailOwnerId(null);
              }}>
                <Landmark className="h-4 w-4" strokeWidth={2} aria-hidden />Ver cartera filtrada
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
