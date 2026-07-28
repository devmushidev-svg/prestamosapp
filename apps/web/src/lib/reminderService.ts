import { formatDateOnly, formatLoanNumber, formatMoney } from "./format";
import type { AgendaItem } from "./collectionAgendaService";

export type WhatsAppReminder = {
  phone: string;
  text: string;
  url: string;
};

/** Convierte un teléfono local de 8 dígitos al formato internacional de Honduras. */
export function normalizeHondurasPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `504${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

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
    url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
  };
}

/** Intenta abrir WhatsApp en una pestaña nueva. */
export function openWhatsAppReminder(item: AgendaItem, businessName?: string): boolean {
  const reminder = buildWhatsAppReminder(item, businessName);
  if (!reminder || typeof window === "undefined") return false;
  const target = window.open("about:blank", "_blank");
  if (!target) return false;
  target.opener = null;
  target.location.href = reminder.url;
  return true;
}
