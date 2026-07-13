import type { Pago } from "../types";

/**
 * Único punto de emisión de recibos de pago. TODA la app llama a `emitirRecibo`;
 * al pasar del MVP a la versión completa solo cambia este módulo.
 */
export type DatosRecibo = {
  pago: Pago;
  clienteNombre: string;
  saldoRestante: number;
};

export function emitirRecibo(datos: DatosRecibo) {
  imprimirHtmlTermico(datos);
}

// MVP: recibo HTML a ancho térmico (58/80 mm) impreso con window.print() vía
// iframe oculto — mismo patrón que el ticket del POS original (lib/ticketPrint.ts
// en D:\punto de venta). Se implementa en la fase de pagos del MVP.
function imprimirHtmlTermico(_datos: DatosRecibo): void {
  throw new Error("El recibo impreso llega en la fase de pagos del MVP.");
}

/** v2 (Capacitor): impresión ESC/POS en térmicas Bluetooth. */
export function imprimirEscPosBluetooth(_datos: DatosRecibo): void {
  // TODO v2: Capacitor + @capacitor-community/bluetooth-le. No instalar todavía.
  throw new Error("Impresión Bluetooth nativa llega en la v2 (Capacitor).");
}
