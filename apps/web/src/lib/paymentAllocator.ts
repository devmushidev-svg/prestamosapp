import type { Cuota } from "../types";

export type CuotaConSaldo = Cuota & {
  pagado: number;
  pendiente: number;
};

export type AplicacionPrevia = {
  cuotaId: string;
  numero: number;
  fechaVencimiento: string;
  monto: number;
};

export type VistaPreviaPago = {
  aplicaciones: AplicacionPrevia[];
  montoAplicado: number;
  montoSinAplicar: number;
};

export function moneyToCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return value / 100;
}

export function withInstallmentBalances(cuotas: Cuota[]): CuotaConSaldo[] {
  return cuotas
    .map((cuota) => {
      const amountCents = moneyToCents(cuota.monto);
      const paidCents = Math.min(amountCents, Math.max(0, moneyToCents(cuota.monto_pagado ?? 0)));
      return {
        ...cuota,
        pagado: fromCents(paidCents),
        pendiente: fromCents(amountCents - paidCents),
      };
    })
    .sort((a, b) =>
      a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      || a.numero - b.numero
      || a.id.localeCompare(b.id)
    );
}

export function previewPayment(amount: number, cuotas: CuotaConSaldo[]): VistaPreviaPago {
  let remainingCents = Math.max(0, moneyToCents(amount));
  const originalCents = remainingCents;
  const aplicaciones: AplicacionPrevia[] = [];

  for (const cuota of cuotas) {
    if (remainingCents <= 0) break;
    const pendingCents = moneyToCents(cuota.pendiente);
    if (pendingCents <= 0) continue;
    const appliedCents = Math.min(remainingCents, pendingCents);
    aplicaciones.push({
      cuotaId: cuota.id,
      numero: cuota.numero,
      fechaVencimiento: cuota.fecha_vencimiento,
      monto: fromCents(appliedCents),
    });
    remainingCents -= appliedCents;
  }

  return {
    aplicaciones,
    montoAplicado: fromCents(originalCents - remainingCents),
    montoSinAplicar: fromCents(remainingCents),
  };
}
