import { BUSINESS_CONFIG_CACHE_KEY, getBusinessConfig } from "./businessConfigService";
import { GESTIONES_CACHE_KEY, listAllGestiones } from "./cobranzaService";
import { CUSTOMERS_CACHE_KEY, listCustomers } from "./customerService";
import { INSTALLMENTS_CACHE_KEY, listAllInstallments, listLoans, LOANS_CACHE_KEY } from "./loanService";
import { readCache } from "./offlineDb";
import { listPayments, PAYMENTS_CACHE_KEY } from "./paymentService";

const REQUIRED_OFFLINE_CACHE_KEYS = [
  BUSINESS_CONFIG_CACHE_KEY,
  CUSTOMERS_CACHE_KEY,
  LOANS_CACHE_KEY,
  INSTALLMENTS_CACHE_KEY,
  PAYMENTS_CACHE_KEY,
  GESTIONES_CACHE_KEY,
] as const;

/**
 * Descarga una copia operativa completa para el tamaño actual de la cartera.
 * Las pantallas derivan panel, agenda, ruta y reportes desde estas colecciones.
 */
export async function prepareOfflineWorkspace(): Promise<void> {
  await Promise.all([
    getBusinessConfig(),
    listCustomers(),
    listLoans(),
    listAllInstallments(),
    listPayments(),
    listAllGestiones(),
  ]);
}

/**
 * Una fecha en localStorage no basta: Safari y otros navegadores pueden
 * conservar preferencias aunque hayan desalojado IndexedDB. Se comprueban las
 * seis colecciones que permiten reconstruir las pantallas operativas.
 */
export async function isOfflineWorkspacePrepared(): Promise<boolean> {
  const cachedCollections = await Promise.all(
    REQUIRED_OFFLINE_CACHE_KEYS.map((key) => readCache<unknown>(key)),
  );
  return cachedCollections.every((value) => value !== undefined);
}
