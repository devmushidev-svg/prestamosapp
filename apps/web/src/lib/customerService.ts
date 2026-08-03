import { supabase } from "./supabase";
import type { Cliente, EstadoCliente } from "../types";

export type CustomerInput = {
  nombre: string;
  identidad: string;
  telefono: string;
  direccion: string;
  colonia: string;
  lugar_trabajo: string;
  referencias: string;
  estado: EstadoCliente;
  notas: string;
};

const FULL_SELECT = "id,nombre,identidad,telefono,direccion,colonia,lugar_trabajo,referencias,foto_fachada_path,estado,notas,orden_ruta,creado_en";
const EXTENDED_SELECT = "id,nombre,identidad,telefono,direccion,colonia,lugar_trabajo,referencias,estado,notas,orden_ruta,creado_en";
const LEGACY_SELECT = "id,nombre,identidad,telefono,direccion,notas,creado_en";

function isMissingExtendedColumns(error: { code?: string; message?: string }) {
  return error.code === "PGRST204" || error.code === "42703" ||
    Boolean(error.message?.includes("lugar_trabajo") || error.message?.includes("referencias") || error.message?.includes("foto_fachada_path") || error.message?.includes("estado") || error.message?.includes("colonia") || error.message?.includes("orden_ruta"));
}

function normalizeCustomer(row: Partial<Cliente> & Pick<Cliente, "id" | "nombre" | "creado_en">): Cliente {
  return {
    id: row.id,
    nombre: row.nombre,
    identidad: row.identidad ?? null,
    telefono: row.telefono ?? null,
    direccion: row.direccion ?? null,
    colonia: row.colonia ?? null,
    lugar_trabajo: row.lugar_trabajo ?? null,
    referencias: row.referencias ?? null,
    foto_fachada_path: row.foto_fachada_path ?? null,
    estado: row.estado ?? "activo",
    notas: row.notas ?? null,
    orden_ruta: row.orden_ruta ?? null,
    creado_en: row.creado_en,
  };
}

const FACHADAS_BUCKET = "fachadas";

export async function getFacadePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(FACHADAS_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function uploadFacadePhoto(
  clienteId: string,
  file: File,
  previousPath?: string | null
): Promise<string> {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Use una foto JPG, PNG o WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La foto no puede superar 10 MB.");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${clienteId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from(FACHADAS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) {
    if (uploaded.error.message.toLowerCase().includes("bucket")) {
      throw new Error("Falta aplicar la actualización de fotos en Supabase.");
    }
    throw uploaded.error;
  }

  const updated = await supabase.from("clientes").update({ foto_fachada_path: path }).eq("id", clienteId);
  if (updated.error) {
    await supabase.storage.from(FACHADAS_BUCKET).remove([path]);
    if (isMissingExtendedColumns(updated.error)) {
      throw new Error("Falta aplicar la actualización de fotos en Supabase.");
    }
    throw updated.error;
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(FACHADAS_BUCKET).remove([previousPath]).catch(() => undefined);
  }
  return path;
}

export async function listCustomers(): Promise<Cliente[]> {
  const full = await supabase.from("clientes").select(FULL_SELECT).order("nombre");
  if (!full.error) return (full.data ?? []).map((row) => normalizeCustomer(row as Cliente));
  if (!isMissingExtendedColumns(full.error)) throw full.error;

  const extended = await supabase.from("clientes").select(EXTENDED_SELECT).order("nombre");
  if (!extended.error) return (extended.data ?? []).map((row) => normalizeCustomer(row as Cliente));
  if (!isMissingExtendedColumns(extended.error)) throw extended.error;

  const legacy = await supabase.from("clientes").select(LEGACY_SELECT).order("nombre");
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []).map((row) => normalizeCustomer(row as Pick<Cliente, "id" | "nombre" | "identidad" | "telefono" | "direccion" | "notas" | "creado_en">));
}

function optionalText(value: string) {
  return value.trim() || null;
}

export async function saveCustomer(input: CustomerInput, id?: string): Promise<void> {
  const row = {
    nombre: input.nombre.trim(),
    identidad: optionalText(input.identidad),
    telefono: optionalText(input.telefono),
    direccion: optionalText(input.direccion),
    colonia: optionalText(input.colonia),
    lugar_trabajo: optionalText(input.lugar_trabajo),
    referencias: optionalText(input.referencias),
    estado: input.estado,
    notas: optionalText(input.notas),
  };
  const result = id
    ? await supabase.from("clientes").update(row).eq("id", id)
    : await supabase.from("clientes").insert(row);
  if (!result.error) return;
  if (isMissingExtendedColumns(result.error)) {
    const canUseLegacy = !row.lugar_trabajo && !row.referencias && !row.colonia && row.estado === "activo";
    if (canUseLegacy) {
      const legacyRow = {
        nombre: row.nombre,
        identidad: row.identidad,
        telefono: row.telefono,
        direccion: row.direccion,
        notas: row.notas,
      };
      const legacyResult = id
        ? await supabase.from("clientes").update(legacyRow).eq("id", id)
        : await supabase.from("clientes").insert(legacyRow);
      if (!legacyResult.error) return;
      throw legacyResult.error;
    }
    throw new Error("Falta aplicar la actualización consolidada en Supabase.");
  }
  throw result.error;
}
