import { ArrowLeft, CalendarClock, FilePlus2, HandCoins, Percent, UserPlus, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { InstallmentSchedule } from "../components/InstallmentSchedule";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Select } from "../components/ui";
import { formatDateOnly, formatMoney } from "../lib/format";
import {
  calculateFixedLoan,
  FREQUENCY_LABELS,
  hondurasToday,
  type FixedLoanCalculation,
} from "../lib/loanCalculator";
import { createFixedLoan, listCustomersForLoan, type ClienteResumen } from "../lib/loanService";
import type { FrecuenciaPago } from "../types";

type LoanForm = {
  clienteId: string;
  capital: string;
  tasaInteres: string;
  plazo: string;
  frecuencia: FrecuenciaPago;
  fechaInicio: string;
};

const INITIAL_FORM: LoanForm = {
  clienteId: "",
  capital: "",
  tasaInteres: "10",
  plazo: "12",
  frecuencia: "mensual",
  fechaInicio: hondurasToday(),
};

const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function getCalculation(form: LoanForm): FixedLoanCalculation | null {
  if (!form.capital || !form.tasaInteres || !form.plazo || !form.fechaInicio) return null;
  try {
    return calculateFixedLoan({
      capital: Number(form.capital),
      tasaInteres: Number(form.tasaInteres),
      plazo: Number(form.plazo),
      frecuencia: form.frecuencia,
      fechaInicio: form.fechaInicio,
    });
  } catch {
    return null;
  }
}

export function NewLoanPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<ClienteResumen[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [form, setForm] = useState<LoanForm>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomersError("");
    try {
      setCustomers(await listCustomersForLoan());
    } catch {
      setCustomersError("No pudimos cargar los clientes. Revise la conexión e intente de nuevo.");
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const calculation = useMemo(() => getCalculation(form), [form]);
  const selectedCustomer = customers.find((customer) => customer.id === form.clienteId) ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.clienteId) {
      setError("Seleccione un cliente.");
      return;
    }

    let checkedCalculation: FixedLoanCalculation;
    try {
      checkedCalculation = calculateFixedLoan({
        capital: Number(form.capital),
        tasaInteres: Number(form.tasaInteres),
        plazo: Number(form.plazo),
        frecuencia: form.frecuencia,
        fechaInicio: form.fechaInicio,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revise los datos del préstamo.");
      return;
    }

    setSaving(true);
    try {
      const result = await createFixedLoan({
        solicitudId: requestIdRef.current,
        clienteId: form.clienteId,
        capital: checkedCalculation.capital,
        tasaInteres: checkedCalculation.tasaInteres,
        plazo: Number(form.plazo),
        frecuencia: form.frecuencia,
        fechaInicio: form.fechaInicio,
      });
      navigate(`/prestamos/${result.id}`, { replace: true, state: { created: true } });
    } catch (cause) {
      const knownMessage = cause instanceof Error && (
        cause.message.startsWith("Falta aplicar") || cause.message.startsWith("Supabase devolvió")
      );
      setError(
        knownMessage
          ? cause.message
          : "No pudimos crear el préstamo. Revise la conexión e intente de nuevo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4 pf-safe-page max-md:pb-24" onSubmit={(event) => void submit(event)}>
      <PageHero
        title="Nuevo préstamo"
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate("/prestamos")}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Volver a préstamos
          </Button>
        }
      >
        <p className="pf-page-lead">Defina el préstamo y revise las cuotas antes de guardarlo.</p>
        <p className="pf-page-lead-muted">Interés fijo total: se aplica una sola vez sobre el capital.</p>
      </PageHero>

      {customersError ? (
        <Card role="alert" aria-live="assertive">
          <EmptyState
            icon={<WalletCards className="h-5 w-5" strokeWidth={2} aria-hidden />}
            title="No se pudieron cargar los clientes"
            description={customersError}
            action={
              <Button type="button" variant="secondary" onClick={() => void loadCustomers()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : !customersLoading && customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />}
            title="Primero registre un cliente"
            description="Todo préstamo debe quedar asociado a una persona con sus datos de contacto."
            action={
              <Button type="button" onClick={() => navigate("/clientes")}>
                <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
                Ir a Clientes
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)] lg:items-start">
          <Card className="space-y-5 p-4 sm:p-5 lg:col-start-1 lg:row-start-1">
            <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
                <HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h2 className="font-bold text-pf-text">Condiciones del préstamo</h2>
                <p className="text-xs text-pf-muted">Los campos actualizan la vista previa al instante.</p>
              </div>
            </div>

            <Field label="Cliente *" htmlFor="loan-customer">
              <Select
                id="loan-customer"
                data-autofocus="true"
                value={form.clienteId}
                disabled={customersLoading}
                onChange={(event) => setForm((current) => ({ ...current, clienteId: event.target.value }))}
                required
              >
                <option value="">{customersLoading ? "Cargando clientes…" : "Seleccione un cliente…"}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.nombre}{customer.identidad ? ` · ${customer.identidad}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Capital (L) *" htmlFor="loan-capital">
                <Input
                  id="loan-capital"
                  className={NUMBER_INPUT_CLASS}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="999999999999.99"
                  step="0.01"
                  value={form.capital}
                  onChange={(event) => setForm((current) => ({ ...current, capital: event.target.value }))}
                  placeholder="10,000.00"
                  required
                />
              </Field>
              <Field label="Interés fijo total (%) *" htmlFor="loan-rate">
                <Input
                  id="loan-rate"
                  className={NUMBER_INPUT_CLASS}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="9999.99"
                  step="0.01"
                  value={form.tasaInteres}
                  onChange={(event) => setForm((current) => ({ ...current, tasaInteres: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Número de cuotas *" htmlFor="loan-term">
                <Input
                  id="loan-term"
                  className={NUMBER_INPUT_CLASS}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="600"
                  step="1"
                  value={form.plazo}
                  onChange={(event) => setForm((current) => ({ ...current, plazo: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Frecuencia *" htmlFor="loan-frequency">
                <Select
                  id="loan-frequency"
                  value={form.frecuencia}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, frecuencia: event.target.value as FrecuenciaPago }))
                  }
                >
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Fecha de inicio / desembolso *" htmlFor="loan-start">
              <Input
                id="loan-start"
                type="date"
                value={form.fechaInicio}
                onChange={(event) => setForm((current) => ({ ...current, fechaInicio: event.target.value }))}
                onClick={(event) => event.currentTarget.showPicker?.()}
                required
              />
            </Field>

            <div className="rounded-xl border border-pf-info-soft bg-pf-info-soft/35 p-3 text-xs leading-relaxed text-pf-text-secondary">
              <p className="flex items-start gap-2">
                <Percent className="mt-0.5 h-4 w-4 shrink-0 text-pf-info" strokeWidth={2} aria-hidden />
                La tasa se calcula una vez sobre el capital. La primera cuota vence un período después de la fecha de inicio.
              </p>
            </div>
          </Card>

          <Card className="space-y-4 p-4 sm:p-5 lg:sticky lg:top-[11.5rem] lg:col-start-2 lg:row-start-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-pf-muted">Resumen</p>
              <h2 className="mt-1 truncate text-lg font-extrabold text-pf-text">
                {selectedCustomer?.nombre ?? "Seleccione un cliente"}
              </h2>
            </div>

            <div className="rounded-2xl border border-pf-primary-soft bg-gradient-to-br from-pf-info-soft/55 via-pf-primary-soft/45 to-pf-warning-soft/45 p-4 shadow-sm">
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3 text-pf-text-secondary">
                  <span>Capital</span>
                  <strong className="tabular-nums text-pf-text">{formatMoney("L", calculation?.capital ?? 0)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 text-pf-text-secondary">
                  <span>Interés fijo</span>
                  <strong className="tabular-nums text-pf-text">{formatMoney("L", calculation?.interes ?? 0)}</strong>
                </div>
                <div className="border-t border-pf-border-soft pt-2.5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="font-bold text-pf-text-secondary">Total a cobrar</span>
                    <strong className="whitespace-nowrap text-xl font-extrabold tabular-nums text-pf-text">
                      {formatMoney("L", calculation?.totalPagar ?? 0)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {calculation ? (
              <div className="space-y-2 rounded-xl bg-pf-surface-soft p-3 text-xs text-pf-text-secondary">
                <p className="flex justify-between gap-3">
                  <span>Plan</span>
                  <strong>{calculation.cuotas.length} cuotas · {FREQUENCY_LABELS[form.frecuencia]}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span>Primera cuota</span>
                  <strong>{formatMoney("L", calculation.cuotas[0].monto)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span>Primer vencimiento</span>
                  <strong>{formatDateOnly(calculation.cuotas[0].fechaVencimiento)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span>Última cuota</span>
                  <strong>{formatDateOnly(calculation.cuotas.at(-1)?.fechaVencimiento ?? form.fechaInicio)}</strong>
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-pf-surface-soft p-3 text-center text-xs text-pf-muted">
                Complete capital, tasa y plazo para ver el cálculo.
              </p>
            )}

            {error ? <p className="text-sm font-medium text-pf-danger" role="alert">{error}</p> : null}
            <Button type="submit" className="hidden min-h-[52px] w-full text-base shadow-lg md:inline-flex" disabled={saving || !calculation}>
              <FilePlus2 className="h-5 w-5" strokeWidth={2} aria-hidden />
              {saving ? "Creando préstamo…" : "Crear préstamo"}
            </Button>
          </Card>

          <Card className="space-y-4 p-4 sm:p-5 lg:col-start-1 lg:row-start-2">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-info-soft text-pf-info">
                <CalendarClock className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h2 className="font-bold text-pf-text">Vista previa de cuotas</h2>
                <p className="text-xs text-pf-muted">La suma siempre coincide exactamente con el total a cobrar.</p>
              </div>
            </div>
            {calculation ? (
              <InstallmentSchedule
                items={calculation.cuotas.map((cuota) => ({
                  numero: cuota.numero,
                  fechaVencimiento: cuota.fechaVencimiento,
                  monto: cuota.monto,
                  estado: "pendiente",
                }))}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-pf-border p-8 text-center text-sm text-pf-muted">
                Las cuotas aparecerán aquí al completar los datos.
              </div>
            )}
          </Card>
        </div>
      )}

      {!customersError && customers.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-pf-border-soft bg-pf-surface-elevated/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Total a cobrar</p>
              <p className="truncate text-lg font-extrabold tabular-nums text-pf-text">{formatMoney("L", calculation?.totalPagar ?? 0)}</p>
            </div>
            <Button type="submit" className="min-h-[52px] shrink-0 px-5" disabled={saving || !calculation}>
              <FilePlus2 className="h-5 w-5" strokeWidth={2} aria-hidden />
              {saving ? "Creando…" : "Crear"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
