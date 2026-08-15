import { CheckCircle2, KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useProfile } from "../auth/ProfileContext";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { PageHero } from "../components/PageHero";
import { Button, Card, Field, Input } from "../components/ui";
import { changePassword, updateMyProfile } from "../lib/userService";
import type { Rol } from "../types";

const ROL_LABELS: Record<Rol, string> = {
  admin: "Cuenta maestra",
  prestamista: "Prestamista",
  gerente: "Gerente",
  cobrador: "Cobrador",
  supervisor: "Supervisor",
};

export function AccountPage() {
  const { profile, reload } = useProfile();
  const { config } = useBusinessConfig();
  const isMaster = profile?.rol === "admin";
  const [form, setForm] = useState({ nombre: "", apellido: "", telefono: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saved, setSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({ nombre: profile.nombre, apellido: profile.apellido ?? "", telefono: profile.telefono ?? "" });
  }, [profile]);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveErr("");
    setSaved(false);
    if (!form.nombre.trim()) {
      setSaveErr("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile(form);
      await reload();
      setSaved(true);
    } catch (cause) {
      setSaveErr(cause instanceof Error ? cause.message : "No pudimos guardar sus datos.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwErr("");
    setPwSaved(false);
    if (newPassword.length < 6) {
      setPwErr("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr("Las contraseñas no coinciden.");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSaved(true);
    } catch (cause) {
      setPwErr(cause instanceof Error ? cause.message : "No se pudo cambiar la contraseña.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pf-safe-page">
      <PageHero title={isMaster ? "Cuenta maestra" : "Mi perfil"}>
        <p className="pf-page-lead">
          {isMaster
            ? `Administra ${config?.nombre_negocio || "esta empresa"} y los accesos de su equipo.`
            : "Sus datos personales y la contraseña de acceso."}
        </p>
        {isMaster ? <p className="pf-page-lead-muted">Es la única cuenta que puede configurar la empresa e invitar usuarios.</p> : null}
      </PageHero>

      <Card className="p-5 md:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-pf-border-soft pb-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
            <UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-pf-text">Datos personales</h2>
            <p className="text-xs text-pf-muted">
              {isMaster ? "Esta cuenta está protegida y no puede degradarse ni desactivarse." : "El correo y el acceso los administra la cuenta maestra de su empresa."}
            </p>
          </div>
        </div>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submitProfile(event)}>
          <Field label="Nombre *" htmlFor="account-nombre"><Input id="account-nombre" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required /></Field>
          <Field label="Apellido" htmlFor="account-apellido"><Input id="account-apellido" value={form.apellido} onChange={(event) => setForm((current) => ({ ...current, apellido: event.target.value }))} /></Field>
          <Field label="Correo electrónico" htmlFor="account-email"><Input id="account-email" value={profile?.email ?? ""} disabled /></Field>
          <Field label="Tipo de cuenta" htmlFor="account-rol">
            <div className="pf-control-surface flex min-h-[48px] items-center gap-2 px-3.5 py-2.5 text-pf-text-secondary md:min-h-[44px]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
              {profile ? ROL_LABELS[profile.rol] ?? profile.rol : "—"}
            </div>
          </Field>
          <Field label="Teléfono" htmlFor="account-telefono" className="sm:col-span-2"><Input id="account-telefono" inputMode="tel" value={form.telefono} onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))} /></Field>
          {saveErr ? <p className="text-sm font-medium text-pf-danger sm:col-span-2" role="alert">{saveErr}</p> : null}
          {saved ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-pf-success sm:col-span-2" role="status">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />Datos guardados correctamente.
            </p>
          ) : null}
          <div className="flex justify-end border-t border-pf-border-soft pt-4 sm:col-span-2">
            <Button type="submit" disabled={saving}><Save className="h-4 w-4" strokeWidth={2} aria-hidden />{saving ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>

      <Card className="p-5 md:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-pf-border-soft pb-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
            <KeyRound className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-pf-text">Contraseña</h2>
            <p className="text-xs text-pf-muted">Se le pedirá su contraseña actual antes de cambiarla.</p>
          </div>
        </div>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submitPassword(event)}>
          <Field label="Contraseña actual *" htmlFor="account-current-password" className="sm:col-span-2">
            <Input id="account-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </Field>
          <Field label="Nueva contraseña *" htmlFor="account-new-password">
            <Input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </Field>
          <Field label="Confirmar nueva contraseña *" htmlFor="account-confirm-password">
            <Input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </Field>
          {pwErr ? <p className="text-sm font-medium text-pf-danger sm:col-span-2" role="alert">{pwErr}</p> : null}
          {pwSaved ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-pf-success sm:col-span-2" role="status">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />Contraseña actualizada correctamente.
            </p>
          ) : null}
          <div className="flex justify-end border-t border-pf-border-soft pt-4 sm:col-span-2">
            <Button type="submit" disabled={pwSaving}><KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />{pwSaving ? "Cambiando…" : "Cambiar contraseña"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
