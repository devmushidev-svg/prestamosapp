import { supabase } from "./supabase";
import type { Cliente, EstadoCliente } from "../types";
import {
  deleteCache,
  getOfflineUserScope,
  isNetworkFailure,
  queueOfflineOperation,
  readCache,
  readThroughCache,
  updateCache,
  writeCache,
  type OfflineCacheEntry,
} from "./offlineDb";

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
export const CUSTOMERS_CACHE_KEY = "customers";
const FACADE_PHOTO_CACHE_PREFIX = "facade-photo:";
const facadeObjectUrls = new Map<string, string>();

const facadePhotoCacheKey = (path: string) => `${FACADE_PHOTO_CACHE_PREFIX}${path}`;

function localFacadePhotoUrl(path: string, blob: Blob): string {
  const current = facadeObjectUrls.get(path);
  if (current) return current;
  const url = URL.createObjectURL(blob);
  facadeObjectUrls.set(path, url);
  return url;
}

async function createFacadePhotoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FACHADAS_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("No se pudo abrir la foto de fachada.");
  return data.signedUrl;
}

async function downloadFacadePhoto(path: string): Promise<Blob> {
  const signedUrl = await createFacadePhotoSignedUrl(path);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`No se pudo descargar la foto de fachada (${response.status}).`);
  return response.blob();
}

export async function getFacadePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const cached = await readCache<Blob>(facadePhotoCacheKey(path)).catch(() => undefined);
  if (cached instanceof Blob) return localFacadePhotoUrl(path, cached);
  if (!navigator.onLine) return null;

  let signedUrl: string;
  try {
    signedUrl = await createFacadePhotoSignedUrl(path);
  } catch {
    return null;
  }
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) return signedUrl;
    const blob = await response.blob();
    await writeCache(facadePhotoCacheKey(path), blob);
    return localFacadePhotoUrl(path, blob);
  } catch {
    // La URL firmada sigue sirviendo online aunque el navegador no permita
    // conservar el archivo local en ese momento.
    return signedUrl;
  }
}

export async function prepareFacadePhotos(
  customers: Cliente[],
  expectedScope: string,
): Promise<{ count: number; entries: OfflineCacheEntry[] }> {
  const paths = Array.from(new Set(customers.map((customer) => customer.foto_fachada_path).filter(Boolean))) as string[];
  const cached = await Promise.all(paths.map(async (path) => ({
    path,
    blob: await readCache<Blob>(facadePhotoCacheKey(path)).catch(() => undefined),
  })));
  const missing = cached.filter(({ blob }) => !(blob instanceof Blob)).map(({ path }) => path);
  const downloaded: Array<{ key: string; value: Blob }> = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, missing.length) }, async () => {
    while (cursor < missing.length) {
      const path = missing[cursor++];
      const blob = await downloadFacadePhoto(path);
      downloaded.push({ key: facadePhotoCacheKey(path), value: blob });
    }
  });
  await Promise.all(workers);
  if (getOfflineUserScope() !== expectedScope) throw new Error("El usuario cambió durante la preparación offline.");
  return { count: paths.length, entries: downloaded };
}

export async function areFacadePhotosPrepared(customers: Cliente[]): Promise<boolean> {
  const paths = Array.from(new Set(customers.map((customer) => customer.foto_fachada_path).filter(Boolean))) as string[];
  const photos = await Promise.all(paths.map((path) => readCache<Blob>(facadePhotoCacheKey(path))));
  return photos.every((photo) => photo instanceof Blob);
}

export async function uploadFacadePhoto(
  clienteId: string,
  file: File,
  previousPath?: string | null
): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("La foto de fachada necesita Internet. Guarde primero la ficha y súbala cuando vuelva la conexión.");
  }
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

  const cachedNewPhoto = await writeCache(facadePhotoCacheKey(path), file).then(() => true).catch(() => false);
  const updatedCustomers = cachedNewPhoto
    ? await updateCache<Cliente[]>(CUSTOMERS_CACHE_KEY, (customers = []) => customers.map((customer) =>
        customer.id === clienteId ? { ...customer, foto_fachada_path: path } : customer
      )).catch(() => undefined)
    : undefined;
  const cachedCustomerPath = updatedCustomers?.some((customer) =>
    customer.id === clienteId && customer.foto_fachada_path === path
  ) ?? false;
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(FACHADAS_BUCKET).remove([previousPath]).catch(() => undefined);
    if (cachedNewPhoto && cachedCustomerPath) {
      const previousUrl = facadeObjectUrls.get(previousPath);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      facadeObjectUrls.delete(previousPath);
      await deleteCache(facadePhotoCacheKey(previousPath)).catch(() => undefined);
    }
  }
  return path;
}

async function fetchCustomerRows(select: string) {
  const pageSize = 500;
  const rows: Array<Partial<Cliente> & Pick<Cliente, "id" | "nombre" | "creado_en">> = [];
  for (let from = 0; ; from += pageSize) {
    const result = await supabase.from("clientes").select(select).order("nombre").order("id").range(from, from + pageSize - 1);
    if (result.error) return { rows: null, error: result.error };
    const batch = (result.data ?? []) as unknown as Array<Partial<Cliente> & Pick<Cliente, "id" | "nombre" | "creado_en">>;
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
  }
}

export async function downloadCustomers(): Promise<Cliente[]> {
    const full = await fetchCustomerRows(FULL_SELECT);
    if (!full.error) return (full.rows ?? []).map((row) => normalizeCustomer(row));
    if (!isMissingExtendedColumns(full.error)) throw full.error;

    const extended = await fetchCustomerRows(EXTENDED_SELECT);
    if (!extended.error) return (extended.rows ?? []).map((row) => normalizeCustomer(row));
    if (!isMissingExtendedColumns(extended.error)) throw extended.error;

    const legacy = await fetchCustomerRows(LEGACY_SELECT);
    if (legacy.error) throw legacy.error;
    return (legacy.rows ?? []).map((row) => normalizeCustomer(row));
}

export async function listCustomers(): Promise<Cliente[]> {
  return readThroughCache(CUSTOMERS_CACHE_KEY, downloadCustomers);
}

function optionalText(value: string) {
  return value.trim() || null;
}

export async function saveCustomer(input: CustomerInput, id?: string): Promise<void> {
  const customerId = id ?? crypto.randomUUID();
  const row = {
    id: customerId,
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
  let result: { error: { code?: string; message?: string } | null };
  if (!navigator.onLine) {
    result = { error: { message: "Sin conexión" } };
  } else {
    try {
      result = id
        ? await supabase.from("clientes").update(row).eq("id", id)
        : await supabase.from("clientes").insert(row);
    } catch (cause) {
      if (!isNetworkFailure(cause)) throw cause;
      result = { error: { message: cause instanceof Error ? cause.message : "Sin conexión" } };
    }
  }
  let queued = false;
  if (result.error && (!navigator.onLine || isNetworkFailure(result.error))) {
    await queueOfflineOperation({
      type: "customer.upsert",
      payload: { row },
      entityId: customerId,
    });
    queued = true;
  }
  if (!result.error || queued) {
    await updateCache<Cliente[]>(CUSTOMERS_CACHE_KEY, (customers = []) => {
      const previous = customers.find((customer) => customer.id === customerId);
      const next = normalizeCustomer({
        ...previous,
        ...row,
        foto_fachada_path: previous?.foto_fachada_path ?? null,
        orden_ruta: previous?.orden_ruta ?? null,
        creado_en: previous?.creado_en ?? new Date().toISOString(),
      } as Cliente);
      return [...customers.filter((customer) => customer.id !== customerId), next]
        .sort((left, right) => left.nombre.localeCompare(right.nombre, "es-HN"));
    });
    return;
  }
  if (isMissingExtendedColumns(result.error)) {
    const canUseLegacy = !row.lugar_trabajo && !row.referencias && !row.colonia && row.estado === "activo";
    if (canUseLegacy) {
      const legacyRow = {
        id: customerId,
        nombre: row.nombre,
        identidad: row.identidad,
        telefono: row.telefono,
        direccion: row.direccion,
        notas: row.notas,
      };
      const legacyResult = id
        ? await supabase.from("clientes").update(legacyRow).eq("id", id)
        : await supabase.from("clientes").insert(legacyRow);
      if (!legacyResult.error) {
        await updateCache<Cliente[]>(CUSTOMERS_CACHE_KEY, (customers = []) => {
          const previous = customers.find((customer) => customer.id === customerId);
          const next = normalizeCustomer({
            ...previous,
            ...legacyRow,
            creado_en: previous?.creado_en ?? new Date().toISOString(),
          } as Cliente);
          return [...customers.filter((customer) => customer.id !== customerId), next]
            .sort((left, right) => left.nombre.localeCompare(right.nombre, "es-HN"));
        });
        return;
      }
      throw legacyResult.error;
    }
    throw new Error("Falta aplicar la actualización consolidada en Supabase.");
  }
  throw result.error;
}
