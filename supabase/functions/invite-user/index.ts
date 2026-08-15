// Invita a un prestamista por correo. Es la única pieza que necesita la
// service_role key (nunca puede vivir en el navegador). Se ejecuta como
// Supabase Edge Function; el secreto se configura con
// `supabase secrets set` (ver MODO_OFFLINE.md / README de despliegue).
//
// Flujo:
// 1. Verifica que quien llama tiene una sesión válida y es admin activo.
// 2. Valida los datos del prestamista a invitar.
// 3. Llama a supabase.auth.admin.inviteUserByEmail (API de administración).
// 4. Crea/actualiza el `profiles` del invitado en la misma empresa del admin.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES_INVITABLES = new Set(["prestamista"]);

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already been registered") || lower.includes("duplicate")) {
    return "Este correo electrónico ya está registrado.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "El correo electrónico no es válido.";
  }
  return "No se pudo enviar la invitación. Intente de nuevo.";
}

Deno.serve(async (req) => {
  try {
    return await handleInvite(req);
  } catch (cause) {
    // Cualquier excepción no prevista cae aquí: sin esto, Deno devuelve una
    // página de error que no es JSON y el frontend pierde el mensaje real.
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[invite-user] excepción no controlada:", detail);
    return respond({ ok: false, message: "Error interno al procesar la invitación.", detail }, 500);
  }
});

async function handleInvite(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return respond({ ok: false, message: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ ok: false, message: "Falta configuración del servidor." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return respond({ ok: false, message: "No autorizado." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return respond({ ok: false, message: "No autorizado." }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("id,empresa_id,rol,activo")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    console.error("[invite-user] no se pudo leer el perfil del que llama:", callerProfileError);
    return respond({ ok: false, message: "No pudimos verificar su perfil.", detail: callerProfileError?.message ?? "perfil no encontrado" }, 403);
  }
  if (callerProfile.rol !== "admin" || !callerProfile.activo) {
    return respond({ ok: false, message: "Solo un administrador puede invitar usuarios." }, 403);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return respond({ ok: false, message: "Solicitud inválida." }, 400);
  }

  const nombre = String(payload?.nombre ?? "").trim();
  const apellido = String(payload?.apellido ?? "").trim();
  const email = String(payload?.email ?? "").trim().toLowerCase();
  const telefono = String(payload?.telefono ?? "").trim();
  const rol = String(payload?.rol ?? "prestamista").trim();
  const redirectTo = typeof payload?.redirectTo === "string" ? payload.redirectTo : undefined;

  if (!nombre) return respond({ ok: false, message: "El nombre es obligatorio." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ ok: false, message: "El correo electrónico no es válido." }, 400);
  }
  if (!ROLES_INVITABLES.has(rol)) {
    return respond({ ok: false, message: "El rol indicado no es válido." }, 400);
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return respond({ ok: false, message: "Este correo electrónico ya está registrado." }, 409);
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { nombre, apellido: apellido || null },
  });
  if (inviteError || !invited?.user) {
    // Log completo en Supabase → Edge Functions → invite-user → Logs.
    console.error("[invite-user] inviteUserByEmail falló:", JSON.stringify(inviteError));
    return respond({
      ok: false,
      message: friendlyAuthError(inviteError?.message ?? ""),
      // Detalle técnico real de Supabase; no se traduce para no perder información al depurar.
      detail: inviteError?.message ?? "inviteUserByEmail no devolvió usuario",
    }, (inviteError as { status?: number } | null)?.status ?? 400);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: invited.user.id,
    empresa_id: callerProfile.empresa_id,
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    rol,
    activo: true,
    creado_por: callerProfile.id,
  });
  if (profileError) {
    console.error("[invite-user] no se pudo crear el profile:", JSON.stringify(profileError));
    // El usuario de Auth ya fue creado; se revierte para no dejar una cuenta
    // sin ficha (el admin puede reintentar con el mismo correo).
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    return respond({
      ok: false,
      message: "No se pudo completar la invitación. Intente de nuevo.",
      detail: profileError.message,
    }, 500);
  }

  return respond({ ok: true, userId: invited.user.id });
}
