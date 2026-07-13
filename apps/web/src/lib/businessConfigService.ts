import { supabase } from "./supabase";
import type { ConfiguracionPrestamista, ConfiguracionPrestamistaInput } from "../types";

export type BusinessConfigResult =
  | { status: "ready"; config: ConfiguracionPrestamista | null }
  | { status: "missing_schema"; config: null };

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

export async function getBusinessConfig(): Promise<BusinessConfigResult> {
  const { data, error } = await supabase
    .from("configuracion_prestamista")
    .select("id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en")
    .eq("id", 1)
    .maybeSingle();

  if (error && isMissingTable(error)) return { status: "missing_schema", config: null };
  if (error) throw error;
  return { status: "ready", config: (data as ConfiguracionPrestamista | null) ?? null };
}

function optionalText(value: string | null) {
  return value?.trim() || null;
}

export async function upsertBusinessConfig(input: ConfiguracionPrestamistaInput): Promise<ConfiguracionPrestamista> {
  const row = {
    id: 1,
    nombre_negocio: input.nombre_negocio.trim(),
    nombre_propietario: input.nombre_propietario.trim(),
    rtn: optionalText(input.rtn),
    direccion: optionalText(input.direccion),
    telefono: optionalText(input.telefono),
    actualizado_en: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("configuracion_prestamista")
    .upsert(row, { onConflict: "id" })
    .select("id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en")
    .single();
  if (error) throw error;
  return data as ConfiguracionPrestamista;
}
