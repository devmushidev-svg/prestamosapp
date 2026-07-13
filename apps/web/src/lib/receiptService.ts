/**
 * Único punto de emisión y compartido de recibos. Al pasar a la versión
 * nativa solo cambia este módulo; las pantallas siguen llamando emitirRecibo.
 */
import type { ReciboSnapshot } from "../types";

export type DatosRecibo = ReciboSnapshot;

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number | null) {
  if (value == null) return "—";
  return `L ${value.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function receiptDate(value: string) {
  return new Date(value).toLocaleString("es-HN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Tegucigalpa",
  });
}

function receiptHtml(data: DatosRecibo) {
  const applications = data.aplicaciones
    .map(
      (item) => `<div class="row"><span>Cuota #${escapeHtml(item.numeroCuota)}</span><strong>${escapeHtml(money(item.monto))}</strong></div>`
    )
    .join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(data.numeroRecibo)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; line-height: 1.45; }
  h1, p { margin: 0; }
  .center { text-align: center; }
  .business { font-size: 15px; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
  .title { padding: 10px 0; font-size: 14px; font-weight: 900; letter-spacing: .08em; }
  .rule { border-top: 1px dashed #6b7280; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
  .row strong { text-align: right; overflow-wrap: anywhere; }
  .amount { padding: 8px 0; font-size: 18px; font-weight: 900; text-align: center; }
  .foot { padding-top: 10px; text-align: center; }
  @media print { body { width: 72mm; } }
</style></head><body>
  <header class="center">
    <h1 class="business">${escapeHtml(data.negocio.nombre)}</h1>
    ${data.negocio.telefono ? `<p>Tel. ${escapeHtml(data.negocio.telefono)}</p>` : ""}
    ${data.negocio.direccion ? `<p>${escapeHtml(data.negocio.direccion)}</p>` : ""}
    ${data.negocio.rtn ? `<p>RTN ${escapeHtml(data.negocio.rtn)}</p>` : ""}
  </header>
  <div class="rule"></div><p class="title center">RECIBO DE PAGO</p><div class="rule"></div>
  <div class="row"><span>Recibo</span><strong>${escapeHtml(data.numeroRecibo)}</strong></div>
  <div class="row"><span>Fecha</span><strong>${escapeHtml(receiptDate(data.fecha))}</strong></div>
  <div class="row"><span>Cliente</span><strong>${escapeHtml(data.clienteNombre)}</strong></div>
  ${data.clienteIdentidad ? `<div class="row"><span>DNI</span><strong>${escapeHtml(data.clienteIdentidad)}</strong></div>` : ""}
  <div class="row"><span>Préstamo</span><strong>${escapeHtml(data.numeroPrestamo)}</strong></div>
  <div class="rule"></div><p class="center">Monto recibido</p><p class="amount">${escapeHtml(money(data.monto))}</p><div class="rule"></div>
  ${applications}
  <div class="rule"></div>
  <div class="row"><span>Saldo anterior</span><strong>${escapeHtml(money(data.saldoAnterior))}</strong></div>
  <div class="row"><span>Saldo restante</span><strong>${escapeHtml(money(data.saldoRestante))}</strong></div>
  <footer class="foot">
    ${data.negocio.propietario ? `<p>Atendido por</p><p><strong>${escapeHtml(data.negocio.propietario)}</strong></p>` : ""}
    <p style="margin-top:10px">Gracias por su pago</p>
  </footer>
</body></html>`;
}

export function emitirRecibo(data: DatosRecibo): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", `Impresión ${data.numeroRecibo}`);
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(failsafe);
    iframe.remove();
  };
  const failsafe = window.setTimeout(cleanup, 120_000);
  iframe.addEventListener("load", () => {
    const target = iframe.contentWindow;
    if (!target) {
      cleanup();
      return;
    }
    target.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      target.focus();
      target.print();
    }, 100);
  }, { once: true });
  iframe.srcdoc = receiptHtml(data);
  document.body.appendChild(iframe);
}

export function compartirReciboWhatsApp(data: DatosRecibo): void {
  const text = [
    `${data.negocio.nombre} — ${data.numeroRecibo}`,
    `Cliente: ${data.clienteNombre}`,
    `Pago: ${money(data.monto)}`,
    `Saldo restante: ${money(data.saldoRestante)}`,
    `Préstamo: ${data.numeroPrestamo}`,
    `Fecha: ${receiptDate(data.fecha)}`,
  ].join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

/** v2: impresión ESC/POS en térmicas Bluetooth. */
export function imprimirEscPosBluetooth(_data: DatosRecibo): void {
  // TODO v2: Capacitor
  throw new Error("Impresión Bluetooth nativa llega en la v2.");
}
