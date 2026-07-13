import { CalendarDays, Eye, FilePlus2, HandCoins, Search, UserRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, PaginationBar, Select } from "../components/ui";
import { formatDateOnly, formatLoanNumber, formatMoney } from "../lib/format";
import { FREQUENCY_LABELS } from "../lib/loanCalculator";
import { listLoans, type PrestamoConCliente } from "../lib/loanService";
import type { EstadoPrestamo } from "../types";

const PAGE_SIZE = 12;

const STATUS_OPTIONS: { value: EstadoPrestamo | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "activo", label: "Activos" },
  { value: "al_dia", label: "Al día" },
  { value: "en_mora", label: "En mora" },
  { value: "pagado", label: "Pagados" },
  { value: "cancelado", label: "Cancelados" },
];

export function LoansPage() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState<PrestamoConCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EstadoPrestamo | "">("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLoans(await listLoans());
    } catch {
      setError("No pudimos cargar los préstamos. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    return loans.filter((loan) => {
      if (status && loan.estado !== status) return false;
      if (!term) return true;
      return [loan.cliente?.nombre, loan.cliente?.identidad, loan.cliente?.telefono, formatLoanNumber(loan.numero, loan.id)]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("es-HN").includes(term));
    });
  }, [loans, search, status]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeBalance = filtered
    .filter((loan) => loan.estado !== "pagado" && loan.estado !== "cancelado")
    .reduce((sum, loan) => sum + loan.saldo, 0);

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Préstamos" constrained>
          <p className="pf-page-lead">Controle capital, saldo, fechas y estado de cada préstamo.</p>
          <p className="pf-page-lead-muted">Abra un préstamo para consultar su tabla completa de cuotas.</p>
        </PageHero>
        <Button
          type="button"
          className="min-h-[52px] w-full shrink-0 shadow-lg sm:min-h-[48px] sm:w-auto"
          onClick={() => navigate("/prestamos/nuevo")}
        >
          <FilePlus2 className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          Nuevo préstamo
        </Button>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Buscar cliente, identidad, teléfono o código" htmlFor="loan-search" compact>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pf-muted" strokeWidth={2} aria-hidden />
              <Input
                id="loan-search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ej. Ana López o 0801…"
              />
            </div>
          </Field>
          <Field label="Estado" htmlFor="loan-status" compact>
            <Select
              id="loan-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as EstadoPrestamo | "")}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "todos"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="pf-table-toolbar">
          <div className="flex flex-wrap gap-1.5">
            <span className="pf-filter-chip">{filtered.length} préstamo(s)</span>
            <span className="pf-filter-chip">Saldo activo filtrado: {formatMoney("L", activeBalance)}</span>
            {status ? <span className="pf-filter-chip">Estado filtrado</span> : null}
          </div>
          <p className="text-xs font-medium text-pf-text-soft">{visible.length} visibles en esta página</p>
        </div>
      </Card>

      {error ? (
        <Card role="alert" aria-live="assertive">
          <EmptyState
            icon={<WalletCards className="h-5 w-5" strokeWidth={2} aria-hidden />}
            title="No se pudieron cargar los préstamos"
            description={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">
          Cargando préstamos…
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />}
            title={loans.length === 0 ? "Aún no hay préstamos" : "No hay préstamos con esos filtros"}
            description={
              loans.length === 0
                ? "Cree el primer préstamo para generar automáticamente su calendario de cuotas."
                : "Cambie la búsqueda o el estado para ampliar los resultados."
            }
            action={
              loans.length === 0 ? (
                <Button type="button" onClick={() => navigate("/prestamos/nuevo")}>
                  <FilePlus2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Nuevo préstamo
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatus("");
                  }}
                >
                  Limpiar filtros
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {visible.map((loan) => (
              <Card key={loan.id} className="space-y-3 border-white/70 bg-white/90 p-3 shadow-md shadow-stone-900/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-pf-text">{loan.cliente?.nombre ?? "Cliente no disponible"}</p>
                    <p className="mt-0.5 font-mono text-[11px] font-bold text-pf-primary-hover">{formatLoanNumber(loan.numero, loan.id)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-pf-muted">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      Inicio {formatDateOnly(loan.fecha_inicio)}
                    </p>
                  </div>
                  <LoanStatusBadge status={loan.estado} />
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-pf-surface-soft p-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Capital</p>
                    <p className="mt-0.5 font-bold tabular-nums text-pf-text">{formatMoney("L", loan.monto)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Saldo</p>
                    <p className="mt-0.5 font-extrabold tabular-nums text-pf-text">{formatMoney("L", loan.saldo)}</p>
                  </div>
                </div>
                <p className="text-xs font-medium text-pf-text-tertiary">
                  {loan.plazo} cuotas · {FREQUENCY_LABELS[loan.frecuencia]} · {loan.tasa_interes}% fijo total
                </p>
                <Button type="button" variant="secondary" className="w-full" onClick={() => navigate(`/prestamos/${loan.id}`)}>
                  <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Ver préstamo y cuotas
                </Button>
              </Card>
            ))}
            {filtered.length > PAGE_SIZE ? (
              <Card className="overflow-hidden p-0">
                <PaginationBar page={page} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="préstamos" onPageChange={setPage} />
              </Card>
            ) : null}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="pf-table-thead text-left">
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Inicio</th>
                    <th className="p-3 text-right">Capital</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="pf-table-body">
                  {visible.map((loan) => (
                    <tr key={loan.id} className="pf-table-row pf-table-row-hoverable last:border-b-0">
                      <td className="p-3">
                        <p className="flex items-center gap-2 font-bold text-pf-text">
                          <UserRound className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                          <span className="max-w-[210px] truncate">{loan.cliente?.nombre ?? "Cliente no disponible"}</span>
                        </p>
                        <p className="mt-0.5 pl-6 font-mono text-[11px] text-pf-muted">{formatLoanNumber(loan.numero, loan.id)}</p>
                      </td>
                      <td className="p-3 whitespace-nowrap text-pf-text-secondary">{formatDateOnly(loan.fecha_inicio)}</td>
                      <td className="p-3 whitespace-nowrap text-right font-medium tabular-nums">{formatMoney("L", loan.monto)}</td>
                      <td className="p-3 whitespace-nowrap text-pf-text-secondary">
                        {loan.plazo} · {FREQUENCY_LABELS[loan.frecuencia]}
                      </td>
                      <td className="p-3 whitespace-nowrap text-right font-extrabold tabular-nums text-pf-text">
                        {formatMoney("L", loan.saldo)}
                      </td>
                      <td className="p-3"><LoanStatusBadge status={loan.estado} /></td>
                      <td className="p-3 text-right">
                        <Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => navigate(`/prestamos/${loan.id}`)}>
                          <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="préstamos" onPageChange={setPage} />
          </Card>
        </>
      )}
    </div>
  );
}
