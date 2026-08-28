import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useProfile } from "./auth/ProfileContext";
import { RequireBusinessConfig } from "./business/RequireBusinessConfig";
import { Button, Card } from "./components/ui";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import("./pages/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const LoansPage = lazy(() => import("./pages/LoansPage").then((m) => ({ default: m.LoansPage })));
const NewLoanPage = lazy(() => import("./pages/NewLoanPage").then((m) => ({ default: m.NewLoanPage })));
const LoanDetailPage = lazy(() => import("./pages/LoanDetailPage").then((m) => ({ default: m.LoanDetailPage })));
const BusinessSetupPage = lazy(() => import("./pages/BusinessConfigPage").then((m) => ({ default: m.BusinessSetupPage })));
const BusinessSettingsPage = lazy(() => import("./pages/BusinessConfigPage").then((m) => ({ default: m.BusinessSettingsPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const NewPaymentPage = lazy(() => import("./pages/NewPaymentPage").then((m) => ({ default: m.NewPaymentPage })));
const PaymentReceiptPage = lazy(() => import("./pages/PaymentReceiptPage").then((m) => ({ default: m.PaymentReceiptPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const AgendaPage = lazy(() => import("./pages/AgendaPage").then((m) => ({ default: m.AgendaPage })));
const CustomerStatementPage = lazy(() => import("./pages/CustomerStatementPage").then((m) => ({ default: m.CustomerStatementPage })));
const AjustesPage = lazy(() => import("./pages/AjustesPage").then((m) => ({ default: m.AjustesPage })));
const RutaCobroPage = lazy(() => import("./pages/RutaCobroPage").then((m) => ({ default: m.RutaCobroPage })));
const CobranzaClientePage = lazy(() => import("./pages/CobranzaClientePage").then((m) => ({ default: m.CobranzaClientePage })));
const CobranzaAbonoPage = lazy(() => import("./pages/CobranzaAbonoPage").then((m) => ({ default: m.CobranzaAbonoPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const AccountPage = lazy(() => import("./pages/AccountPage").then((m) => ({ default: m.AccountPage })));
const NewLoanRequestPage = lazy(() => import("./pages/NewLoanRequestPage").then((m) => ({ default: m.NewLoanRequestPage })));
const MisSolicitudesPage = lazy(() => import("./pages/MisSolicitudesPage").then((m) => ({ default: m.MisSolicitudesPage })));
const SolicitudesPage = lazy(() => import("./pages/SolicitudesPage").then((m) => ({ default: m.SolicitudesPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-pf-muted" aria-busy="true">
      Cargando vista…
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { status: profileStatus, error: profileError, reload: reloadProfile } = useProfile();
  if (loading || (user && profileStatus === "loading")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface text-pf-muted">
        Cargando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (profileStatus === "inactive") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold text-pf-text">Su cuenta está desactivada</p>
          <p className="mt-2 text-sm text-pf-muted">
            Contacte a la cuenta maestra de su empresa para recuperar el acceso.
          </p>
          <Button type="button" className="mt-4" onClick={() => void logout()}>Salir</Button>
        </Card>
      </div>
    );
  }
  if (profileStatus === "company_inactive") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold text-pf-text">La empresa está desactivada</p>
          <p className="mt-2 text-sm text-pf-muted">
            El acceso y la sincronización están suspendidos. Contacte al responsable de la plataforma.
          </p>
          <Button type="button" className="mt-4" onClick={() => void logout()}>Salir</Button>
        </Card>
      </div>
    );
  }
  if (profileStatus === "unassigned") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold text-pf-text">Cuenta no asignada a una empresa</p>
          <p className="mt-2 text-sm text-pf-muted">
            {profileError || "La cuenta maestra debe invitarle desde la empresa a la que pertenece."}
          </p>
          <Button type="button" className="mt-4" onClick={() => void logout()}>Salir</Button>
        </Card>
      </div>
    );
  }
  if (profileStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold text-pf-text">No pudimos verificar su cuenta</p>
          <p className="mt-2 text-sm text-pf-muted">{profileError}</p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Button type="button" variant="secondary" onClick={() => void logout()}>Salir</Button>
            <Button type="button" onClick={() => void reloadProfile()}>Reintentar</Button>
          </div>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

function RequireAdmin({ children, showAccessMessage = false }: { children: ReactNode; showAccessMessage?: boolean }) {
  const { logout } = useAuth();
  const { status, isAdmin } = useProfile();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface text-pf-muted">
        Cargando…
      </div>
    );
  }
  if (!isAdmin) {
    if (showAccessMessage) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
          <Card className="max-w-md p-6 text-center">
            <p className="font-bold text-pf-text">Configuración reservada</p>
            <p className="mt-2 text-sm text-pf-muted">
              Solo la cuenta maestra puede configurar la empresa. Pídale que complete este paso antes de ingresar.
            </p>
            <Button type="button" className="mt-4" onClick={() => void logout()}>Salir</Button>
          </Card>
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * Protege una ruta con un permiso puntual (no todo-o-nada como `RequireAdmin`).
 * Es solo la primera línea de defensa: la RLS/RPC del servidor son las que de
 * verdad impiden la operación aunque alguien llegue aquí sin este guard.
 *
 * `soloPrestamista`: para flujos de "solicitar" (piden aprobación de la
 * cuenta maestra). El admin siempre cumple `hasPermission` porque tiene
 * acceso total, pero no tiene sentido que "se solicite" algo a sí mismo, así
 * que estas rutas se ocultan también para él.
 */
function RequirePermission({
  code,
  soloPrestamista = false,
  children,
}: {
  code: string;
  soloPrestamista?: boolean;
  children: ReactNode;
}) {
  const { status, hasPermission, isAdmin } = useProfile();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface text-pf-muted">
        Cargando…
      </div>
    );
  }
  if (soloPrestamista && isAdmin) return <Navigate to="/" replace />;
  if (!hasPermission(code)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/restablecer-password" element={<SetPasswordPage />} />
      <Route
        path="/configuracion/inicial"
        element={
          <Protected>
            <RequireAdmin showAccessMessage>
              <Suspense fallback={<RouteFallback />}>
                <BusinessSetupPage />
              </Suspense>
            </RequireAdmin>
          </Protected>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <RequireBusinessConfig>
              <Suspense fallback={<RouteFallback />}>
                <AppShell />
              </Suspense>
            </RequireBusinessConfig>
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="clientes/:customerId/estado-cuenta" element={<CustomerStatementPage />} />
        <Route path="prestamos" element={<LoansPage />} />
        <Route path="prestamos/nuevo" element={<RequirePermission code="prestamos.crear"><NewLoanPage /></RequirePermission>} />
        <Route path="prestamos/solicitar" element={<RequirePermission code="prestamos.solicitar" soloPrestamista><NewLoanRequestPage /></RequirePermission>} />
        <Route path="prestamos/mis-solicitudes" element={<RequirePermission code="prestamos.solicitar" soloPrestamista><MisSolicitudesPage /></RequirePermission>} />
        <Route path="prestamos/:loanId" element={<LoanDetailPage />} />
        <Route path="configuracion" element={<RequireAdmin><BusinessSettingsPage /></RequireAdmin>} />
        <Route path="configuracion/usuarios" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
        <Route path="solicitudes" element={<RequireAdmin><SolicitudesPage /></RequireAdmin>} />
        <Route path="perfil" element={<AccountPage />} />
        <Route path="cobranza" element={<RutaCobroPage />} />
        <Route path="cobranza/:clienteId" element={<CobranzaClientePage />} />
        <Route path="cobranza/:clienteId/abono" element={<RequirePermission code="pagos.registrar"><CobranzaAbonoPage /></RequirePermission>} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="pagos/nuevo" element={<RequirePermission code="pagos.registrar"><NewPaymentPage /></RequirePermission>} />
        <Route path="pagos/:paymentId/recibo" element={<PaymentReceiptPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
