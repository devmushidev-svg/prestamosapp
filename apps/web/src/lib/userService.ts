import { supabase } from "./supabase";
import {
  clearOfflineCache,
  invalidateOfflineAccess,
  isNetworkFailure,
  listOfflineOperations,
  restoreOfflineAccess,
} from "./offlineDb";
import type { Profile, Rol } from "../types";

export type InviteUserInput = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  rol: Rol;
};

export type UpdateUserInput = {
  nombre: string;
  apellido: string;
  telefono: string;
  rol: Rol;
};

export type UpdateMyProfileInput = {
  nombre: string;
  apellido: string;
  telefono: string;
};

export class MasterTransferError extends Error {
  constructor(message: string, public readonly requiresAccessRecovery: boolean) {
    super(message);
    this.name = "MasterTransferError";
  }
}

function friendlyMessage(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "La contraseña actual no es correcta.";
  if (lower.includes("already registered") || lower.includes("duplicate")) {
    return "Este correo electrónico ya está registrado.";
  }
  if (lower.includes("password") && lower.includes("least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("same password") || lower.includes("different from the old")) {
    return "La nueva contraseña debe ser diferente a la actual.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Demasiados intentos. Espere un momento e intente de nuevo.";
  }
  return fallback;
}

/**
 * `supabase.functions.invoke` nunca pone en `error.message` el cuerpo que
 * devuelve la función cuando responde con un código distinto de 2xx (queda
 * en `error.context`, la Response cruda); hay que leerlo aparte para mostrar
 * el motivo real (correo duplicado, no admin, falta el secreto, etc.).
 * Siempre se deja el error crudo en consola para depurar sin adivinar.
 */
async function friendlyFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  let body: { message?: string; detail?: string } | null = null;
  let rawText: string | null = null;
  if (context instanceof Response) {
    try {
      body = await context.clone().json();
    } catch {
      try {
        rawText = await context.clone().text();
      } catch {
        // La respuesta no tenía cuerpo legible.
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error("[invite-user] error crudo:", error, "status:", context?.status, "cuerpo:", body ?? rawText);
  if (body?.message) {
    return body.detail && body.detail !== body.message ? `${body.message} (${body.detail})` : body.message;
  }
  if (rawText) return `${fallback} (${rawText.slice(0, 200)})`;
  return friendlyMessage(error, fallback);
}

export async function listUsers(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("nombre");
  if (error) throw new Error(friendlyMessage(error, "No pudimos cargar los usuarios."));
  return (data ?? []) as Profile[];
}

export async function inviteUser(input: InviteUserInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; message?: string; detail?: string }>("invite-user", {
    body: {
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      email: input.email.trim().toLowerCase(),
      telefono: input.telefono.trim(),
      rol: input.rol,
      redirectTo: `${window.location.origin}/restablecer-password`,
    },
  });
  if (error) throw new Error(await friendlyFunctionError(error, "No se pudo enviar la invitación. Intente de nuevo."));
  if (!data?.ok) {
    // eslint-disable-next-line no-console
    console.error("[invite-user] respondió ok:false ->", data);
    const message = data?.message || "No se pudo enviar la invitación. Intente de nuevo.";
    throw new Error(data?.detail && data.detail !== message ? `${message} (${data.detail})` : message);
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim() || null,
      telefono: input.telefono.trim() || null,
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(friendlyMessage(error, "No pudimos guardar los cambios del usuario."));
}

function transferMasterMessage(cause: unknown): string {
  const error = cause as { code?: string; message?: string } | null;
  const message = error?.message?.toLowerCase() ?? "";
  if (error?.code === "28000" || message.includes("sin sesión")) {
    return "Su sesión expiró. Vuelva a iniciar sesión.";
  }
  if (error?.code === "42501" || message.includes("no es la cuenta master")) {
    return "Solo la cuenta maestra activa puede transferir este rol.";
  }
  if (error?.code === "23503" || message.includes("otra empresa")) {
    return "El usuario seleccionado no pertenece a esta empresa.";
  }
  if (message.includes("aceptado la invitación") || message.includes("aceptado la invitacion") || message.includes("acceso habilitado")) {
    return "El prestamista debe haber aceptado la invitación y tener su acceso habilitado.";
  }
  if (error?.code === "23514" || message.includes("prestamista activo")) {
    return "Seleccione un prestamista activo distinto de su propia cuenta.";
  }
  if (error?.code === "40001" || message.includes("cambio durante la transferencia")) {
    return "Los permisos cambiaron al mismo tiempo. Actualice la página e intente de nuevo.";
  }
  if (error?.code === "PGRST202" || message.includes("transferir_cuenta_master")) {
    return "Falta aplicar en Supabase la actualización para transferir la cuenta maestra.";
  }
  return "No pudimos transferir la cuenta maestra. Intente de nuevo.";
}

/**
 * Transfiere el único rol administrativo mediante un RPC atómico. El RPC
 * promueve al destino y degrada al master actual en una sola transacción, por
 * lo que la empresa nunca queda sin cuenta maestra.
 */
export async function transferMasterAccount(newMasterId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Conéctese a Internet para transferir la cuenta maestra.");
  }
  // El marcador se establece antes de mirar la cola. Desde este instante las
  // altas offline y cualquier escritura de caché quedan bloqueadas, de modo
  // que no puede aparecer una operación nueva entre la comprobación y el RPC.
  const accessEpoch = invalidateOfflineAccess();
  let operations: Awaited<ReturnType<typeof listOfflineOperations>>;
  try {
    operations = await listOfflineOperations();
  } catch {
    restoreOfflineAccess(undefined, accessEpoch);
    throw new Error("No pudimos comprobar los cambios pendientes de este dispositivo. Intente de nuevo.");
  }
  if (operations.length > 0) {
    restoreOfflineAccess(undefined, accessEpoch);
    throw new Error("Sincronice o revise las operaciones pendientes antes de transferir la cuenta maestra.");
  }

  // Primero retira del dispositivo la copia con alcance administrativo. Si la
  // solicitud queda sin respuesta, nunca queda disponible una copia antigua
  // con datos que el usuario ya no debería ver como prestamista.
  try {
    await clearOfflineCache();
  } catch {
    // El servidor todavía no fue llamado, así que es seguro conservar el
    // acceso anterior aunque la copia haya quedado parcial y deba prepararse.
    restoreOfflineAccess(undefined, accessEpoch);
    throw new Error("No pudimos proteger la copia offline antes de transferir. Intente de nuevo.");
  }

  let data: unknown;
  let error: unknown;
  let responseReceived = false;
  let responseStatus = 0;
  try {
    const response = await supabase.rpc("transferir_cuenta_master", {
      p_nuevo_master_id: newMasterId,
    });
    responseReceived = true;
    responseStatus = response.status;
    data = response.data;
    error = response.error;
  } catch (cause) {
    error = cause;
  }

  // Una segunda limpieza queda ordenada detrás de cualquier transacción de
  // IndexedDB que hubiera comenzado justo antes del marcador. El marcador se
  // mantiene hasta que ProfileContext escriba el rol autoritativo del servidor.
  try {
    await clearOfflineCache();
  } catch {
    throw new MasterTransferError(
      "Los permisos pudieron cambiar, pero no pudimos renovar la copia local. Recargue con Internet.",
      true,
    );
  }
  if (error) {
    const message = transferMasterMessage(error);
    if (responseReceived
      && responseStatus >= 400
      && responseStatus < 500
      && !isNetworkFailure(error)) {
      try {
        restoreOfflineAccess(undefined, accessEpoch);
      } catch {
        throw new MasterTransferError(message, true);
      }
      throw new MasterTransferError(message, false);
    }
    throw new MasterTransferError(message, true);
  }
  if (data !== newMasterId) {
    throw new MasterTransferError(
      "No pudimos confirmar la nueva cuenta maestra. Actualice la página e intente de nuevo.",
      true,
    );
  }
}

export async function setUserActive(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ activo })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    throw new Error(friendlyMessage(
      error,
      activo ? "No pudimos activar al usuario." : "No pudimos desactivar al usuario."
    ));
  }
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;
  if (!id) throw new Error("Su sesión expiró. Vuelva a iniciar sesión.");
  const { data, error } = await supabase
    .from("profiles")
    .update({
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim() || null,
      telefono: input.telefono.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(friendlyMessage(error, "No pudimos guardar sus datos."));
  return data as Profile;
}

/**
 * Confirma la contraseña actual reautenticando antes de cambiarla: Supabase
 * no ofrece una verificación directa, y así se evita cerrar la sesión.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) throw new Error("Su sesión expiró. Vuelva a iniciar sesión.");
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) throw new Error(friendlyMessage(signInError, "No se pudo verificar la contraseña actual."));
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw new Error(friendlyMessage(updateError, "No se pudo cambiar la contraseña."));
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/restablecer-password`,
  });
  if (error) throw new Error(friendlyMessage(error, "No se pudo enviar el enlace de recuperación."));
}

/** Se usa tras abrir el enlace de invitación o de recuperación de contraseña. */
export async function setNewPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyMessage(error, "No se pudo establecer la contraseña."));
}

export async function reasignarPrestamo(prestamoId: string, prestamistaId: string): Promise<void> {
  const { error } = await supabase.rpc("reasignar_prestamo", {
    p_prestamo_id: prestamoId,
    p_prestamista_id: prestamistaId,
  });
  if (error) throw new Error(friendlyMessage(error, "No pudimos reasignar el préstamo."));
}

export async function reasignarCliente(clienteId: string, prestamistaId: string): Promise<void> {
  const { error } = await supabase.rpc("reasignar_cliente", {
    p_cliente_id: clienteId,
    p_prestamista_id: prestamistaId,
  });
  if (error) throw new Error(friendlyMessage(error, "No pudimos reasignar el cliente."));
}
