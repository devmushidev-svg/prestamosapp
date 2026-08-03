import { ArrowLeft, CheckCircle2, ImageIcon, Plus, Printer, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { Button, Card, EmptyState } from "../components/ui";
import { formatDate, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { getPaymentDetails, type PaymentDetail } from "../lib/paymentService";
import {
  compartirReciboWhatsApp,
  emitirRecibo,
  formatReceiptRate,
  getCreditStatusLabel,
  prepararReciboPng,
  type DatosComprobanteCobro,
  type DatosEmitibles,
  type DatosRecibo,
} from "../lib/receiptService";
import type { ConfiguracionPrestamista } from "../types";

const PAYMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function TicketRow({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 py-1 text-xs">
      <span className="shrink-0 text-stone-500">{label}</span>
      <span className={`min-w-0 break-words text-right ${strong ? "font-black text-stone-950" : "font-semibold text-stone-800"}`}>{children}</span>
    </div>
  );
}

type ReceiptNavigationState = {
  created?: boolean;
  origen?: string;
  pagoIds?: string[];
  totalCobrado?: number;
  clienteId?: string;
  saldoClienteAnterior?: number;
  saldoClienteRestante?: number;
};

const EMPTY_RECEIPT_NAVIGATION_STATE: ReceiptNavigationState = {};

function buildReceiptData(detail: PaymentDetail, config: ConfiguracionPrestamista | null): DatosRecibo {
  if (detail.pago.datos_recibo) return detail.pago.datos_recibo;
  return {
    version: 1,
    numeroRecibo: formatPaymentNumber(detail.pago.numero_recibo, detail.pago.recibo),
    fecha: detail.pago.fecha,
    clienteNombre: detail.prestamo.cliente?.nombre ?? "Cliente no disponible",
    clienteIdentidad: detail.prestamo.cliente?.identidad,
    numeroPrestamo: formatLoanNumber(detail.prestamo.numero, detail.prestamo.id),
    monto: detail.pago.monto,
    saldoAnterior: detail.pago.saldo_anterior,
    saldoRestante: detail.pago.saldo_posterior,
    // Los recibos anteriores al snapshot no deben adoptar el estado actual del
    // préstamo. Solo "pagado" se puede reconstruir con certeza desde el saldo.
    estadoCredito: detail.pago.saldo_posterior === 0 ? "pagado" : undefined,
    tasaMora: undefined,
    negocio: {
      nombre: config?.nombre_negocio || "MultiPréstamos",
      propietario: config?.nombre_propietario,
      rtn: config?.rtn,
      telefono: config?.telefono,
      direccion: config?.direccion,
    },
    aplicaciones: detail.aplicaciones.map((application) => ({
      numeroCuota: application.cuota?.numero ?? 0,
      monto: application.monto,
    })),
  };
}

function IndividualReceiptCard({ data }: { data: DatosRecibo }) {
  const creditStatus = getCreditStatusLabel(data.estadoCredito);
  const lateFeeRate = formatReceiptRate(data.tasaMora);
  return (
    <Card className="border-white/50 bg-white/95 p-6 font-mono text-stone-900 shadow-lg print:border-0 print:p-0 print:shadow-none">
      <header className="text-center">
        <h1 className="break-words text-lg font-black uppercase tracking-tight">{data.negocio.nombre}</h1>
        {data.negocio.telefono ? <p className="mt-1 break-words text-xs">Tel. {data.negocio.telefono}</p> : null}
        {data.negocio.direccion ? <p className="break-words text-xs">{data.negocio.direccion}</p> : null}
        {data.negocio.rtn ? <p className="text-xs">RTN {data.negocio.rtn}</p> : null}
      </header>
      <div className="my-4 border-t border-dashed border-stone-400" />
      <h2 className="text-center text-base font-black tracking-widest">RECIBO DE PAGO</h2>
      <div className="my-4 border-t border-dashed border-stone-400" />
      <TicketRow label="Recibo" strong>{data.numeroRecibo}</TicketRow>
      <TicketRow label="Fecha">{formatDate(data.fecha)}</TicketRow>
      <TicketRow label="Cliente">{data.clienteNombre}</TicketRow>
      {data.clienteIdentidad ? <TicketRow label="DNI">{data.clienteIdentidad}</TicketRow> : null}
      <TicketRow label="Préstamo">{data.numeroPrestamo}</TicketRow>
      <TicketRow label="Situación del crédito" strong>{creditStatus}</TicketRow>
      {lateFeeRate ? <TicketRow label="Mora pactada">{lateFeeRate}</TicketRow> : null}
      <div className="my-4 border-t border-dashed border-stone-400" />
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500">Pago</p>
      <p className="mt-1 text-center text-3xl font-black tabular-nums">{formatMoney("L", data.monto)}</p>
      <div className="my-4 border-t border-dashed border-stone-400" />
      {data.aplicaciones.map((application, index) => (
        <TicketRow key={`${application.numeroCuota}-${index}`} label={`Cuota #${application.numeroCuota || "—"}`}>{formatMoney("L", application.monto)}</TicketRow>
      ))}
      <div className="my-4 border-t border-dashed border-stone-400" />
      <TicketRow label="Saldo anterior">{data.saldoAnterior == null ? "—" : formatMoney("L", data.saldoAnterior)}</TicketRow>
      <TicketRow label="Saldo a pagar" strong>{data.saldoRestante == null ? "—" : formatMoney("L", data.saldoRestante)}</TicketRow>
      <footer className="mt-6 text-center text-xs">
        {data.negocio.propietario ? <><p>Atendido por</p><p className="font-black">{data.negocio.propietario}</p></> : null}
        <p className="mt-5">Gracias por su pago</p>
      </footer>
    </Card>
  );
}

function ConsolidatedReceiptCard({ data }: { data: DatosComprobanteCobro }) {
  return (
    <Card className="border-white/50 bg-white/95 p-6 font-mono text-stone-900 shadow-lg print:border-0 print:p-0 print:shadow-none">
      <header className="text-center">
        <h1 className="break-words text-lg font-black uppercase tracking-tight">{data.negocio.nombre}</h1>
        {data.negocio.telefono ? <p className="mt-1 break-words text-xs">Tel. {data.negocio.telefono}</p> : null}
        {data.negocio.direccion ? <p className="break-words text-xs">{data.negocio.direccion}</p> : null}
        {data.negocio.rtn ? <p className="text-xs">RTN {data.negocio.rtn}</p> : null}
      </header>
      <div className="my-4 border-t border-dashed border-stone-400" />
      <h2 className="text-center text-base font-black tracking-widest">COMPROBANTE DE COBRO</h2>
      <div className="my-4 border-t border-dashed border-stone-400" />
      <TicketRow label="Fecha">{formatDate(data.fecha)}</TicketRow>
      <TicketRow label="Cliente">{data.clienteNombre}</TicketRow>
      {data.clienteIdentidad ? <TicketRow label="DNI">{data.clienteIdentidad}</TicketRow> : null}
      <TicketRow label="Recibos emitidos" strong>{data.recibos.length}</TicketRow>
      <div className="my-4 border-t border-dashed border-stone-400" />
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500">Pago total</p>
      <p className="mt-1 text-center text-3xl font-black tabular-nums">{formatMoney("L", data.montoTotal)}</p>
      {data.recibos.map((receipt) => (
        <section key={receipt.pagoId} className="mt-4 border-t border-dashed border-stone-400 pt-3">
          <p className="mb-1 text-center text-xs font-black">{receipt.numeroPrestamo}</p>
          <TicketRow label="Recibo oficial">{receipt.numeroRecibo}</TicketRow>
          <TicketRow label="Aplicado" strong>{formatMoney("L", receipt.monto)}</TicketRow>
          {receipt.aplicaciones.length ? (
            <TicketRow label="Cuotas">{receipt.aplicaciones.map((item) => `#${item.numeroCuota || "—"}`).join(", ")}</TicketRow>
          ) : null}
          <TicketRow label="Situación">{getCreditStatusLabel(receipt.estadoCredito)}</TicketRow>
          {formatReceiptRate(receipt.tasaMora) ? <TicketRow label="Mora pactada">{formatReceiptRate(receipt.tasaMora)}</TicketRow> : null}
          <TicketRow label="Saldo préstamo">{receipt.saldoRestante == null ? "—" : formatMoney("L", receipt.saldoRestante)}</TicketRow>
        </section>
      ))}
      <div className="my-4 border-t border-dashed border-stone-400" />
      <TicketRow label="Saldo anterior cliente">{formatMoney("L", data.saldoClienteAnterior)}</TicketRow>
      <TicketRow label="Saldo a pagar" strong>{formatMoney("L", data.saldoClienteRestante)}</TicketRow>
      <footer className="mt-6 text-center text-xs">
        {data.negocio.propietario ? <><p>Atendido por</p><p className="font-black">{data.negocio.propietario}</p></> : null}
        <p className="mt-5">Gracias por su pago</p>
      </footer>
    </Card>
  );
}

export function PaymentReceiptPage() {
  const { paymentId = "" } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useBusinessConfig();
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [batchDetails, setBatchDetails] = useState<PaymentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preparedImage, setPreparedImage] = useState<{ key: string; file: File } | null>(null);
  const [imageErrorKey, setImageErrorKey] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(null);
  const navigationState = (location.state as ReceiptNavigationState | null) ?? EMPTY_RECEIPT_NAVIGATION_STATE;
  const [createdNoticePaymentId] = useState(() => navigationState.created ? paymentId : "");
  const showCreated = createdNoticePaymentId === paymentId;
  const desdeCobranza = navigationState.origen === "cobranza";
  const receiptIds = useMemo(() => {
    if (!PAYMENT_ID_PATTERN.test(paymentId)) return [];
    const candidates = navigationState.pagoIds;
    const hasCompleteBatchState = Array.isArray(candidates)
      && candidates.length > 1
      && Boolean(navigationState.clienteId)
      && Number.isFinite(Number(navigationState.totalCobrado))
      && Number.isFinite(Number(navigationState.saldoClienteAnterior))
      && Number.isFinite(Number(navigationState.saldoClienteRestante));
    if (!hasCompleteBatchState) return [paymentId];
    const ids = Array.from(new Set(candidates.filter((id) => PAYMENT_ID_PATTERN.test(id))));
    return ids.length === candidates.length && ids.includes(paymentId) ? ids : [paymentId];
  }, [navigationState, paymentId]);
  const recibosCobranza = receiptIds.length > 1 ? receiptIds : [];

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    setError("");
    try {
      const details = await getPaymentDetails(receiptIds.length ? receiptIds : [paymentId]);
      const current = details.find((item) => item.pago.id === paymentId);
      if (!current) throw new Error("El recibo solicitado no pertenece a este cobro.");
      setDetail(current);
      setBatchDetails(details);
      if (details.length > 1) {
        const customerIds = new Set(details.map((item) => item.prestamo.cliente?.id).filter(Boolean));
        if (customerIds.size !== 1) throw new Error("Los recibos seleccionados pertenecen a clientes diferentes.");
        if (Array.from(customerIds)[0] !== navigationState.clienteId) {
          throw new Error("El comprobante no coincide con el cliente de este cobro.");
        }
        const receivedCents = details.reduce((total, item) => total + Math.round(item.pago.monto * 100), 0);
        if (receivedCents !== Math.round(Number(navigationState.totalCobrado) * 100)) {
          throw new Error("El total del comprobante no coincide con los pagos registrados.");
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message || "No pudimos cargar este recibo. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [navigationState.clienteId, navigationState.totalCobrado, paymentId, receiptIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (navigationState.created) {
      navigate(location.pathname, {
        replace: true,
        state: { ...navigationState, created: false },
      });
    }
  }, [location.pathname, navigate, navigationState]);

  const receiptData = useMemo<DatosRecibo | null>(() => {
    return detail ? buildReceiptData(detail, config) : null;
  }, [config, detail]);

  const consolidatedReceiptData = useMemo<DatosComprobanteCobro | null>(() => {
    if (batchDetails.length < 2) return null;
    const receipts = batchDetails.map((item) => ({ detail: item, receipt: buildReceiptData(item, config) }));
    const totalCents = receipts.reduce((total, item) => total + Math.round(item.receipt.monto * 100), 0);
    const saldoClienteRestante = Number(navigationState.saldoClienteRestante);
    const saldoClienteAnterior = Number(navigationState.saldoClienteAnterior);
    const first = receipts[0].receipt;
    return {
      tipo: "cobro_cliente",
      fecha: first.fecha,
      clienteNombre: first.clienteNombre,
      clienteIdentidad: first.clienteIdentidad,
      negocio: first.negocio,
      montoTotal: totalCents / 100,
      saldoClienteAnterior,
      saldoClienteRestante,
      recibos: receipts.map(({ detail: item, receipt }) => ({
        pagoId: item.pago.id,
        numeroRecibo: receipt.numeroRecibo,
        numeroPrestamo: receipt.numeroPrestamo,
        monto: receipt.monto,
        saldoAnterior: receipt.saldoAnterior,
        saldoRestante: receipt.saldoRestante,
        estadoCredito: receipt.estadoCredito,
        tasaMora: receipt.tasaMora,
        aplicaciones: receipt.aplicaciones,
      })),
    };
  }, [batchDetails, config, navigationState.saldoClienteAnterior, navigationState.saldoClienteRestante]);
  const emitData: DatosEmitibles | null = consolidatedReceiptData ?? receiptData;
  const receiptImageKey = useMemo(() => emitData ? JSON.stringify(emitData) : "", [emitData]);
  const receiptImage = preparedImage?.key === receiptImageKey ? preparedImage.file : null;
  const preparingImage = Boolean(emitData && !receiptImage && imageErrorKey !== receiptImageKey);

  useEffect(() => {
    if (!emitData || !receiptImageKey) return;
    let cancelled = false;
    setPreparedImage(null);
    setImageErrorKey("");
    setShareNotice(null);
    const frame = window.requestAnimationFrame(() => {
      void prepararReciboPng(emitData)
        .then((file) => {
          if (cancelled) return;
          setPreparedImage({ key: receiptImageKey, file });
          setImageErrorKey("");
        })
        .catch(() => {
          if (cancelled) return;
          setPreparedImage(null);
          setImageErrorKey(receiptImageKey);
        });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [emitData, receiptImageKey]);

  async function handleShareReceipt() {
    if (!emitData || sharing) return;
    setSharing(true);
    setShareNotice(null);
    try {
      const sharePromise = compartirReciboWhatsApp(emitData, receiptImage);
      const result = await sharePromise;
      if (result.estado === "compartido") {
        setShareNotice({ tone: "success", text: `${consolidatedReceiptData ? "Comprobante" : "Recibo"} compartido como imagen.` });
      } else if (result.estado === "descargado") {
        setShareNotice({
          tone: "info",
          text: result.whatsappAbierto
            ? `Descargamos ${result.nombreArchivo}. Adjúntelo en la conversación de WhatsApp que se abrió.`
            : `Descargamos ${result.nombreArchivo}. Abra WhatsApp y adjunte esa imagen.`,
        });
      } else if (result.estado === "texto") {
        setShareNotice({
          tone: "danger",
          text: result.whatsappAbierto
            ? "Este navegador no pudo crear la imagen; se abrió el resumen en texto como respaldo."
            : "Este navegador no pudo crear la imagen ni abrir WhatsApp. Use Imprimir / guardar PDF como respaldo.",
        });
      }
    } catch {
      setShareNotice({ tone: "danger", text: "No pudimos compartir la imagen. Intente de nuevo o guarde el PDF." });
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <Card className="mx-auto max-w-md p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando recibo…</Card>;
  if (error || !detail || !receiptData || !emitData) {
    return (
      <Card className="mx-auto max-w-md">
        <EmptyState title="No se pudo abrir el recibo" description={error || "El pago solicitado no está disponible."} icon={<ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<div className="flex flex-wrap justify-center gap-2"><Button type="button" variant="secondary" onClick={() => navigate("/pagos")}>Volver</Button><Button type="button" onClick={() => void load()}>Reintentar</Button></div>} />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pf-safe-page print:max-w-none">
      {showCreated ? (
        <div className="rounded-xl border border-pf-success-soft bg-pf-success-soft/60 px-4 py-3 text-sm font-semibold text-pf-success" role="status">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />{recibosCobranza.length > 1 ? "Cobro registrado correctamente" : "Pago registrado correctamente"}</p>
          <p className="mt-1 pl-7 text-xs font-medium">
            {consolidatedReceiptData
              ? `Total recibido: ${formatMoney("L", consolidatedReceiptData.montoTotal)}`
              : `Saldo a pagar: ${formatMoney("L", detail.pago.saldo_posterior ?? detail.prestamo.saldo)}`}
          </p>
        </div>
      ) : null}

      {recibosCobranza.length > 1 ? (
        <Card className="space-y-3 border-pf-info-soft bg-pf-info-soft/30 print:hidden">
          <div>
            <p className="text-sm font-black text-pf-text">Recibos de este cobro</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-pf-muted">
              El monto cubrió {recibosCobranza.length} préstamos. Los recibos oficiales están reunidos en el comprobante único que puede imprimir o compartir abajo.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recibosCobranza.map((id, index) => {
              return (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(`/pagos/${id}/recibo`, { state: { origen: navigationState.origen } })}
                >
                  <ReceiptText className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {`Abrir recibo ${index + 1}`}
                </Button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="space-y-2 print:hidden">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" className="min-h-[52px] sm:col-span-2" onClick={() => emitirRecibo(emitData)}><Printer className="h-5 w-5" strokeWidth={2} aria-hidden />{consolidatedReceiptData ? "Imprimir cobro completo / PDF" : "Imprimir / guardar PDF"}</Button>
          <Button type="button" variant="secondary" disabled={sharing || preparingImage} onClick={() => void handleShareReceipt()}><ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden />{preparingImage ? "Preparando imagen…" : sharing ? "Compartiendo…" : consolidatedReceiptData ? "Compartir cobro completo" : "Compartir imagen"}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/pagos/nuevo?prestamoId=${encodeURIComponent(detail.prestamo.id)}`)}><Plus className="h-4 w-4" strokeWidth={2} aria-hidden />Registrar otro pago</Button>
          <Button type="button" variant="ghost" className="sm:col-span-2" onClick={() => navigate(desdeCobranza ? "/cobranza" : `/prestamos/${detail.prestamo.id}`)}><ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />{desdeCobranza ? "Volver a la ruta" : "Volver al préstamo"}</Button>
        </div>
        {shareNotice ? (
          <p
            role={shareNotice.tone === "danger" ? "alert" : "status"}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              shareNotice.tone === "success"
                ? "border-pf-success-soft bg-pf-success-soft/60 text-pf-success"
                : shareNotice.tone === "danger"
                  ? "border-pf-danger-soft bg-pf-danger-soft/50 text-pf-danger"
                  : "border-pf-info-soft bg-pf-info-soft/50 text-pf-info"
            }`}
          >
            {shareNotice.text}
          </p>
        ) : null}
      </div>

      {consolidatedReceiptData
        ? <ConsolidatedReceiptCard data={consolidatedReceiptData} />
        : <IndividualReceiptCard data={receiptData} />}
    </div>
  );
}
