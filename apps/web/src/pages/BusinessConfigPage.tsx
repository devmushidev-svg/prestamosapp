import { Building2, CheckCircle2, Landmark, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { BrandLockup } from "../components/BrandLogo";
import { PageHero } from "../components/PageHero";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import type { ConfiguracionPrestamistaInput } from "../types";

const EMPTY_FORM: ConfiguracionPrestamistaInput = {
  nombre_negocio: "",
  nombre_propietario: "",
  rtn: "",
  direccion: "",
  telefono: "",
};

function ReceiptPreview({ form, setup }: { form: ConfiguracionPrestamistaInput; setup: boolean }) {
  return (
    <Card className={`h-fit min-w-0 space-y-4 border-white/60 bg-white/95 p-5 shadow-lg lg:sticky ${setup ? "lg:top-16" : "lg:top-[11.5rem]"}`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-pf-muted">Vista previa</p>
        <h2 className="mt-1 font-extrabold text-pf-text">Así se verá en el recibo</h2>
      </div>
      <div className="mx-auto w-full max-w-[320px] rounded-xl border border-dashed border-pf-border bg-white px-5 py-6 font-mono text-[11px] leading-relaxed text-stone-800 shadow-sm">
        <div className="border-b border-dashed border-stone-300 pb-3 text-center">
          <p className="break-words text-sm font-black uppercase tracking-tight">{form.nombre_negocio.trim() || "SU NEGOCIO"}</p>
          {form.telefono?.trim() ? <p className="break-words">Tel. {form.telefono.trim()}</p> : null}
          {form.direccion?.trim() ? <p className="mt-0.5 break-words">{form.direccion.trim()}</p> : null}
          {form.rtn?.trim() ? <p className="break-words">RTN {form.rtn.trim()}</p> : null}
        </div>
        <p className="py-3 text-center text-sm font-black">RECIBO DE PAGO</p>
        <div className="space-y-1 border-y border-dashed border-stone-300 py-3">
          <p className="flex min-w-0 justify-between gap-3"><span>Cliente</span><strong className="min-w-0 break-words text-right">Juan Pérez</strong></p>
          <p className="flex justify-between gap-3"><span>Cuota</span><strong className="shrink-0">#03</strong></p>
          <p className="flex justify-between gap-3"><span>Monto</span><strong className="shrink-0">L 500.00</strong></p>
          <p className="flex justify-between gap-3"><span>Saldo</span><strong className="shrink-0">L 6,500.00</strong></p>
        </div>
        <div className="pt-3 text-center">
          <p>Atendido por</p>
          <p className="break-words font-bold">{form.nombre_propietario.trim() || "Propietario"}</p>
          <p className="mt-3">Gracias por su pago</p>
        </div>
      </div>
      <div className="rounded-xl border border-pf-info-soft bg-pf-info-soft/35 px-3 py-2.5 text-xs text-pf-text-secondary">
        Moneda: Lempira (L) · Formato: Honduras
      </div>
    </Card>
  );
}

function ConfigContent({ setup }: { setup: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, status, error: loadError, save, reload } = useBusinessConfig();
  const [form, setForm] = useState<ConfiguracionPrestamistaInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config) return;
    setForm({
      nombre_negocio: config.nombre_negocio,
      nombre_propietario: config.nombre_propietario,
      rtn: config.rtn ?? "",
      direccion: config.direccion ?? "",
      telefono: config.telefono ?? "",
    });
  }, [config]);

  const valid = Boolean(form.nombre_negocio.trim() && form.nombre_propietario.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (status === "missing_schema") {
      setError("Falta aplicar la actualización consolidada en Supabase antes de guardar.");
      return;
    }
    if (!valid) {
      setError("Complete el nombre del negocio y del propietario.");
      return;
    }
    setSaving(true);
    try {
      await save(form);
      if (setup) {
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== "/configuracion/inicial" ? from : "/", { replace: true });
      } else {
        setSaved(true);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("configuracion_prestamista")
          ? "Falta aplicar la actualización consolidada en Supabase."
          : "No pudimos guardar los datos. Revise la conexión e intente de nuevo."
      );
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <Card className="p-10 text-center text-sm font-medium text-pf-muted">Cargando configuración…</Card>;
  }

  if (status === "error") {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-bold text-pf-text">No se pudo cargar la configuración</p>
        <p className="mt-2 text-sm text-pf-muted">{loadError}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => void reload()}>Reintentar</Button>
      </Card>
    );
  }

  return (
    <form className="mx-auto max-w-6xl space-y-4 pf-safe-page max-md:pb-24 max-md:[&_input]:scroll-mb-32 max-md:[&_select]:scroll-mb-32 max-md:[&_textarea]:scroll-mb-32" onSubmit={(event) => void submit(event)}>
      <PageHero title={setup && !config ? "Configure su negocio" : "Datos del prestamista"}>
        <p className="pf-page-lead">Estos datos aparecerán en sus recibos y documentos.</p>
        <p className="pf-page-lead-muted">Podrá cambiarlos en cualquier momento.</p>
      </PageHero>

      {status === "missing_schema" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/55 px-4 py-3 text-sm text-pf-text-secondary sm:flex-row sm:items-center" role="status">
          <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-pf-warning" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-pf-text">Vista lista; guardado pendiente</p>
            <p className="mt-0.5 text-xs">Se habilitará al aplicar una sola actualización consolidada en Supabase.</p>
          </div>
          <Button type="button" variant="secondary" className="shrink-0" onClick={() => void reload()}>
            Comprobar actualización
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        <Card className="border-white/50 bg-gradient-to-br from-white/95 via-orange-50/10 to-sky-50/20 p-4 shadow-lg backdrop-blur-sm sm:p-5">
          <div className="mb-5 flex items-center gap-3 border-b border-pf-border-soft pb-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
              <Building2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-pf-text">Información general</h2>
              <p className="text-xs text-pf-muted">Nombre, propietario y datos de contacto.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del negocio *" htmlFor="business-name" className="sm:col-span-2">
              <Input
                id="business-name"
                data-autofocus="true"
                autoComplete="organization"
                value={form.nombre_negocio}
                onChange={(event) => setForm((current) => ({ ...current, nombre_negocio: event.target.value }))}
                placeholder="Ej. Préstamos El Centro"
                required
              />
            </Field>
            <Field label="Nombre del propietario *" htmlFor="owner-name" className="sm:col-span-2">
              <Input
                id="owner-name"
                autoComplete="name"
                value={form.nombre_propietario}
                onChange={(event) => setForm((current) => ({ ...current, nombre_propietario: event.target.value }))}
                required
              />
            </Field>
            <Field label="RTN (opcional)" htmlFor="business-rtn">
              <Input
                id="business-rtn"
                value={form.rtn ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, rtn: event.target.value }))}
                placeholder="0801…"
              />
            </Field>
            <Field label="Teléfono" htmlFor="business-phone">
              <Input
                id="business-phone"
                inputMode="tel"
                autoComplete="tel"
                value={form.telefono ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
              />
            </Field>
            <Field label="Dirección" htmlFor="business-address" className="sm:col-span-2">
              <Textarea
                id="business-address"
                rows={3}
                autoComplete="street-address"
                value={form.direccion ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, direccion: event.target.value }))}
              />
            </Field>
          </div>

          <div className="mt-5 rounded-xl border border-pf-primary-soft bg-pf-primary-soft/30 p-3 text-xs leading-relaxed text-pf-text-secondary">
            El logo personalizado es opcional y se habilitará junto con la carga segura de archivos. Por ahora los recibos usarán la identidad de MultiPréstamos.
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-pf-danger" role="alert">{error}</p> : null}
          {saved ? (
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-pf-success" role="status">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              Datos guardados correctamente.
            </p>
          ) : null}

          <div className="mt-5 hidden justify-end border-t border-pf-border-soft pt-5 md:flex">
            <Button type="submit" className="min-h-[52px] px-6 shadow-lg" disabled={saving || !valid || status === "missing_schema"}>
              <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
              {saving ? "Guardando…" : setup && !config ? "Guardar y comenzar" : "Guardar cambios"}
            </Button>
          </div>
        </Card>

        <ReceiptPreview form={form} setup={setup} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-pf-border-soft bg-pf-surface-elevated/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">{setup ? "Configuración inicial" : "Mi negocio"}</p>
            <p className="truncate text-sm font-extrabold text-pf-text">{form.nombre_negocio.trim() || "Complete sus datos"}</p>
          </div>
          <Button type="submit" className="min-h-[52px] shrink-0 px-5" disabled={saving || !valid || status === "missing_schema"}>
            <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-transparent">
      <header className="pf-app-shell-header sticky top-0 z-20 flex h-14 items-center px-4 print:hidden md:px-6">
        <BrandLockup size={36} />
      </header>
      <main className="px-4 py-5 md:px-6 md:py-6">{children}</main>
    </div>
  );
}

export function BusinessSetupPage() {
  return <SetupShell><ConfigContent setup /></SetupShell>;
}

export function BusinessSettingsPage() {
  return <ConfigContent setup={false} />;
}
