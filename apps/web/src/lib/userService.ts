import { supabase } from "./supabase";
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
      rol: input.rol,
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(friendlyMessage(error, "No pudimos guardar los cambios del usuario."));
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
