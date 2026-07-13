export type EstadoCliente = "activo" | "moroso" | "cancelado";

export type Cliente = {
  id: string;
  nombre: string;
  identidad: string | null;
  telefono: string | null;
  direccion: string | null;
  lugar_trabajo: string | null;
  referencias: string | null;
  estado: EstadoCliente;
  notas: string | null;
  creado_en: string;
};

export type ConfiguracionPrestamista = {
  id: number;
  nombre_negocio: string;
  nombre_propietario: string;
  rtn: string | null;
  direccion: string | null;
  telefono: string | null;
  prefijo_recibo: string;
  digitos_recibo: number;
  creado_en: string;
  actualizado_en: string;
};

export type ConfiguracionPrestamistaInput = Pick<
  ConfiguracionPrestamista,
  "nombre_negocio" | "nombre_propietario" | "rtn" | "direccion" | "telefono"
>;

export type FrecuenciaPago = "semanal" | "quincenal" | "mensual";
export type EstadoPrestamo = "activo" | "al_dia" | "en_mora" | "pagado" | "cancelado";
export type EstadoCuota = "pendiente" | "pagada" | "vencida";

export type Prestamo = {
  id: string;
  /** Solo puede ser null mientras la base aún usa el esquema anterior. */
  numero: number | null;
  cliente_id: string;
  monto: number;
  tasa_interes: number;
  plazo: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
  /** Solo puede ser null mientras la base aún usa el esquema anterior. */
  fecha_primer_pago: string | null;
  saldo: number;
  estado: EstadoPrestamo;
  solicitud_id: string | null;
  creado_en: string;
};

export type Cuota = {
  id: string;
  prestamo_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  monto_pagado: number;
  estado: EstadoCuota;
};

export type Pago = {
  id: string;
  prestamo_id: string;
  cuota_id: string | null;
  solicitud_id: string | null;
  numero_recibo: number | null;
  fecha: string;
  monto: number;
  recibo: string | null;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  notas: string | null;
  datos_recibo: ReciboSnapshot | null;
  creado_en: string;
};

export type ReciboSnapshot = {
  version: 1;
  numeroRecibo: string;
  fecha: string;
  clienteNombre: string;
  clienteIdentidad?: string | null;
  numeroPrestamo: string;
  monto: number;
  saldoAnterior: number | null;
  saldoRestante: number | null;
  negocio: {
    nombre: string;
    propietario?: string | null;
    rtn?: string | null;
    telefono?: string | null;
    direccion?: string | null;
  };
  aplicaciones: Array<{ numeroCuota: number; monto: number }>;
};

export type PagoAplicacion = {
  id: string;
  pago_id: string;
  prestamo_id: string;
  cuota_id: string;
  monto: number;
  creado_en: string;
};
