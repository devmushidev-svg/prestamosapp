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
  estado: EstadoCuota;
};

export type Pago = {
  id: string;
  prestamo_id: string;
  cuota_id: string | null;
  fecha: string;
  monto: number;
  recibo: string | null;
};
