export function formatMoney(symbol: string, value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  // Espacio no separable: evita que el símbolo quede solo en su línea en pantallas angostas.
  return `${symbol} ${n.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HONDURAS_TIME_ZONE = "America/Tegucigalpa";

function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Una fecha civil no representa medianoche UTC. Usar el mediodía de Honduras
  // evita que YYYY-MM-DD se muestre como el día anterior.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00-06:00`);
  return new Date(value);
}

export function formatDate(d: string | Date): string {
  return parseDate(d).toLocaleString("es-HN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: HONDURAS_TIME_ZONE,
  });
}

export function formatDateOnly(d: string | Date): string {
  return parseDate(d).toLocaleDateString("es-HN", { dateStyle: "short", timeZone: HONDURAS_TIME_ZONE });
}

export function formatTimeOnly(d: string | Date): string {
  return parseDate(d).toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HONDURAS_TIME_ZONE,
  });
}

export function formatLoanNumber(numero: number | null, id?: string): string {
  if (numero != null && Number.isFinite(numero)) return `PRE-${String(numero).padStart(6, "0")}`;
  return id ? `PRE-${id.slice(0, 8).toUpperCase()}` : "PRE-PENDIENTE";
}
