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

const CONFIG_SELECT = "empresa_id,id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en";
const LEGACY_CONFIG_SELECT = "id,nombre_negocio,nombre_propietario,rtn,direccion,telefono,prefijo_recibo,digitos_recibo,creado_en,actualizado_en";

function isMissingEmpresaColumn(error: { code?: string; message?: string }) {
  return error.code === "PGRST204"
    || error.code === "42703"
    || error.code === "42P10"
    || Boolean(error.message?.includes("empresa_id") || error.message?.includes("unique or exclusion"));
}

function normalizeConfig(data: Record<string, unknown> | null): ConfiguracionPrestamista | null {
  if (!data) return null;
  return {
    ...(data as unknown as ConfiguracionPrestamista),
    empresa_id: typeof data.empresa_id === "string" ? data.empresa_id : "",
  };
}

export async function downloadBusinessConfig(): Promise<BusinessConfigResult> {
    let { data, error } = await supabase
      .from("configuracion_prestamista")
      .select(CONFIG_SELECT)
      .eq("id", 1)
      .maybeSingle();

    // Mantiene el despliegue compatible durante el breve intervalo entre
    // publicar el frontend y aplicar la migración multiempresa en Supabase.
    if (error && isMissingEmpresaColumn(error)) {
      const legacy = await supabase
        .from("configuracion_prestamista")
        .select(LEGACY_CONFIG_SELECT)
        .eq("id", 1)
        .maybeSingle();
      data = legacy.data as typeof data;
      error = legacy.error;
    }

    if (error && isMissingTable(error)) return { status: "missing_schema", config: null } as const;
    if (error) throw error;
    return { status: "ready", config: normalizeConfig(data as Record<string, unknown> | null) } as const;
}

export async function getBusinessConfig(): Promise<BusinessConfigResult> {
  return readThroughCache(BUSINESS_CONFIG_CACHE_KEY, downloadBusinessConfig);
}

function optionalText(value: string | null) {
  return value?.trim() || null;
}

export async function upsertBusinessConfig(
  input: ConfiguracionPrestamistaInput,
  empresaId?: string | null,
): Promise<ConfiguracionPrestamista> {
  const row: Record<string, unknown> = {
    ...(empresaId ? { empresa_id: empresaId } : {}),
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
      let data: unknown = null;
      let error: { code?: string; message?: string } | null = null;
      if (empresaId) {
        const result = await supabase
          .from("configuracion_prestamista")
          .upsert(row, { onConflict: "empresa_id" })
          .select(CONFIG_SELECT)
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from("configuracion_prestamista")
          .upsert(row, { onConflict: "id" })
          .select(LEGACY_CONFIG_SELECT)
          .single();
        data = result.data;
        error = result.error;
      }
      if (empresaId && error && isMissingEmpresaColumn(error)) {
        const legacyRow: Record<string, unknown> = { ...row };
        delete legacyRow.empresa_id;
        const legacy = await supabase
          .from("configuracion_prestamista")
          .upsert(legacyRow, { onConflict: "id" })
          .select(LEGACY_CONFIG_SELECT)
          .single();
        data = legacy.data;
        error = legacy.error;
      }
      if (error && !isNetworkFailure(error)) throw error;
      if (!error) {
        const saved = normalizeConfig(data as Record<string, unknown>)!;
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
    empresa_id: empresaId ?? cached?.config?.empresa_id ?? "",
    id: 1,
    nombre_negocio: String(row.nombre_negocio),
    nombre_propietario: String(row.nombre_propietario),
    rtn: row.rtn as string | null,
    direccion: row.direccion as string | null,
    telefono: row.telefono as string | null,
    prefijo_recibo: cached?.config?.prefijo_recibo ?? "REC",
    digitos_recibo: cached?.config?.digitos_recibo ?? 6,
    creado_en: cached?.config?.creado_en ?? timestamp,
    actualizado_en: timestamp,
  };
  await queueOfflineOperation({
    type: "business.upsert",
    entityId: empresaId ?? "1",
    payload: { row },
  });
  await writeCache<BusinessConfigResult>(BUSINESS_CONFIG_CACHE_KEY, { status: "ready", config: saved });
  return saved;
}
