import { getBusinessConfig } from "./businessConfigService";
import { listAllGestiones } from "./cobranzaService";
import { listCustomers } from "./customerService";
import { listAllInstallments, listLoans } from "./loanService";
import { listPayments } from "./paymentService";

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
