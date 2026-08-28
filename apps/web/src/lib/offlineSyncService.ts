import { supabase } from "./supabase";
import {
  isNetworkFailure,
  listOfflineOperations,
  removeOfflineOperation,
  resolveOfflineAlias,
  setOfflineAlias,
  updateOfflineOperation,
  type OfflineOperation,
} from "./offlineDb";

type BusinessUpsertPayload = { row: Record<string, unknown> };
type CustomerUpsertPayload = { row: Record<string, unknown> };
type LoanCreatePayload = {
  localId: string;
  input: {
    solicitudId: string;
    clienteId: string;
    monto: number;
    tasaInteres: number;
    plazo: number;
    frecuencia: string;
    fechaInicio: string;
    diaPagoSemana: number | null;
  };
};
type PaymentCreatePayload = {
  localId: string;
  input: { solicitudId: string; prestamoId: string; monto: number; capturedAt?: string };
};
type GestionCreatePayload = { row: Record<string, unknown> & { pago_id?: string | null } };
type RouteUpdatePayload = { items: Array<{ id: string; orden_ruta: number }> };

class PendingDependencyError extends Error {}

let activeSync: Promise<OfflineSyncResult> | null = null;

export type OfflineSyncResult = {
  synced: number;
  pending: number;
  attention: number;
};

function isPermissionDenied(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { code?: string; message?: string };
  return error.code === "42501" || (error.message ?? "").toLowerCase().includes("row-level security");
}

function errorMessage(cause: unknown): string {
  if (isPermissionDenied(cause)) {
    return "No tiene permiso para realizar esta operación. Pida a la cuenta maestra que revise sus permisos.";
  }
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) return String(cause.message);
  return "No se pudo sincronizar esta operación.";
}

function isAuthenticationFailure(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { status?: number; code?: string };
  return error.status === 401 || error.code === "PGRST301";
}

async function hasPendingCreation(type: "loan.create" | "payment.create", localId: string) {
  const operations = await listOfflineOperations();
  return operations.some((operation) => {
    if (operation.type !== type) return false;
    const payload = operation.payload as { localId?: string };
    return payload.localId === localId;
  });
}

async function executeOperation(operation: OfflineOperation): Promise<void> {
  switch (operation.type) {
    case "business.upsert": {
      const { row } = operation.payload as BusinessUpsertPayload;
      // En el esquema multiempresa `empresa_id` tiene un default basado en la
      // sesión. Eso también migra operaciones antiguas que aún no lo incluían.
      let result = await supabase.from("configuracion_prestamista").upsert(row, { onConflict: "empresa_id" });
      if (result.error && (
        result.error.code === "PGRST204"
        || result.error.code === "42703"
        || result.error.code === "42P10"
        || result.error.message?.includes("empresa_id")
      )) {
        const legacyRow = { ...row };
        delete legacyRow.empresa_id;
        result = await supabase.from("configuracion_prestamista").upsert(legacyRow, { onConflict: "id" });
      }
      if (result.error) throw result.error;
      return;
    }
    case "customer.upsert": {
      const { row } = operation.payload as CustomerUpsertPayload;
      const result = await supabase.from("clientes").upsert(row, { onConflict: "id" });
      if (result.error) throw result.error;
      return;
    }
    case "loan.create": {
      const { localId, input } = operation.payload as LoanCreatePayload;
      const result = await supabase.rpc("crear_prestamo_con_cuotas", {
        p_solicitud_id: input.solicitudId,
        p_cliente_id: input.clienteId,
        p_monto: input.monto,
        p_tasa_interes: input.tasaInteres,
        p_plazo: input.plazo,
        p_frecuencia: input.frecuencia,
        p_fecha_inicio: input.fechaInicio,
        p_dia_pago_semana: input.diaPagoSemana,
      });
      if (result.error) throw result.error;
      if (typeof result.data !== "string") throw new Error("Supabase no devolvió el préstamo creado.");
      await setOfflineAlias(localId, result.data);
      return;
    }
    case "payment.create": {
      const { localId, input } = operation.payload as PaymentCreatePayload;
      const remoteLoanId = await resolveOfflineAlias(input.prestamoId);
      if (remoteLoanId === input.prestamoId && await hasPendingCreation("loan.create", input.prestamoId)) {
        throw new PendingDependencyError("Esperando que el préstamo se sincronice primero.");
      }
      const result = await supabase.rpc("registrar_pago", {
        p_solicitud_id: input.solicitudId,
        p_prestamo_id: remoteLoanId,
        p_monto: input.monto,
      });
      if (result.error) throw result.error;
      if (typeof result.data !== "string") throw new Error("Supabase no devolvió el pago registrado.");
      if (input.capturedAt) {
        const snapshotResult = await supabase.from("pagos").select("datos_recibo").eq("id", result.data).single();
        if (snapshotResult.error) throw snapshotResult.error;
        const snapshot = snapshotResult.data?.datos_recibo;
        const updateResult = await supabase
          .from("pagos")
          .update({
            fecha: input.capturedAt,
            creado_en: input.capturedAt,
            datos_recibo: snapshot && typeof snapshot === "object"
              ? { ...snapshot, fecha: input.capturedAt }
              : snapshot,
          })
          .eq("id", result.data);
        if (updateResult.error) throw updateResult.error;
      }
      await setOfflineAlias(localId, result.data);
      return;
    }
    case "gestion.create": {
      const { row } = operation.payload as GestionCreatePayload;
      let pagoId = row.pago_id ?? null;
      if (pagoId) {
        const remotePaymentId = await resolveOfflineAlias(pagoId);
        if (remotePaymentId === pagoId && await hasPendingCreation("payment.create", pagoId)) {
          throw new PendingDependencyError("Esperando que el pago se sincronice primero.");
        }
        pagoId = remotePaymentId;
      }
      const result = await supabase
        .from("gestiones")
        .upsert({ ...row, pago_id: pagoId }, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw result.error;
      return;
    }
    case "route.update": {
      const { items } = operation.payload as RouteUpdatePayload;
      for (const item of items) {
        const result = await supabase
          .from("clientes")
          .update({ orden_ruta: item.orden_ruta })
          .eq("id", item.id);
        if (result.error) throw result.error;
      }
      return;
    }
  }
}

async function runSync(): Promise<OfflineSyncResult> {
  if (!navigator.onLine) {
    const operations = await listOfflineOperations();
    return {
      synced: 0,
      pending: operations.filter((item) => item.status !== "attention").length,
      attention: operations.filter((item) => item.status === "attention").length,
    };
  }

  let synced = 0;
  const priority: Record<OfflineOperation["type"], number> = {
    "business.upsert": 0,
    "customer.upsert": 1,
    "loan.create": 2,
    "payment.create": 3,
    "gestion.create": 4,
    "route.update": 5,
  };
  const operations = (await listOfflineOperations())
    .filter((operation) => operation.status !== "attention")
    .sort((left, right) =>
      priority[left.type] - priority[right.type]
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
    );

  for (const operation of operations) {
    await updateOfflineOperation(operation.id, {
      status: "syncing",
      attempts: operation.attempts + 1,
      lastError: null,
    });
    try {
      await executeOperation(operation);
      await removeOfflineOperation(operation.id);
      synced += 1;
    } catch (cause) {
      const message = errorMessage(cause);
      if (cause instanceof PendingDependencyError) {
        await updateOfflineOperation(operation.id, { status: "pending", lastError: message });
        continue;
      }
      if (isAuthenticationFailure(cause)) {
        await updateOfflineOperation(operation.id, {
          status: "pending",
          lastError: "La sesión debe validarse de nuevo antes de sincronizar.",
        });
        break;
      }
      if (isNetworkFailure(cause)) {
        await updateOfflineOperation(operation.id, { status: "pending", lastError: message });
        break;
      }
      await updateOfflineOperation(operation.id, { status: "attention", lastError: message });
    }
  }

  if (synced > 0) {
    const statusResult = await supabase.rpc("actualizar_estados_cartera");
    if (statusResult.error && !isNetworkFailure(statusResult.error)) {
      // Los movimientos ya fueron confirmados. La actualización de estados se
      // reintentará durante la próxima lectura de cartera.
      console.warn("No se pudieron refrescar los estados después de sincronizar.");
    }
  }

  const remaining = await listOfflineOperations();
  if (synced > 0) {
    window.dispatchEvent(new CustomEvent("multiprestamos:sync-complete"));
  }
  return {
    synced,
    pending: remaining.filter((item) => item.status !== "attention").length,
    attention: remaining.filter((item) => item.status === "attention").length,
  };
}

export async function syncOfflineOperations(): Promise<OfflineSyncResult> {
  if (activeSync) return activeSync;
  activeSync = runSync().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function retryOfflineOperation(id: string): Promise<void> {
  await updateOfflineOperation(id, { status: "pending", lastError: null });
}
