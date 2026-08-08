import { formatMoney } from "./format";

export type CollectionWhatsAppMessageInput = {
  clienteNombre: string;
  negocioNombre?: string | null;
  pagoSugerido?: number | null;
  saldoTotal?: number | null;
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

/** Construye una conversación dirigida a un número, con texto opcional. */
export function buildWhatsAppChatUrl(
  value: string | null | undefined,
  text?: string | null,
): string | null {
  const phone = normalizeHondurasPhone(value);
  if (!phone) return null;

  const message = text?.trim();
  return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Abre WhatsApp en una pestaña nueva; devuelve false si no hay número válido o el navegador lo bloquea. */
export function openWhatsAppChat(
  value: string | null | undefined,
  text?: string | null,
  options?: { fallbackSameTab?: boolean },
): boolean {
  const url = buildWhatsAppChatUrl(value, text);
  if (!url || typeof window === "undefined") return false;

  const target = window.open("about:blank", "_blank");
  if (!target) {
    if (!options?.fallbackSameTab) return false;
    window.location.assign(url);
    return true;
  }
  target.opener = null;
  target.location.href = url;
  return true;
}

/** Prepara un mensaje cordial de cobranza; los montos solo aparecen cuando se proporcionan. */
export function buildCollectionWhatsAppMessage({
  clienteNombre,
  negocioNombre,
  pagoSugerido,
  saldoTotal,
}: CollectionWhatsAppMessageInput): string {
  const customer = clienteNombre.trim() || "cliente";
  const business = negocioNombre?.trim() || "MultiPréstamos";
  const lines = [
    `Hola, ${customer}. Le saluda ${business}.`,
    "Le escribimos para dar seguimiento a su crédito.",
  ];

  if (pagoSugerido != null && Number.isFinite(Number(pagoSugerido))) {
    lines.push(`Pago sugerido: ${formatMoney("L", Number(pagoSugerido))}.`);
  }
  if (saldoTotal != null && Number.isFinite(Number(saldoTotal))) {
    lines.push(`Saldo pendiente: ${formatMoney("L", Number(saldoTotal))}.`);
  }

  lines.push("Cuando pueda, confírmenos por este medio si realizará su pago. Gracias.");
  return lines.join("\n");
}
