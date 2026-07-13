/**
 * Único punto de emisión y compartido de recibos. Al pasar a la versión
 * nativa solo cambia este módulo; las pantallas siguen llamando emitirRecibo.
 */
import type { ReciboSnapshot } from "../types";

export type DatosRecibo = ReciboSnapshot;

export type ResultadoCompartirRecibo =
  | { estado: "compartido"; nombreArchivo: string }
  | { estado: "descargado"; nombreArchivo: string; whatsappAbierto: boolean }
  | { estado: "cancelado"; nombreArchivo: string }
  | { estado: "texto"; whatsappAbierto: boolean };

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

const RECEIPT_IMAGE_WIDTH = 1080;
const RECEIPT_IMAGE_MIN_HEIGHT = 1400;
const RECEIPT_IMAGE_MAX_HEIGHT = 4096;
const RECEIPT_IMAGE_MAX_APPLICATION_ROWS = 40;
const RECEIPT_IMAGE_MAX_TEXT_LENGTH = 240;
const RECEIPT_IMAGE_MAX_TEXT_LINES = 4;
const RECEIPT_IMAGE_LEFT = 108;
const RECEIPT_IMAGE_RIGHT = RECEIPT_IMAGE_WIDTH - RECEIPT_IMAGE_LEFT;
const RECEIPT_IMAGE_CENTER = RECEIPT_IMAGE_WIDTH / 2;
const RECEIPT_IMAGE_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function setCanvasFont(context: CanvasRenderingContext2D, size: number, weight = 400) {
  context.font = `${weight} ${size}px ${RECEIPT_IMAGE_FONT}`;
}

function splitLongCanvasWord(context: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const parts: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = `${current}${character}`;
    if (current && context.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function fitCanvasEllipsis(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let fitted = value;
  while (fitted && context.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  const rawValue = String(value || " ");
  const boundedValue = rawValue.length > RECEIPT_IMAGE_MAX_TEXT_LENGTH
    ? `${rawValue.slice(0, RECEIPT_IMAGE_MAX_TEXT_LENGTH - 1)}…`
    : rawValue;
  const paragraphs = boundedValue.split(/\r?\n/);
  let truncated = rawValue !== boundedValue;
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push(" ");
      continue;
    }
    let current = "";
    for (const originalWord of words) {
      const wordParts = context.measureText(originalWord).width > maxWidth
        ? splitLongCanvasWord(context, originalWord, maxWidth)
        : [originalWord];
      for (const word of wordParts) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && context.measureText(candidate).width > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
    if (lines.length >= RECEIPT_IMAGE_MAX_TEXT_LINES && paragraphIndex < paragraphs.length - 1) {
      truncated = true;
      break;
    }
  }
  if (!lines.length) return [" "];
  if (lines.length > RECEIPT_IMAGE_MAX_TEXT_LINES) {
    truncated = true;
    lines.length = RECEIPT_IMAGE_MAX_TEXT_LINES;
  }
  if (truncated) {
    lines[lines.length - 1] = fitCanvasEllipsis(
      context,
      lines[lines.length - 1].replace(/…$/, ""),
      maxWidth
    );
  }
  return lines;
}

function layoutReceiptImage(context: CanvasRenderingContext2D, data: DatosRecibo, paint: boolean) {
  const contentWidth = RECEIPT_IMAGE_RIGHT - RECEIPT_IMAGE_LEFT;
  let y = 92;
  context.textBaseline = "top";

  const centered = (
    value: string,
    size: number,
    weight: number,
    lineHeight: number,
    color = "#111827",
    maxWidth = contentWidth
  ) => {
    setCanvasFont(context, size, weight);
    const lines = wrapCanvasText(context, value, maxWidth);
    if (paint) {
      context.fillStyle = color;
      context.textAlign = "center";
      lines.forEach((line, index) => context.fillText(line, RECEIPT_IMAGE_CENTER, y + index * lineHeight));
    }
    y += lines.length * lineHeight;
  };

  const divider = () => {
    if (paint) {
      context.save();
      context.strokeStyle = "#9ca3af";
      context.lineWidth = 2;
      context.setLineDash([14, 10]);
      context.beginPath();
      context.moveTo(RECEIPT_IMAGE_LEFT, y + 16);
      context.lineTo(RECEIPT_IMAGE_RIGHT, y + 16);
      context.stroke();
      context.restore();
    }
    y += 50;
  };

  const row = (label: string, value: string, strong = false) => {
    setCanvasFont(context, 28, 500);
    const labelLines = wrapCanvasText(context, label, 250);
    setCanvasFont(context, strong ? 32 : 29, strong ? 900 : 700);
    const valueLines = wrapCanvasText(context, value, 560);
    const lineHeight = strong ? 42 : 38;
    const rowHeight = Math.max(labelLines.length * 36, valueLines.length * lineHeight, 42);
    if (paint) {
      setCanvasFont(context, 28, 500);
      context.fillStyle = "#6b7280";
      context.textAlign = "left";
      labelLines.forEach((line, index) => context.fillText(line, RECEIPT_IMAGE_LEFT, y + index * 36));
      setCanvasFont(context, strong ? 32 : 29, strong ? 900 : 700);
      context.fillStyle = strong ? "#0c0a09" : "#1f2937";
      context.textAlign = "right";
      valueLines.forEach((line, index) => context.fillText(line, RECEIPT_IMAGE_RIGHT, y + index * lineHeight));
    }
    y += rowHeight + 14;
  };

  centered(data.negocio.nombre.toUpperCase(), 46, 900, 58);
  if (data.negocio.telefono) centered(`Tel. ${data.negocio.telefono}`, 27, 500, 36, "#374151");
  if (data.negocio.direccion) centered(data.negocio.direccion, 27, 500, 36, "#374151");
  if (data.negocio.rtn) centered(`RTN ${data.negocio.rtn}`, 27, 500, 36, "#374151");
  y += 12;
  divider();
  centered("RECIBO DE PAGO", 38, 900, 50);
  divider();
  row("Recibo", data.numeroRecibo, true);
  row("Fecha", receiptDate(data.fecha));
  row("Cliente", data.clienteNombre);
  if (data.clienteIdentidad) row("DNI", data.clienteIdentidad);
  row("Préstamo", data.numeroPrestamo);
  divider();
  centered("MONTO RECIBIDO", 25, 700, 36, "#6b7280");
  y += 8;
  centered(money(data.monto), 66, 900, 80, "#0c0a09");
  y += 10;
  divider();
  const visibleApplications = data.aplicaciones.slice(0, RECEIPT_IMAGE_MAX_APPLICATION_ROWS);
  visibleApplications.forEach((application) => {
    row(`Cuota #${application.numeroCuota || "—"}`, money(application.monto));
  });
  if (data.aplicaciones.length > visibleApplications.length) {
    const remainingApplications = data.aplicaciones.slice(visibleApplications.length);
    const remainingAmount = remainingApplications.reduce((total, application) => total + application.monto, 0);
    row(`${remainingApplications.length} cuotas adicionales`, money(remainingAmount));
  }
  divider();
  row("Saldo anterior", money(data.saldoAnterior));
  row("Saldo restante", money(data.saldoRestante), true);
  y += 34;
  if (data.negocio.propietario) {
    centered("Atendido por", 25, 500, 34, "#6b7280");
    centered(data.negocio.propietario, 29, 800, 40);
    y += 20;
  }
  centered("Gracias por su pago", 29, 700, 40);
  y += 54;
  return y;
}

function imageFileName(data: DatosRecibo) {
  const safeNumber = data.numeroRecibo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `recibo-${safeNumber || "pago"}.png`;
}

/** Genera localmente un PNG térmico; no sube el comprobante ni sus datos. */
export async function prepararReciboPng(data: DatosRecibo): Promise<File> {
  const measuringCanvas = document.createElement("canvas");
  measuringCanvas.width = RECEIPT_IMAGE_WIDTH;
  measuringCanvas.height = 1;
  const measuringContext = measuringCanvas.getContext("2d");
  if (!measuringContext) throw new Error("Este navegador no puede crear la imagen del recibo.");
  const measuredHeight = layoutReceiptImage(measuringContext, data, false);
  if (!Number.isFinite(measuredHeight) || measuredHeight > RECEIPT_IMAGE_MAX_HEIGHT) {
    throw new Error("El recibo es demasiado extenso para convertirlo en imagen.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = RECEIPT_IMAGE_WIDTH;
  canvas.height = Math.max(RECEIPT_IMAGE_MIN_HEIGHT, Math.ceil(measuredHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no puede crear la imagen del recibo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  layoutReceiptImage(context, data, true);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error("No se pudo preparar la imagen del recibo."));
        return;
      }
      resolve(new File([blob], imageFileName(data), { type: "image/png", lastModified: Date.now() }));
    }, "image/png");
  });
}

function receiptShareText(data: DatosRecibo) {
  return [
    `${data.negocio.nombre} — ${data.numeroRecibo}`,
    `Cliente: ${data.clienteNombre}`,
    `Pago: ${money(data.monto)}`,
    `Saldo restante: ${money(data.saldoRestante)}`,
    `Préstamo: ${data.numeroPrestamo}`,
    `Fecha: ${receiptDate(data.fecha)}`,
  ].join("\n");
}

function openWhatsAppText(data: DatosRecibo) {
  const target = window.open("about:blank", "_blank");
  if (!target) return false;
  target.opener = null;
  target.location.href = `https://wa.me/?text=${encodeURIComponent(receiptShareText(data))}`;
  return true;
}

function downloadReceiptImage(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function canShareImage(file: File) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isShareCancellation(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && (error as { name?: unknown }).name === "AbortError"
  );
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

export async function compartirReciboWhatsApp(
  data: DatosRecibo,
  preparedImage?: File | null
): Promise<ResultadoCompartirRecibo> {
  if (!preparedImage || preparedImage.size === 0) {
    return { estado: "texto", whatsappAbierto: openWhatsAppText(data) };
  }
  const image = preparedImage;

  if (canShareImage(image)) {
    try {
      await navigator.share({
        title: `Recibo ${data.numeroRecibo}`,
        text: receiptShareText(data),
        files: [image],
      });
      return { estado: "compartido", nombreArchivo: image.name };
    } catch (error) {
      if (isShareCancellation(error)) {
        return { estado: "cancelado", nombreArchivo: image.name };
      }
    }
  }

  const whatsappAbierto = openWhatsAppText(data);
  downloadReceiptImage(image);
  return { estado: "descargado", nombreArchivo: image.name, whatsappAbierto };
}

/** v2: impresión ESC/POS en térmicas Bluetooth. */
export function imprimirEscPosBluetooth(_data: DatosRecibo): void {
  // TODO v2: Capacitor
  throw new Error("Impresión Bluetooth nativa llega en la v2.");
}
