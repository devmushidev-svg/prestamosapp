import { supabase } from "./supabase";
import type { ConfiguracionPrestamista, ConfiguracionPrestamistaInput } from "../types";
import {
  isNetworkFailure,
  queueOfflineOperation,
  readCache,
  readThroughCache,
  writeCache,
} from "./offlineDb";

export type BusinessConfigResult =
  | { status: "ready"; config: ConfiguracionPrestamista | null }
  | { status: "missing_schema"; config: null };

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

export const BUSINESS_CONFIG_CACHE_KEY = "business-config";

export async function downloadBusinessConfig(): Promise<BusinessConfigResult> {
    const { data, error } = await supabase
      .from("configuracion_prestamista")
      .select("id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en")
      .eq("id", 1)
      .maybeSingle();

    if (error && isMissingTable(error)) return { status: "missing_schema", config: null } as const;
    if (error) throw error;
    return { status: "ready", config: (data as ConfiguracionPrestamista | null) ?? null } as const;
}

export async function getBusinessConfig(): Promise<BusinessConfigResult> {
  return readThroughCache(BUSINESS_CONFIG_CACHE_KEY, downloadBusinessConfig);
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
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from("configuracion_prestamista")
        .upsert(row, { onConflict: "id" })
        .select("id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en")
        .single();
      if (error && !isNetworkFailure(error)) throw error;
      if (!error) {
        const saved = data as ConfiguracionPrestamista;
        await writeCache<BusinessConfigResult>(BUSINESS_CONFIG_CACHE_KEY, { status: "ready", config: saved });
        return saved;
      }
    } catch (cause) {
      if (!isNetworkFailure(cause)) throw cause;
    }
  }

  const cached = await readCache<BusinessConfigResult>(BUSINESS_CONFIG_CACHE_KEY);
  const timestamp = new Date().toISOString();
  const saved: ConfiguracionPrestamista = {
    id: 1,
    nombre_negocio: row.nombre_negocio,
    nombre_propietario: row.nombre_propietario,
    rtn: row.rtn,
    direccion: row.direccion,
    telefono: row.telefono,
    prefijo_recibo: cached?.config?.prefijo_recibo ?? "REC",
    digitos_recibo: cached?.config?.digitos_recibo ?? 6,
    creado_en: cached?.config?.creado_en ?? timestamp,
    actualizado_en: timestamp,
  };
  await queueOfflineOperation({ type: "business.upsert", entityId: "1", payload: { row } });
  await writeCache<BusinessConfigResult>(BUSINESS_CONFIG_CACHE_KEY, { status: "ready", config: saved });
  return saved;
}
