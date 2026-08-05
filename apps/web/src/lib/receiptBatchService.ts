import { readCache, resolveOfflineAlias, updateCache } from "./offlineDb";

const RECEIPT_BATCHES_CACHE_KEY = "receipt-batches";

export type ReceiptBatch = {
  id: string;
  origen: "cobranza";
  pagoIds: string[];
  totalCobrado: number;
  clienteId: string;
  saldoClienteAnterior: number;
  saldoClienteRestante: number;
  creadoEn: string;
};

export async function saveReceiptBatch(input: Omit<ReceiptBatch, "id" | "creadoEn" | "origen">): Promise<void> {
  if (input.pagoIds.length < 2) return;
  const batch: ReceiptBatch = {
    ...input,
    id: input.pagoIds[0],
    origen: "cobranza",
    creadoEn: new Date().toISOString(),
  };
  await updateCache<ReceiptBatch[]>(RECEIPT_BATCHES_CACHE_KEY, (batches = []) => [
    batch,
    ...batches.filter((item) =>
      item.id !== batch.id && !item.pagoIds.some((paymentId) => batch.pagoIds.includes(paymentId))
    ),
  ]);
}

export async function findReceiptBatch(paymentId: string): Promise<ReceiptBatch | null> {
  const batches = await readCache<ReceiptBatch[]>(RECEIPT_BATCHES_CACHE_KEY);
  if (!batches?.length) return null;
  for (const batch of batches) {
    if (batch.pagoIds.includes(paymentId)) return batch;
    const resolvedIds = await Promise.all(batch.pagoIds.map((id) => resolveOfflineAlias(id)));
    if (resolvedIds.includes(paymentId)) return { ...batch, pagoIds: resolvedIds };
  }
  return null;
}
