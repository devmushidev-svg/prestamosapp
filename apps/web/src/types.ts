export type Cliente = {
  id: string;
  nombre: string;
  identidad: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  creado_en: string;
};

export type FrecuenciaPago = "semanal" | "quincenal" | "mensual";
export type EstadoPrestamo = "activo" | "al_dia" | "en_mora" | "pagado" | "cancelado";
export type EstadoCuota = "pendiente" | "pagada" | "vencida";

export type Prestamo = {
  id: string;
  cliente_id: string;
  monto: number;
  tasa_interes: number;
  plazo: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
  saldo: number;
  estado: EstadoPrestamo;
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
