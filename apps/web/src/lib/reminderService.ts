import { formatDateOnly, formatLoanNumber, formatMoney } from "./format";
import type { AgendaItem } from "./collectionAgendaService";
import { buildWhatsAppChatUrl, normalizeHondurasPhone, openWhatsAppChat } from "./whatsappService";

export { normalizeHondurasPhone } from "./whatsappService";

export type WhatsAppReminder = {
  phone: string;
  text: string;
  url: string;
};

function duePhrase(item: AgendaItem): string {
  const installments = `${item.cantidadCuotas} cuota${item.cantidadCuotas === 1 ? "" : "s"}`;
  const date = formatDateOnly(item.fechaVencimiento);
  if (item.categoria === "vencidas") return `${installments} pendiente${item.cantidadCuotas === 1 ? "" : "s"} desde el ${date}`;
  if (item.categoria === "hoy") return `${installments} con vencimiento hoy, ${date}`;
  return `${installments} con próximo vencimiento el ${date}`;
}

/** Crea el mensaje y URL; devuelve null cuando el cliente no tiene un teléfono utilizable. */
export function buildWhatsAppReminder(item: AgendaItem, businessName = "MultiPréstamos"): WhatsAppReminder | null {
  const phone = normalizeHondurasPhone(item.clienteTelefono);
  if (!phone) return null;
  const business = businessName.trim() || "MultiPréstamos";
  const text = [
    `Hola, ${item.clienteNombre}. Le saluda ${business}.`,
    `Este es un recordatorio de ${duePhrase(item)} para el préstamo ${formatLoanNumber(item.prestamoNumero, item.prestamoId)}.`,
    `Monto pendiente de esta cobranza: ${formatMoney("L", item.pendiente)}.`,
    `Saldo actual del préstamo: ${formatMoney("L", item.saldoPrestamo)}.`,
    "Si ya realizó el pago, puede ignorar este mensaje. Gracias.",
  ].join("\n");
  return {
    phone,
    text,
    url: buildWhatsAppChatUrl(phone, text)!,
  };
}

/** Intenta abrir WhatsApp en una pestaña nueva. */
export function openWhatsAppReminder(item: AgendaItem, businessName?: string): boolean {
  const reminder = buildWhatsAppReminder(item, businessName);
  return reminder ? openWhatsAppChat(reminder.phone, reminder.text) : false;
}
