import { ArrowLeft, CalendarClock, FilePlus2, HandCoins, Percent, UserPlus, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { InstallmentSchedule } from "../components/InstallmentSchedule";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Select } from "../components/ui";
import { formatDateOnly, formatMoney } from "../lib/format";
import {
  calculateFixedLoan,
  formatLoanPlan,
  FREQUENCY_LABELS,
  getDailyRateOptions,
  getDefaultWeeklyPaymentDay,
  getLoanTermOptions,
  hondurasToday,
  NEW_LOAN_FREQUENCIES,
  WEEKDAY_LABELS,
  type FixedLoanCalculation,
  type NewLoanFrequency,
} from "../lib/loanCalculator";
import { createFixedLoan, listCustomersForLoan, type ClienteResumen } from "../lib/loanService";
import type { DiaPagoSemana } from "../types";

type LoanForm = {
  clienteId: string;
  capital: string;
  tasaInteres: string;
  plazo: string;
  frecuencia: NewLoanFrequency;
  fechaInicio: string;
  diaPagoSemana: DiaPagoSemana;
};

const INITIAL_DATE = hondurasToday();

const INITIAL_FORM: LoanForm = {
  clienteId: "",
  capital: "",
  tasaInteres: "15",
  plazo: "24",
  frecuencia: "diario",
  fechaInicio: INITIAL_DATE,
  diaPagoSemana: getDefaultWeeklyPaymentDay(INITIAL_DATE),
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
      diaPagoSemana: form.frecuencia === "semanal" ? form.diaPagoSemana : null,
    });
  } catch {
    return null;
  }
}

export function NewLoanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<ClienteResumen[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [form, setForm] = useState<LoanForm>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const weeklyDayWasSelectedRef = useRef(false);

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

  useEffect(() => {
    const requestedCustomer = searchParams.get("clienteId");
    if (!requestedCustomer || !customers.some((customer) => customer.id === requestedCustomer)) return;
    setForm((current) => current.clienteId ? current : { ...current, clienteId: requestedCustomer });
  }, [customers, searchParams]);

  const calculation = useMemo(() => getCalculation(form), [form]);
  const selectedCustomer = customers.find((customer) => customer.id === form.clienteId) ?? null;
  const termOptions = getLoanTermOptions(form.frecuencia);
  const dailyRateOptions = form.frecuencia === "diario" ? getDailyRateOptions(Number(form.plazo)) : [];
  const planLabel = formatLoanPlan(form.frecuencia, Number(form.plazo));
  const weeklyPaymentDay = form.frecuencia === "semanal" ? WEEKDAY_LABELS[form.diaPagoSemana] : null;

  function changeFrequency(frequency: NewLoanFrequency) {
    const firstTerm = getLoanTermOptions(frequency)[0];
    weeklyDayWasSelectedRef.current = false;
    setForm((current) => ({
      ...current,
      frecuencia: frequency,
      plazo: String(firstTerm.plazo),
      tasaInteres: frequency === "diario"
        ? String(getDailyRateOptions(firstTerm.plazo)[0])
        : current.frecuencia === "diario" ? "10" : current.tasaInteres,
      diaPagoSemana: current.fechaInicio
        ? getDefaultWeeklyPaymentDay(current.fechaInicio)
        : current.diaPagoSemana,
    }));
  }

  function changeTerm(plazo: number) {
    setForm((current) => {
      const allowedRates = current.frecuencia === "diario" ? getDailyRateOptions(plazo) : [];
      return {
        ...current,
        plazo: String(plazo),
        tasaInteres: allowedRates.length && !allowedRates.includes(Number(current.tasaInteres))
          ? String(allowedRates[0])
          : current.tasaInteres,
      };
    });
  }

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
        diaPagoSemana: form.frecuencia === "semanal" ? form.diaPagoSemana : null,
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
        diaPagoSemana: form.frecuencia === "semanal" ? form.diaPagoSemana : null,
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

            <Field label="Tipo de cobro *">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de cobro">
                {NEW_LOAN_FREQUENCIES.map((frequency) => {
                  const selected = form.frecuencia === frequency;
                  const detail = frequency === "diario" ? "Cada día" : frequency === "semanal" ? "Día fijo" : "Cada 15 días";
                  return (
                    <button
                      key={frequency}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`min-h-[58px] rounded-xl border px-2 py-2 text-center text-xs font-bold transition active:scale-[0.98] ${
                        selected
                          ? "pf-btn-primary-gradient border-transparent"
                          : "pf-btn-secondary border-pf-border-soft"
                      }`}
                      onClick={() => changeFrequency(frequency)}
                    >
                      <span className="block">{FREQUENCY_LABELS[frequency]}</span>
                      <span className={`mt-0.5 block text-[10px] font-medium ${selected ? "text-white/80" : "text-pf-muted"}`}>{detail}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto a prestar (L) *" htmlFor="loan-capital">
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

              <Field label="Tiempo *">
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tiempo del préstamo">
                  {termOptions.map((option) => {
                    const selected = Number(form.plazo) === option.plazo;
                    return (
                      <button
                        key={option.plazo}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`min-h-[46px] rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-[0.98] ${
                          selected
                            ? "border-pf-primary bg-pf-primary-soft text-pf-primary-hover shadow-sm"
                            : "border-pf-border-soft bg-pf-surface-elevated text-pf-text-secondary hover:bg-pf-surface-soft"
                        }`}
                        onClick={() => changeTerm(option.plazo)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            {form.frecuencia === "diario" ? (
              <Field label="Tasa según historial crediticio *">
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tasa de interés fija">
                  {dailyRateOptions.map((rate) => {
                    const selected = Number(form.tasaInteres) === rate;
                    return (
                      <button
                        key={rate}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-extrabold transition active:scale-[0.98] ${
                          selected
                            ? "border-pf-primary bg-pf-primary-soft text-pf-primary-hover shadow-sm"
                            : "border-pf-border-soft bg-pf-surface-elevated text-pf-text-secondary hover:bg-pf-surface-soft"
                        }`}
                        onClick={() => setForm((current) => ({ ...current, tasaInteres: String(rate) }))}
                      >
                        {rate}%
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : (
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
            )}

            {form.frecuencia === "semanal" ? (
              <Field label="Día fijo de cobro *">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Día fijo de cobro semanal">
                  {(Object.entries(WEEKDAY_LABELS) as Array<[string, string]>).map(([value, label]) => {
                    const day = Number(value) as DiaPagoSemana;
                    const selected = form.diaPagoSemana === day;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-[0.98] ${
                          selected
                            ? "border-pf-info bg-pf-info-soft text-pf-info shadow-sm"
                            : "border-pf-border-soft bg-pf-surface-elevated text-pf-text-secondary hover:bg-pf-surface-soft"
                        }`}
                        onClick={() => {
                          weeklyDayWasSelectedRef.current = true;
                          setForm((current) => ({ ...current, diaPagoSemana: day }));
                        }}
                      >
                        {label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : null}

            <Field label="Fecha de inicio / desembolso *" htmlFor="loan-start">
              <Input
                id="loan-start"
                type="date"
                value={form.fechaInicio}
                onChange={(event) => {
                  const fechaInicio = event.target.value;
                  setForm((current) => ({
                    ...current,
                    fechaInicio,
                    diaPagoSemana: fechaInicio && current.frecuencia === "semanal" && !weeklyDayWasSelectedRef.current
                      ? getDefaultWeeklyPaymentDay(fechaInicio)
                      : current.diaPagoSemana,
                  }));
                }}
                onClick={(event) => event.currentTarget.showPicker?.()}
                required
              />
            </Field>

            <div className="rounded-xl border border-pf-info-soft bg-pf-info-soft/35 p-3 text-xs leading-relaxed text-pf-text-secondary">
              <p className="flex items-start gap-2">
                <Percent className="mt-0.5 h-4 w-4 shrink-0 text-pf-info" strokeWidth={2} aria-hidden />
                <span>
                  La tasa se calcula una sola vez sobre el capital. Este plan genera <strong>{planLabel.toLowerCase()}</strong>
                  {weeklyPaymentDay ? <> con cobro fijo los <strong>{weeklyPaymentDay.toLowerCase()}</strong></> : null}.
                  {calculation ? <> El primer pago vence el <strong>{formatDateOnly(calculation.fechaPrimerPago)}</strong>.</> : null}
                </span>
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
                  <strong className="text-right">{formatLoanPlan(form.frecuencia, calculation.cuotas.length)}</strong>
                </p>
                {weeklyPaymentDay ? (
                  <p className="flex justify-between gap-3">
                    <span>Día de cobro</span>
                    <strong>{weeklyPaymentDay}</strong>
                  </p>
                ) : null}
                <p className="flex justify-between gap-3">
                  <span>Primera cuota</span>
                  <strong>{formatMoney("L", calculation.cuotas[0].monto)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span>Primer pago</span>
                  <strong>{formatDateOnly(calculation.fechaPrimerPago)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span>Última cuota</span>
                  <strong>{formatDateOnly(calculation.cuotas.at(-1)?.fechaVencimiento ?? form.fechaInicio)}</strong>
                </p>
                <p className="flex justify-between gap-3 border-t border-pf-border-soft pt-2">
                  <span>Mora configurada</span>
                  <strong>1.5 %</strong>
                </p>
                <p className="text-[11px] leading-relaxed text-pf-muted">
                  Se guardará como condición del crédito. Por ahora no aumenta automáticamente el saldo.
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
                mobileLimit={8}
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
