import { CheckCircle2, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Card, Field, Input } from "../components/ui";
import { setNewPassword } from "../lib/userService";

/**
 * Destino de los enlaces de invitación y de recuperación de contraseña de
 * Supabase Auth: ambos abren esta pantalla con una sesión temporal ya activa
 * (Supabase la establece al procesar el enlace) y solo falta fijar la clave.
 */
export function SetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      const timer = window.setTimeout(() => navigate("/", { replace: true }), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [done, navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    try {
      await setNewPassword(password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo establecer la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen min-h-dvh flex flex-col items-center justify-center overflow-hidden px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="pf-auth-backdrop" aria-hidden />
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <div className="pf-login-logo-shell">
            <BrandLogo size={76} withShadow className="rounded-2xl" title="MultiPréstamos" />
          </div>
        </div>
        <h1 className="pf-app-title-xl">MultiPréstamos</h1>
        <p className="mt-2 mx-auto max-w-xs text-sm font-medium leading-relaxed text-pf-text-tertiary">
          Establezca su contraseña de acceso
        </p>
      </div>

      <Card className="pf-login-card p-6 sm:p-8">
        {loading ? (
          <p className="text-center text-sm text-pf-muted">Verificando el enlace…</p>
        ) : !user ? (
          <div className="space-y-4 text-center">
            <p className="font-bold text-pf-text">Este enlace ya no es válido</p>
            <p className="text-sm text-pf-muted">Puede haber expirado o ya haberse usado. Pida un nuevo enlace al administrador o use "¿Olvidó su contraseña?" en el inicio de sesión.</p>
            <Button type="button" className="w-full" onClick={() => navigate("/login")}>Ir al inicio de sesión</Button>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-pf-success" strokeWidth={2} aria-hidden />
            <p className="font-bold text-pf-text">Contraseña establecida</p>
            <p className="text-sm text-pf-muted">Ya puede usar la aplicación.</p>
          </div>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            <Field label="Nueva contraseña" htmlFor="set-password">
              <Input id="set-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required data-autofocus="true" />
            </Field>
            <Field label="Confirmar contraseña" htmlFor="set-password-confirm">
              <Input id="set-password-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </Field>
            {error ? <p className="text-sm text-pf-danger" role="alert">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={saving}>
              <KeyRound className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              {saving ? "Guardando…" : "Establecer contraseña"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
