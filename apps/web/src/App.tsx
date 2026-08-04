import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { RequireBusinessConfig } from "./business/RequireBusinessConfig";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/LoginPage";

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

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-pf-muted" aria-busy="true">
      Cargando vista…
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface text-pf-muted">
        Cargando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/configuracion/inicial"
        element={
          <Protected>
            <Suspense fallback={<RouteFallback />}>
              <BusinessSetupPage />
            </Suspense>
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
        <Route path="prestamos/nuevo" element={<NewLoanPage />} />
        <Route path="prestamos/:loanId" element={<LoanDetailPage />} />
        <Route path="configuracion" element={<BusinessSettingsPage />} />
        <Route path="cobranza" element={<RutaCobroPage />} />
        <Route path="cobranza/:clienteId" element={<CobranzaClientePage />} />
        <Route path="cobranza/:clienteId/abono" element={<CobranzaAbonoPage />} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="pagos/nuevo" element={<NewPaymentPage />} />
        <Route path="pagos/:paymentId/recibo" element={<PaymentReceiptPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
