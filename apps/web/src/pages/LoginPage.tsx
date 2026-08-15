import { CheckCircle2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Card, Field, Input } from "../components/ui";
import { requestPasswordReset } from "../lib/userService";

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!navigator.onLine) {
      setError("Necesita conexión a Internet para recuperar su contraseña.");
      return;
    }
    setSending(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el enlace de recuperación.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-pf-success" strokeWidth={2} aria-hidden />
        <p className="font-bold text-pf-text">Enlace enviado</p>
        <p className="text-sm text-pf-muted">Si {email.trim()} está registrado, recibirá un correo para restablecer su contraseña.</p>
        <Button type="button" variant="secondary" className="w-full" onClick={onBack}>Volver al inicio de sesión</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <p className="text-sm text-pf-muted">Ingrese su correo y le enviaremos un enlace para restablecer su contraseña.</p>
      <Field label="Correo" htmlFor="forgot-email">
        <Input id="forgot-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@correo.com" required data-autofocus="true" />
      </Field>
      {error ? <p className="text-sm text-pf-danger" role="alert">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={sending}>{sending ? "Enviando…" : "Enviar enlace"}</Button>
      <button type="button" className="w-full text-center text-xs font-medium text-pf-primary-hover hover:underline" onClick={onBack}>
        Volver al inicio de sesión
      </button>
    </form>
  );
}

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface text-pf-muted">
        Cargando…
      </div>
    );
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
          Gestión de préstamos clara y rápida
        </p>
      </div>

      <Card className="pf-login-card p-6 sm:p-8">
        {forgotPassword ? (
          <ForgotPasswordForm onBack={() => setForgotPassword(false)} />
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Correo" htmlFor="login-email">
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@correo.com"
                  required
                />
              </Field>
              <Field label="Contraseña" htmlFor="login-password">
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-24"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-pf-primary-hover hover:bg-pf-primary-soft"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </Field>
              {error ? <p className="text-sm text-pf-danger" role="alert">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                {busy ? "Entrando…" : "Iniciar sesión"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-pf-primary-hover hover:underline"
                onClick={() => setForgotPassword(true)}
              >
                ¿Olvidó su contraseña?
              </button>
            </form>
            <p className="mt-4 text-center text-xs leading-relaxed text-pf-muted">
              Acceso privado para usuarios autorizados.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
