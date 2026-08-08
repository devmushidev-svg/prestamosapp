import { MessageCircle, PhoneCall } from "lucide-react";
import { useId } from "react";
import { Button } from "./ui";
import {
  buildCollectionWhatsAppMessage,
  normalizeHondurasPhone,
  openWhatsAppChat,
} from "../lib/whatsappService";

export type WhatsAppContactActionsProps = {
  phone: string | null | undefined;
  customerName: string;
  message?: string;
  compact?: boolean;
  stacked?: boolean;
  className?: string;
  showCallHint?: boolean;
};

export function WhatsAppContactActions({
  phone,
  customerName,
  message,
  compact = false,
  stacked = false,
  className = "",
  showCallHint,
}: WhatsAppContactActionsProps) {
  const callHintId = useId();
  const shouldShowCallHint = showCallHint ?? !compact;
  const hasValidPhone = Boolean(normalizeHondurasPhone(phone));
  const safeCustomerName = customerName.trim() || "el cliente";
  const chatMessage = message ?? buildCollectionWhatsAppMessage({ clienteNombre: safeCustomerName });
  const invalidPhoneLabel = `${safeCustomerName} no tiene un teléfono con formato válido para WhatsApp`;

  return (
    <div className={className}>
      <div className={compact ? `flex gap-2 ${stacked ? "flex-col" : "flex-wrap"}` : "grid gap-2 sm:grid-cols-2"}>
        <Button
          type="button"
          className={compact ? "min-h-[44px] min-w-[44px] px-3 py-2 text-xs" : "min-h-[44px]"}
          disabled={!hasValidPhone}
          onClick={() => openWhatsAppChat(phone, chatMessage, { fallbackSameTab: true })}
          aria-label={hasValidPhone ? `Escribir por WhatsApp a ${safeCustomerName}` : invalidPhoneLabel}
          title={hasValidPhone ? `Escribir por WhatsApp a ${safeCustomerName}` : invalidPhoneLabel}
        >
          <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {compact ? <span className="sr-only">Escribir por WhatsApp</span> : "Escribir por WhatsApp"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          className={compact ? "min-h-[44px] min-w-[44px] px-3 py-2 text-xs" : "min-h-[44px]"}
          disabled={!hasValidPhone}
          onClick={() => openWhatsAppChat(phone, undefined, { fallbackSameTab: true })}
          aria-label={hasValidPhone ? `Abrir WhatsApp para llamar a ${safeCustomerName}` : invalidPhoneLabel}
          aria-describedby={shouldShowCallHint ? callHintId : undefined}
          title={hasValidPhone ? "Abre WhatsApp; confirme la llamada dentro de la conversación" : invalidPhoneLabel}
        >
          <PhoneCall className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {compact ? <span className="sr-only">Abrir WhatsApp para llamar</span> : "Abrir para llamar"}
        </Button>
      </div>

      {shouldShowCallHint ? (
        <p id={callHintId} className="mt-1.5 text-xs leading-relaxed text-pf-muted">
          &ldquo;Abrir para llamar&rdquo; abre la conversación en WhatsApp; confirme la llamada dentro de la aplicación.
        </p>
      ) : null}
    </div>
  );
}
