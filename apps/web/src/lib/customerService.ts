import { supabase } from "./supabase";
import type { Cliente, EstadoCliente } from "../types";

export type CustomerInput = {
  nombre: string;
  identidad: string;
  telefono: string;
  direccion: string;
  lugar_trabajo: string;
  referencias: string;
  estado: EstadoCliente;
  notas: string;
};

const FULL_SELECT = "id,nombre,identidad,telefono,direccion,lugar_trabajo,referencias,estado,notas,creado_en";
const LEGACY_SELECT = "id,nombre,identidad,telefono,direccion,notas,creado_en";

function isMissingExtendedColumns(error: { code?: string; message?: string }) {
  return error.code === "PGRST204" || error.code === "42703" ||
    Boolean(error.message?.includes("lugar_trabajo") || error.message?.includes("referencias") || error.message?.includes("estado"));
}

function normalizeCustomer(row: Partial<Cliente> & Pick<Cliente, "id" | "nombre" | "creado_en">): Cliente {
  return {
    id: row.id,
    nombre: row.nombre,
    identidad: row.identidad ?? null,
    telefono: row.telefono ?? null,
    direccion: row.direccion ?? null,
    lugar_trabajo: row.lugar_trabajo ?? null,
    referencias: row.referencias ?? null,
    estado: row.estado ?? "activo",
    notas: row.notas ?? null,
    creado_en: row.creado_en,
  };
}

export async function listCustomers(): Promise<Cliente[]> {
  const full = await supabase.from("clientes").select(FULL_SELECT).order("nombre");
  if (!full.error) return (full.data ?? []).map((row) => normalizeCustomer(row as Cliente));
  if (!isMissingExtendedColumns(full.error)) throw full.error;

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
    const canUseLegacy = !row.lugar_trabajo && !row.referencias && row.estado === "activo";
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
