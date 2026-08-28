export type EstadoCliente = "activo" | "moroso" | "cancelado";

/**
 * 'admin' y 'prestamista' son los únicos roles con reglas definidas hoy.
 * El check de la base ya acepta 'gerente' | 'cobrador' | 'supervisor' para
 * cuando se agreguen sin migrar de nuevo; hasta entonces cualquier rol
 * distinto de 'admin' recibe el mismo trato restringido que 'prestamista'.
 */
export type Rol = "admin" | "prestamista" | "gerente" | "cobrador" | "supervisor";

/** Catálogo fijo de acciones que se pueden conceder a un usuario no-admin. */
export type Permission = {
  code: string;
  etiqueta: string;
  descripcion: string | null;
  orden: number;
};

export type Empresa = {
  id: string;
  nombre: string;
  activo: boolean;
  creado_en: string;
};

export type Profile = {
  id: string;
  empresa_id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type Cliente = {
  id: string;
  nombre: string;
  identidad: string | null;
  telefono: string | null;
  direccion: string | null;
  colonia: string | null;
  lugar_trabajo: string | null;
  referencias: string | null;
  /** Ruta privada en Supabase Storage para la foto de la fachada. */
  foto_fachada_path: string | null;
  estado: EstadoCliente;
  notas: string | null;
  /** Posición manual en la ruta de cobro; null = sin ordenar. */
  orden_ruta: number | null;
  /** Prestamista que administra a este cliente hoy; el admin puede reasignarlo. */
  prestamista_id: string;
  creado_en: string;
};

export type ConfiguracionPrestamista = {
  /** Empresa propietaria de esta configuración; nunca se comparte entre empresas. */
  empresa_id: string;
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

export type FrecuenciaPago = "diario" | "semanal" | "quincenal" | "mensual";
export type DiaPagoSemana = 1 | 2 | 3 | 4 | 5 | 6;
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
  dia_pago_semana: DiaPagoSemana | null;
  /** Condición pactada; el recargo monetario todavía no se suma automáticamente al saldo. */
  tasa_mora: number;
  saldo: number;
  estado: EstadoPrestamo;
  solicitud_id: string | null;
  /** Prestamista que administra este préstamo hoy; el admin puede reasignarlo. */
  prestamista_id: string;
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
  estadoCredito?: EstadoPrestamo;
  tasaMora?: number;
  negocio: {
    nombre: string;
    propietario?: string | null;
    rtn?: string | null;
    telefono?: string | null;
    direccion?: string | null;
  };
  aplicaciones: Array<{ numeroCuota: number; monto: number }>;
};

export type ResultadoGestion = "pago" | "no_estaba" | "promesa_pago" | "se_nego" | "otro";

/** Visita de cobranza en campo: una fila por gestión, con o sin cobro. */
export type Gestion = {
  id: string;
  cliente_id: string;
  fecha: string;
  resultado: ResultadoGestion;
  monto_prometido: number | null;
  fecha_promesa: string | null;
  pago_id: string | null;
  notas: string | null;
  creado_en: string;
};

export type TipoSolicitud = "prestamo" | "cancelacion_pago";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";

export type DatosSolicitudPrestamo = {
  clienteId: string;
  monto: number;
  tasaInteres: number;
  plazo: number;
  frecuencia: FrecuenciaPago;
  fechaInicio: string;
  diaPagoSemana: DiaPagoSemana | null;
};

/** Solicitudes que requieren aprobación de la cuenta maestra antes de ejecutarse. */
export type Solicitud = {
  id: string;
  empresa_id: string;
  tipo: TipoSolicitud;
  solicitante_id: string;
  estado: EstadoSolicitud;
  datos: DatosSolicitudPrestamo;
  motivo_solicitud: string | null;
  motivo_resolucion: string | null;
  resuelto_por: string | null;
  resuelto_en: string | null;
  prestamo_resultante_id: string | null;
  pago_afectado_id: string | null;
  creado_en: string;
};

export type PagoAplicacion = {
  id: string;
  pago_id: string;
  prestamo_id: string;
  cuota_id: string;
  monto: number;
  creado_en: string;
};
