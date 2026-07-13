import { ArrowLeft, CheckCircle2, ImageIcon, Plus, Printer, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { Button, Card, EmptyState } from "../components/ui";
import { formatDate, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { getPaymentDetail, type PaymentDetail } from "../lib/paymentService";
import {
  compartirReciboWhatsApp,
  emitirRecibo,
  prepararReciboPng,
  type DatosRecibo,
} from "../lib/receiptService";

function TicketRow({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 py-1 text-xs">
      <span className="shrink-0 text-stone-500">{label}</span>
      <span className={`min-w-0 break-words text-right ${strong ? "font-black text-stone-950" : "font-semibold text-stone-800"}`}>{children}</span>
    </div>
  );
}

export function PaymentReceiptPage() {
  const { paymentId = "" } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useBusinessConfig();
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preparedImage, setPreparedImage] = useState<{ key: string; file: File } | null>(null);
  const [imageErrorKey, setImageErrorKey] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(null);
  const [showCreated] = useState(() => Boolean((location.state as { created?: boolean } | null)?.created));

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    setError("");
    try {
      setDetail(await getPaymentDetail(paymentId));
    } catch {
      setError("No pudimos cargar este recibo. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showCreated) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, showCreated]);

  const receiptData = useMemo<DatosRecibo | null>(() => {
    if (!detail) return null;
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
  }, [config, detail]);

  const receiptImageKey = useMemo(() => receiptData ? JSON.stringify(receiptData) : "", [receiptData]);
  const receiptImage = preparedImage?.key === receiptImageKey ? preparedImage.file : null;
  const preparingImage = Boolean(receiptData && !receiptImage && imageErrorKey !== receiptImageKey);

  useEffect(() => {
    if (!receiptData || !receiptImageKey) return;
    let cancelled = false;
    setPreparedImage(null);
    setImageErrorKey("");
    setShareNotice(null);
    const frame = window.requestAnimationFrame(() => {
      void prepararReciboPng(receiptData)
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
  }, [receiptData, receiptImageKey]);

  async function handleShareReceipt() {
    if (!receiptData || sharing) return;
    setSharing(true);
    setShareNotice(null);
    try {
      const sharePromise = compartirReciboWhatsApp(receiptData, receiptImage);
      const result = await sharePromise;
      if (result.estado === "compartido") {
        setShareNotice({ tone: "success", text: "Recibo compartido como imagen." });
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
  if (error || !detail || !receiptData) {
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
          <p className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />Pago registrado correctamente</p>
          <p className="mt-1 pl-7 text-xs font-medium">Nuevo saldo: {formatMoney("L", detail.pago.saldo_posterior ?? detail.prestamo.saldo)}</p>
        </div>
      ) : null}

      <div className="space-y-2 print:hidden">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" className="min-h-[52px] sm:col-span-2" onClick={() => emitirRecibo(receiptData)}><Printer className="h-5 w-5" strokeWidth={2} aria-hidden />Imprimir / guardar PDF</Button>
          <Button type="button" variant="secondary" disabled={sharing || preparingImage} onClick={() => void handleShareReceipt()}><ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden />{preparingImage ? "Preparando imagen…" : sharing ? "Compartiendo…" : "Compartir imagen"}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/pagos/nuevo?prestamoId=${encodeURIComponent(detail.prestamo.id)}`)}><Plus className="h-4 w-4" strokeWidth={2} aria-hidden />Registrar otro pago</Button>
          <Button type="button" variant="ghost" className="sm:col-span-2" onClick={() => navigate(`/prestamos/${detail.prestamo.id}`)}><ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />Volver al préstamo</Button>
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

      <Card className="border-white/50 bg-white/95 p-6 font-mono text-stone-900 shadow-lg print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          <h1 className="break-words text-lg font-black uppercase tracking-tight">{receiptData.negocio.nombre}</h1>
          {receiptData.negocio.telefono ? <p className="mt-1 break-words text-xs">Tel. {receiptData.negocio.telefono}</p> : null}
          {receiptData.negocio.direccion ? <p className="break-words text-xs">{receiptData.negocio.direccion}</p> : null}
          {receiptData.negocio.rtn ? <p className="text-xs">RTN {receiptData.negocio.rtn}</p> : null}
        </header>
        <div className="my-4 border-t border-dashed border-stone-400" />
        <h2 className="text-center text-base font-black tracking-widest">RECIBO DE PAGO</h2>
        <div className="my-4 border-t border-dashed border-stone-400" />
        <TicketRow label="Recibo" strong>{receiptData.numeroRecibo}</TicketRow>
        <TicketRow label="Fecha">{formatDate(receiptData.fecha)}</TicketRow>
        <TicketRow label="Cliente">{receiptData.clienteNombre}</TicketRow>
        {receiptData.clienteIdentidad ? <TicketRow label="DNI">{receiptData.clienteIdentidad}</TicketRow> : null}
        <TicketRow label="Préstamo">{receiptData.numeroPrestamo}</TicketRow>
        <div className="my-4 border-t border-dashed border-stone-400" />
        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500">Monto recibido</p>
        <p className="mt-1 text-center text-3xl font-black tabular-nums">{formatMoney("L", receiptData.monto)}</p>
        <div className="my-4 border-t border-dashed border-stone-400" />
        {receiptData.aplicaciones.map((application, index) => (
          <TicketRow key={`${application.numeroCuota}-${index}`} label={`Cuota #${application.numeroCuota || "—"}`}>{formatMoney("L", application.monto)}</TicketRow>
        ))}
        <div className="my-4 border-t border-dashed border-stone-400" />
        <TicketRow label="Saldo anterior">{receiptData.saldoAnterior == null ? "—" : formatMoney("L", receiptData.saldoAnterior)}</TicketRow>
        <TicketRow label="Saldo restante" strong>{receiptData.saldoRestante == null ? "—" : formatMoney("L", receiptData.saldoRestante)}</TicketRow>
        <footer className="mt-6 text-center text-xs">
          {receiptData.negocio.propietario ? <><p>Atendido por</p><p className="font-black">{receiptData.negocio.propietario}</p></> : null}
          <p className="mt-5">Gracias por su pago</p>
        </footer>
      </Card>
    </div>
  );
}
