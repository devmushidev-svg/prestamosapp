import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { registrarGestion } from "../lib/cobranzaService";
import { hondurasTodayRange } from "../lib/format";
import type { ResultadoGestion } from "../types";

const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type ResultadoSinCobro = Exclude<ResultadoGestion, "pago">;

const OPCIONES: Array<{ value: ResultadoSinCobro; label: string }> = [
  { value: "no_estaba", label: "No estaba" },
  { value: "promesa_pago", label: "Prometió pagar" },
  { value: "se_nego", label: "Se negó a pagar" },
  { value: "otro", label: "Otro" },
];

export function GestionSinCobroModal({
  open,
  clienteId,
  clienteNombre,
  onClose,
  onSaved,
}: {
  open: boolean;
  clienteId: string;
  clienteNombre: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoSinCobro>("no_estaba");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setResultado("no_estaba");
    setMonto("");
    setFecha("");
    setNotas("");
    setErr("");
  }, [open]);

  const esPromesa = resultado === "promesa_pago";
  const montoValue = Number(monto);
  const montoValido = Boolean(monto && Number.isFinite(montoValue) && montoValue > 0 && /^\d+(?:\.\d{0,2})?$/.test(monto));
  const puedeGuardar = !esPromesa || (montoValido && Boolean(fecha));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!puedeGuardar) {
      setErr("Indique el monto prometido y la fecha en que pagará.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await registrarGestion({
        clienteId,
        resultado,
        montoPrometido: esPromesa ? montoValue : undefined,
        fechaPromesa: esPromesa ? fecha : undefined,
        notas,
      });
      onSaved();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setErr(message.startsWith("Falta aplicar") ? message : "No pudimos guardar la gestión. Revise la conexión e intente de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Gestión sin cobro" onClose={() => { if (!saving) onClose(); }} maxWidthClass="sm:max-w-lg">
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <p className="text-sm text-pf-text-secondary">Registre qué pasó en la visita a <strong className="text-pf-text">{clienteNombre}</strong>.</p>

        <Field label="Resultado de la visita *" htmlFor="gestion-resultado">
          <Select id="gestion-resultado" data-autofocus="true" value={resultado} onChange={(event) => { setResultado(event.target.value as ResultadoSinCobro); setErr(""); }}>
            {OPCIONES.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
          </Select>
        </Field>

        {esPromesa ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monto prometido (L) *" htmlFor="gestion-monto">
              <Input
                id="gestion-monto"
                className={`${NUMBER_INPUT_CLASS} font-bold tabular-nums`}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(event) => { setMonto(event.target.value); setErr(""); }}
                placeholder="0.00"
              />
            </Field>
            <Field label="¿Cuándo pagará? *" htmlFor="gestion-fecha">
              <Input
                id="gestion-fecha"
                type="date"
                min={hondurasTodayRange().fecha}
                value={fecha}
                onChange={(event) => { setFecha(event.target.value); setErr(""); }}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Notas (opcional)" htmlFor="gestion-notas">
          <Textarea id="gestion-notas" rows={3} value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Qué se conversó en la visita" />
        </Field>

        {err ? <p className="text-sm font-medium text-pf-danger" role="alert">{err}</p> : null}

        <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="min-h-[48px]" disabled={saving || !puedeGuardar}>{saving ? "Guardando…" : "Guardar gestión"}</Button>
        </div>
      </form>
    </Modal>
  );
}
