import type { FixedLoanInput } from "./loanCalculator";
import { supabase } from "./supabase";
import type { DatosSolicitudPrestamo, DiaPagoSemana, Profile, Solicitud } from "../types";

export type SolicitanteResumen = Pick<Profile, "id" | "nombre" | "apellido" | "email">;

export type SolicitudConSolicitante = Solicitud & { solicitante: SolicitanteResumen | null };

type RawSolicitud = Solicitud & {
  solicitante: SolicitanteResumen | SolicitanteResumen[] | null;
};

const SOLICITUD_WITH_SOLICITANTE_SELECT =
  "*,solicitante:profiles!solicitudes_solicitante_empresa_fk(id,nombre,apellido,email)";

function normalizeSolicitud(row: RawSolicitud): SolicitudConSolicitante {
  const solicitante = Array.isArray(row.solicitante) ? row.solicitante[0] ?? null : row.solicitante;
  return { ...row, solicitante };
}

function isMissingSolicitudesSchema(error: { code?: string }): boolean {
  return ["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code ?? "");
}

function missingSchemaMessage(entidad: string): string {
  return `Falta aplicar la migración de solicitudes en Supabase (${entidad}).`;
}

function crearSolicitudErrorMessage(cause: unknown): string {
  const error = cause as { code?: string; message?: string } | null;
  const message = error?.message?.toLowerCase() ?? "";
  if (isMissingSolicitudesSchema(error ?? {})) return missingSchemaMessage("crear_solicitud_prestamo");
  if (error?.code === "42501" || message.includes("no tiene permiso")) {
    return "No tiene permiso para solicitar préstamos.";
  }
  if (error?.code === "23503" || message.includes("cliente no existe")) {
    return "El cliente indicado no existe.";
  }
  if (error?.code === "23505" || message.includes("datos diferentes")) {
    return "Esta solicitud ya fue enviada.";
  }
  if (error?.code === "23514" || error?.code === "23502") {
    return error?.message ?? "Revise los datos del préstamo solicitado.";
  }
  return "No pudimos enviar la solicitud. Intente de nuevo.";
}

function resolverSolicitudErrorMessage(cause: unknown): string {
  const error = cause as { code?: string; message?: string } | null;
  const message = error?.message?.toLowerCase() ?? "";
  if (isMissingSolicitudesSchema(error ?? {})) return missingSchemaMessage("resolver_solicitud_prestamo");
  if (error?.code === "42501" || message.includes("solo un administrador")) {
    return "Solo un administrador puede resolver solicitudes.";
  }
  if (message.includes("ya fue procesada")) return "Esta solicitud ya fue procesada.";
  if (error?.code === "23503" || message.includes("no existe")) return "La solicitud no existe.";
  return "No pudimos procesar la solicitud. Intente de nuevo.";
}

export type SolicitarPrestamoInput = FixedLoanInput & {
  clienteId: string;
  observaciones: string;
  /** Generado una sola vez por el formulario (como `solicitudId` en NewLoanPage): reintentar el mismo envío nunca duplica la solicitud. */
  solicitudId: string;
};

export async function crearSolicitudPrestamo(input: SolicitarPrestamoInput): Promise<string> {
  const { data, error } = await supabase.rpc("crear_solicitud_prestamo", {
    p_id: input.solicitudId,
    p_cliente_id: input.clienteId,
    p_monto: input.capital,
    p_tasa_interes: input.tasaInteres,
    p_plazo: input.plazo,
    p_frecuencia: input.frecuencia,
    p_fecha_inicio: input.fechaInicio,
    p_dia_pago_semana: input.frecuencia === "semanal" ? input.diaPagoSemana ?? null : null,
    p_observaciones: input.observaciones,
  });
  if (error) throw new Error(crearSolicitudErrorMessage(error));
  if (typeof data !== "string") throw new Error("Supabase no devolvió la solicitud creada.");
  return data;
}

function normalizeDatos(datos: DatosSolicitudPrestamo): DatosSolicitudPrestamo {
  return {
    ...datos,
    monto: Number(datos.monto),
    tasaInteres: Number(datos.tasaInteres),
    plazo: Number(datos.plazo),
    diaPagoSemana: datos.diaPagoSemana == null ? null : (Number(datos.diaPagoSemana) as DiaPagoSemana),
  };
}

export async function listMisSolicitudesPrestamo(): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select("*")
    .eq("tipo", "prestamo")
    .order("creado_en", { ascending: false });
  if (error) throw new Error(missingSchemaMessage("tabla solicitudes"));
  return (data ?? []).map((row) => ({ ...(row as Solicitud), datos: normalizeDatos((row as Solicitud).datos) }));
}

export async function listSolicitudesPrestamo(estado?: Solicitud["estado"]): Promise<SolicitudConSolicitante[]> {
  let query = supabase.from("solicitudes").select(SOLICITUD_WITH_SOLICITANTE_SELECT).eq("tipo", "prestamo");
  if (estado) query = query.eq("estado", estado);
  const { data, error } = await query.order("creado_en", { ascending: false });
  if (error) throw new Error(missingSchemaMessage("tabla solicitudes"));
  return ((data ?? []) as RawSolicitud[]).map((row) => {
    const normalized = normalizeSolicitud(row);
    return { ...normalized, datos: normalizeDatos(normalized.datos) };
  });
}

export async function resolverSolicitudPrestamo(
  solicitudId: string,
  decision: "aprobada" | "rechazada",
  motivo: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolver_solicitud_prestamo", {
    p_solicitud_id: solicitudId,
    p_decision: decision,
    p_motivo: motivo,
  });
  if (error) throw new Error(resolverSolicitudErrorMessage(error));
  return (data as string | null) ?? null;
}
