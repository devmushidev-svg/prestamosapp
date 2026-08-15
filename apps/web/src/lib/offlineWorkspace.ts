import {
  BUSINESS_CONFIG_CACHE_KEY,
  downloadBusinessConfig,
  type BusinessConfigResult,
} from "./businessConfigService";
import { downloadAllGestiones, GESTIONES_CACHE_KEY } from "./cobranzaService";
import {
  areFacadePhotosPrepared,
  CUSTOMERS_CACHE_KEY,
  downloadCustomers,
  prepareFacadePhotos,
} from "./customerService";
import {
  downloadAllInstallments,
  downloadLoans,
  INSTALLMENTS_CACHE_KEY,
  LOANS_CACHE_KEY,
  type PrestamoConCliente,
} from "./loanService";
import {
  getOfflineCacheRevision,
  getOfflineUserScope,
  OfflineCacheChangedError,
  readCache,
  writeCacheBatch,
} from "./offlineDb";
import {
  downloadPaymentApplications,
  downloadPayments,
  PAYMENT_APPLICATIONS_CACHE_KEY,
  PAYMENTS_CACHE_KEY,
  type PaymentApplicationDetail,
  type PaymentSummary,
} from "./paymentService";
import type { Cliente, Cuota, Gestion } from "../types";

export const OFFLINE_WORKSPACE_MANIFEST_CACHE_KEY = "offline-workspace-manifest";
// v3 incorpora la configuración del negocio identificada por empresa.
// Obliga a preparar otra vez la copia para no reutilizar el antiguo singleton.
const OFFLINE_WORKSPACE_FORMAT_VERSION = 3;

type GestionesSnapshot = { rows: Gestion[]; migracionPendiente: boolean };

type OfflineWorkspaceCounts = {
  customers: number;
  loans: number;
  installments: number;
  payments: number;
  paymentApplications: number;
  gestiones: number;
  facadePhotos: number;
};

export type OfflineWorkspaceManifest = {
  formatVersion: number;
  snapshotId: string;
  preparedAt: string;
  complete: true;
  counts: OfflineWorkspaceCounts;
};

type OfflineWorkspaceCollections = {
  business: BusinessConfigResult;
  customers: Cliente[];
  loans: PrestamoConCliente[];
  installments: Cuota[];
  payments: PaymentSummary[];
  paymentApplications: PaymentApplicationDetail[];
  gestiones: GestionesSnapshot;
};

function hasUniqueIds(items: Array<{ id: string | number }>): boolean {
  return new Set(items.map((item) => String(item.id))).size === items.length;
}

function validateWorkspace(collections: OfflineWorkspaceCollections): boolean {
  const { business, customers, loans, installments, payments, paymentApplications, gestiones } = collections;
  if (!business || (business.status !== "ready" && business.status !== "missing_schema")) return false;
  if (![customers, loans, installments, payments, paymentApplications, gestiones.rows].every(Array.isArray)) return false;
  if (![customers, loans, installments, payments, paymentApplications, gestiones.rows].every(hasUniqueIds)) return false;

  const customerIds = new Set(customers.map((item) => item.id));
  const loanIds = new Set(loans.map((item) => item.id));
  const installmentIds = new Set(installments.map((item) => item.id));
  const paymentIds = new Set(payments.map((item) => item.id));
  return loans.every((item) => customerIds.has(item.cliente_id))
    && installments.every((item) => loanIds.has(item.prestamo_id))
    && payments.every((item) => loanIds.has(item.prestamo_id))
    && paymentApplications.every((item) =>
      paymentIds.has(item.pago_id)
      && loanIds.has(item.prestamo_id)
      && (!item.cuota_id || installmentIds.has(item.cuota_id))
    )
    && gestiones.rows.every((item) => customerIds.has(item.cliente_id));
}

function countWorkspace(
  collections: OfflineWorkspaceCollections,
  facadePhotos: number,
): OfflineWorkspaceCounts {
  return {
    customers: collections.customers.length,
    loans: collections.loans.length,
    installments: collections.installments.length,
    payments: collections.payments.length,
    paymentApplications: collections.paymentApplications.length,
    gestiones: collections.gestiones.rows.length,
    facadePhotos,
  };
}

/**
 * Descarga primero toda la cartera a memoria y solo la publica cuando todas
 * las consultas, validaciones, fotos y escrituras terminaron correctamente.
 */
async function prepareOfflineWorkspaceAttempt(): Promise<void> {
  const scope = getOfflineUserScope();
  if (!scope) throw new Error("Inicie sesión antes de preparar los datos offline.");
  const initialRevision = await getOfflineCacheRevision();

  const [business, customers, loans, installments, gestiones] = await Promise.all([
    downloadBusinessConfig(),
    downloadCustomers(),
    downloadLoans(),
    downloadAllInstallments(),
    downloadAllGestiones(),
  ]);
  const [payments, paymentApplications, facadePhotoSnapshot] = await Promise.all([
    downloadPayments(loans),
    downloadPaymentApplications(installments),
    prepareFacadePhotos(customers, scope),
  ]);
  const collections: OfflineWorkspaceCollections = {
    business,
    customers,
    loans,
    installments,
    payments,
    paymentApplications,
    gestiones,
  };
  if (!validateWorkspace(collections)) {
    throw new Error("La cartera descargada no pasó la verificación de integridad. La copia anterior se conservó.");
  }
  if (getOfflineUserScope() !== scope) {
    throw new Error("El usuario cambió durante la preparación offline.");
  }

  const manifest: OfflineWorkspaceManifest = {
    formatVersion: OFFLINE_WORKSPACE_FORMAT_VERSION,
    snapshotId: crypto.randomUUID(),
    preparedAt: new Date().toISOString(),
    complete: true,
    counts: countWorkspace(collections, facadePhotoSnapshot.count),
  };
  await writeCacheBatch([
    { key: BUSINESS_CONFIG_CACHE_KEY, value: business },
    { key: CUSTOMERS_CACHE_KEY, value: customers },
    { key: LOANS_CACHE_KEY, value: loans },
    { key: INSTALLMENTS_CACHE_KEY, value: installments },
    { key: PAYMENTS_CACHE_KEY, value: payments },
    { key: PAYMENT_APPLICATIONS_CACHE_KEY, value: paymentApplications },
    { key: GESTIONES_CACHE_KEY, value: gestiones },
    { key: OFFLINE_WORKSPACE_MANIFEST_CACHE_KEY, value: manifest },
    ...facadePhotoSnapshot.entries,
  ], scope, { expectedRevision: initialRevision, requireEmptyOutbox: true });
}

export async function prepareOfflineWorkspace(): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prepareOfflineWorkspaceAttempt();
      return;
    } catch (error) {
      if (!(error instanceof OfflineCacheChangedError) || attempt === maxAttempts) throw error;
      // Al iniciar sesión, el Panel puede terminar varias lecturas y actualizar
      // su caché mientras se descarga la copia completa. Esperar brevemente y
      // reintentar evita el falso fallo sin publicar sobre cambios pendientes.
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 200));
    }
  }
}

/** Comprueba versión, forma, conteos, relaciones y recursos locales. */
export async function isOfflineWorkspacePrepared(): Promise<boolean> {
  const [manifest, business, customers, loans, installments, payments, paymentApplications, gestiones] = await Promise.all([
    readCache<OfflineWorkspaceManifest>(OFFLINE_WORKSPACE_MANIFEST_CACHE_KEY),
    readCache<BusinessConfigResult>(BUSINESS_CONFIG_CACHE_KEY),
    readCache<Cliente[]>(CUSTOMERS_CACHE_KEY),
    readCache<PrestamoConCliente[]>(LOANS_CACHE_KEY),
    readCache<Cuota[]>(INSTALLMENTS_CACHE_KEY),
    readCache<PaymentSummary[]>(PAYMENTS_CACHE_KEY),
    readCache<PaymentApplicationDetail[]>(PAYMENT_APPLICATIONS_CACHE_KEY),
    readCache<GestionesSnapshot>(GESTIONES_CACHE_KEY),
  ]);
  if (!manifest
    || manifest.formatVersion !== OFFLINE_WORKSPACE_FORMAT_VERSION
    || manifest.complete !== true
    || !manifest.snapshotId
    || !business
    || !customers
    || !loans
    || !installments
    || !payments
    || !paymentApplications
    || !gestiones) return false;

  const collections = { business, customers, loans, installments, payments, paymentApplications, gestiones };
  if (!validateWorkspace(collections)) return false;
  const counts = countWorkspace(collections, manifest.counts.facadePhotos);
  const collectionCountsAreComplete = counts.customers >= manifest.counts.customers
    && counts.loans >= manifest.counts.loans
    && counts.installments >= manifest.counts.installments
    && counts.payments >= manifest.counts.payments
    && counts.paymentApplications >= manifest.counts.paymentApplications
    && counts.gestiones >= manifest.counts.gestiones;
  if (!collectionCountsAreComplete) return false;
  return areFacadePhotosPrepared(customers);
}
