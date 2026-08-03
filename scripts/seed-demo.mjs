import { readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const MARKER = "[DEMO:EL_PROGRESO_V1]";
const args = new Set(process.argv.slice(2));

if (!args.has("--confirm-demo")) {
  throw new Error("Use npm run demo:seed o npm run demo:clean para confirmar el lote DEMO.");
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function demoUuid(family, index) {
  const first = `de${family.toString(16).padStart(2, "0")}${index.toString(16).padStart(4, "0")}`;
  return `${first}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function todayInHonduras() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function timestamp(date, time = "10:00:00") {
  return `${date}T${time}-06:00`;
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function moneyFromCents(value) {
  return Math.round(value) / 100;
}

function splitCount(total, rows) {
  if (total <= 0 || rows <= 0) return [];
  const safeRows = Math.min(total, rows);
  const base = Math.floor(total / safeRows);
  const remainder = total % safeRows;
  return Array.from({ length: safeRows }, (_, index) => base + (index < remainder ? 1 : 0));
}

function assertResponse(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

const localEnv = parseEnv(await readFile(new URL("../apps/web/.env", import.meta.url), "utf8"));
const supabaseUrl = process.env.VITE_SUPABASE_URL || localEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || localEnv.VITE_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_DEMO_EMAIL;
const password = process.env.SUPABASE_DEMO_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey) throw new Error("Faltan las variables públicas de Supabase.");
if (!email || !password) {
  throw new Error("Defina SUPABASE_DEMO_EMAIL y SUPABASE_DEMO_PASSWORD solo para esta ejecución.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

assertResponse(await supabase.auth.signInWithPassword({ email, password }), "No se pudo iniciar sesión");

const anchor = process.env.DEMO_ANCHOR_DATE || todayInHonduras();
const anchorWeekday = isoWeekday(anchor);
const collectionWeekday = Math.min(anchorWeekday, 6);
const weekdayAfter = collectionWeekday === 6 ? 1 : collectionWeekday + 1;

const people = [
  ["Ana López (DEMO 01)", "Col. Bendeck", "Pulpería DEMO La Perla"],
  ["Carlos Mejía (DEMO 02)", "Barrio Subirana", "Taller DEMO Ulúa"],
  ["Brenda Castillo (DEMO 03)", "Col. Berlín", "Venta de ropa DEMO"],
  ["José Rivera (DEMO 04)", "Brisas del Ulúa", "Puesto DEMO del mercado"],
  ["Karla Hernández (DEMO 05)", "Barrio Buenos Aires", "Comedor DEMO Sabor Catracho"],
  ["Luis Pineda (DEMO 06)", "Barrio Cabañas", "Mototaxi DEMO 06"],
  ["Maritza Paz (DEMO 07)", "Barrio El Pino", "Salón DEMO Maritza"],
  ["Óscar Aguilar (DEMO 08)", "Barrio Fátima", "Ferretería DEMO 08"],
  ["Daniela Martínez (DEMO 09)", "Barrio La Sirena", "Frutas DEMO La Sirena"],
  ["Kevin Flores (DEMO 10)", "Barrio Las Delicias", "Panadería DEMO Delicias"],
  ["Sonia Gómez (DEMO 11)", "Barrio Las Mercedes", "Costuras DEMO Sonia"],
  ["René Cruz (DEMO 12)", "Barrio Los Ángeles", "Carpintería DEMO Cruz"],
  ["Paola Amador (DEMO 13)", "Barrio Melgar Castro", "Farmacia DEMO 13"],
  ["Héctor Ramírez (DEMO 14)", "Barrio Montevideo", "Taller eléctrico DEMO"],
  ["Wendy Núñez (DEMO 15)", "Barrio Pénjamo", "Baleadas DEMO Wendy"],
  ["Joel Orellana (DEMO 16)", "Barrio 1.º de Mayo", "Bodega DEMO 16"],
  ["Fabiola Reyes (DEMO 17)", "Barrio San Antonio", "Zapatería DEMO Reyes"],
  ["Marvin Lagos (DEMO 18)", "Barrio San Francisco", "Barbería DEMO Marvin"],
  ["Xiomara Cáceres (DEMO 19)", "Barrio San José", "Tortillería DEMO 19"],
  ["Wilmer Molina (DEMO 20)", "Barrio San Juan", "Transporte DEMO Molina"],
  ["Ingrid Duarte (DEMO 21)", "Barrio San Martín", "Repostería DEMO Ingrid"],
  ["Noé Romero (DEMO 22)", "Barrio San Miguel", "Verduras DEMO 22"],
  ["Yessenia Acosta (DEMO 23)", "Barrio Suyapa", "Accesorios móviles DEMO"],
  ["Edgardo Suazo (DEMO 24)", "Esperanza de Jesús", "Autolavado DEMO 24"],
  ["Ruth Fúnez (DEMO 25)", "Col. Francisco Morazán", "Floristería DEMO Ruth"],
  ["Samuel Velásquez (DEMO 26)", "Fraternidad de la Paz", "Mensajería DEMO Ulúa"],
  ["Tatiana Portillo (DEMO 27)", "Col. Kennedy", "Minisúper DEMO Kennedy"],
  ["Byron Alvarado (DEMO 28)", "Col. La Libertad", "Cafetería DEMO 28"],
  ["Iris Euceda (DEMO 29)", "Barrio Centro", "Emprendimiento DEMO sin crédito"],
  ["Ramón Membreño (DEMO 30)", null, null],
];

const clientRows = people.map(([nombre, colonia, trabajo], offset) => {
  const index = offset + 1;
  return {
    id: demoUuid(0x00, index),
    nombre,
    identidad: `DEMO-EP-${String(index).padStart(3, "0")}`,
    telefono: index >= 29 ? null : `0000-${String(index).padStart(4, "0")}`,
    direccion: index >= 29 ? null : `Casa DEMO ${String(index).padStart(2, "0")}, sector de prueba, ${colonia}, El Progreso, Yoro`,
    colonia,
    lugar_trabajo: trabajo,
    referencias: index === 14
      ? "Referencia personal DEMO: Laura Ejemplo · 0000-1014. Referencia familiar DEMO: Pedro Ejemplo · 0000-2014. Texto largo para comprobar saltos de línea en la ficha del cliente."
      : `Referencia DEMO R${String(index).padStart(2, "0")} · 0000-${String(1000 + index)}`,
    foto_fachada_path: null,
    estado: index === 8 || index === 16 || index === 30 ? "cancelado" : "activo",
    orden_ruta: index,
    notas: `${MARKER} Información ficticia; no contactar ni usar como dato real.`,
    creado_en: timestamp(addDays(anchor, -Math.min(240, index * 5)), "08:00:00"),
  };
});

const loans = [
  { key: "c01-diario", client: 1, capital: 1500, rate: 15, term: 24, frequency: "diario", start: -5, paid: 4, rows: 4 },
  { key: "c01-semanal", client: 1, capital: 4800, rate: 10, term: 12, frequency: "semanal", start: -7, weekday: collectionWeekday },
  { key: "c02-diario", client: 2, capital: 3000, rate: 20, term: 24, frequency: "diario", start: -6, paid: 2, rows: 2 },
  { key: "c02-quincenal-pagado", client: 2, capital: 10000, rate: 18, term: 18, frequency: "quincenal", start: -300, full: true, fullOffset: -95 },
  { key: "c03-diario-pagado", client: 3, capital: 5000, rate: 15, term: 24, frequency: "diario", start: -30, full: true, fullOffset: -5 },
  { key: "c04-diario-hoy", client: 4, capital: 2500, rate: 20, term: 24, frequency: "diario", start: -1 },
  { key: "c05-diario-parcial", client: 5, capital: 4000, rate: 30, term: 40, frequency: "diario", start: -14, paid: 10, rows: 5, todayAmount: 200 },
  { key: "c06-diario-al-dia", client: 6, capital: 6000, rate: 40, term: 40, frequency: "diario", start: -9, paid: 8, rows: 4, todayInstallments: 1 },
  { key: "c07-diario-pagado", client: 7, capital: 3500, rate: 30, term: 40, frequency: "diario", start: -49, full: true, fullOffset: -5 },
  { key: "c08-diario-cancelado", client: 8, capital: 8000, rate: 40, term: 40, frequency: "diario", start: -4, cancelled: true },
  { key: "c09-semanal-hoy", client: 9, capital: 6000, rate: 10, term: 12, frequency: "semanal", start: -7, weekday: collectionWeekday },
  { key: "c10-semanal-proximo", client: 10, capital: 9000, rate: 12, term: 12, frequency: "semanal", start: -6, weekday: weekdayAfter },
  { key: "c11-semanal-mora", client: 11, capital: 12000, rate: 15, term: 12, frequency: "semanal", start: -38, weekday: 5, paid: 4, rows: 4, todayAmount: 100 },
  { key: "c12-semanal-pagado", client: 12, capital: 5000, rate: 10, term: 12, frequency: "semanal", start: -112, weekday: collectionWeekday, full: true, fullOffset: -20 },
  { key: "c13-semanal-proximo", client: 13, capital: 15000, rate: 15, term: 24, frequency: "semanal", start: -5, weekday: 3 },
  { key: "c14-semanal-parcial", client: 14, capital: 18000, rate: 18, term: 24, frequency: "semanal", start: -88, weekday: 4, paid: 11, rows: 6, partial: 0.5, partialOffset: -2 },
  { key: "c14-quincenal", client: 14, capital: 7000, rate: 20, term: 18, frequency: "quincenal", start: -50, paid: 2, rows: 2, todayAmount: 350 },
  { key: "c15-semanal-casi", client: 15, capital: 10000, rate: 12, term: 24, frequency: "semanal", start: -182, weekday: collectionWeekday, paid: 23, rows: 8 },
  { key: "c16-semanal-cancelado", client: 16, capital: 20000, rate: 20, term: 24, frequency: "semanal", start: -32, weekday: 4, cancelled: true },
  { key: "c17-semanal-mora", client: 17, capital: 25000, rate: 24, term: 36, frequency: "semanal", start: -9, weekday: 6 },
  { key: "c18-semanal-al-dia", client: 18, capital: 14000, rate: 18, term: 36, frequency: "semanal", start: -63, weekday: collectionWeekday, paid: 8, rows: 4, todayInstallments: 1 },
  { key: "c19-semanal-mora", client: 19, capital: 30000, rate: 25, term: 36, frequency: "semanal", start: -181, weekday: weekdayAfter, paid: 12, rows: 6 },
  { key: "c20-semanal-al-dia", client: 20, capital: 35000, rate: 30, term: 48, frequency: "semanal", start: -208, weekday: 3, paid: 29, rows: 10 },
  { key: "c21-semanal-mora", client: 21, capital: 22000, rate: 24, term: 48, frequency: "semanal", start: -270, weekday: 4, paid: 36, rows: 8 },
  { key: "c22-semanal-pagado", client: 22, capital: 12000, rate: 20, term: 48, frequency: "semanal", start: -242, weekday: 5, full: true, fullOffset: -10 },
  { key: "c23-quincenal-hoy", client: 23, capital: 18000, rate: 20, term: 18, frequency: "quincenal", start: -15 },
  { key: "c24-quincenal-proximo", client: 24, capital: 25000, rate: 24, term: 18, frequency: "quincenal", start: -13 },
  { key: "c24-diario-nuevo", client: 24, capital: 2000, rate: 15, term: 24, frequency: "diario", start: 0 },
  { key: "c25-quincenal-mora", client: 25, capital: 15000, rate: 18, term: 18, frequency: "quincenal", start: -200, paid: 9, rows: 5, todayAmount: 100 },
  { key: "c26-quincenal-mora", client: 26, capital: 40000, rate: 30, term: 24, frequency: "quincenal", start: -33, todayAmount: 300 },
  { key: "c27-quincenal-parcial", client: 27, capital: 28000, rate: 25, term: 24, frequency: "quincenal", start: -169, paid: 10, rows: 5, partial: 0.5, partialOffset: 0 },
  { key: "c28-quincenal-al-dia", client: 28, capital: 20000, rate: 20, term: 24, frequency: "quincenal", start: -198, paid: 12, rows: 6, todayInstallments: 1 },
];

const demoClientIds = clientRows.map((item) => item.id);

async function cleanupDemo() {
  const existing = assertResponse(
    await supabase.from("clientes").select("id,identidad,notas").in("id", demoClientIds),
    "No se pudieron revisar los clientes DEMO",
  ) ?? [];
  for (const row of existing) {
    if (!String(row.identidad ?? "").startsWith("DEMO-EP-") || !String(row.notas ?? "").includes(MARKER)) {
      throw new Error(`Protección de limpieza: ${row.id} no pertenece inequívocamente al lote DEMO.`);
    }
  }

  const loanRows = assertResponse(
    await supabase.from("prestamos").select("id").in("cliente_id", demoClientIds),
    "No se pudieron localizar los préstamos DEMO",
  ) ?? [];
  const loanIds = loanRows.map((item) => item.id);

  assertResponse(await supabase.from("gestiones").delete().in("cliente_id", demoClientIds), "No se pudieron borrar las gestiones DEMO");
  if (loanIds.length) {
    assertResponse(await supabase.from("pago_aplicaciones").delete().in("prestamo_id", loanIds), "No se pudieron borrar las aplicaciones DEMO");
    assertResponse(await supabase.from("pagos").delete().in("prestamo_id", loanIds), "No se pudieron borrar los pagos DEMO");
    assertResponse(await supabase.from("cuotas").delete().in("prestamo_id", loanIds), "No se pudieron borrar las cuotas DEMO");
    assertResponse(await supabase.from("prestamos").delete().in("id", loanIds), "No se pudieron borrar los préstamos DEMO");
  }
  assertResponse(await supabase.from("clientes").delete().in("id", demoClientIds), "No se pudieron borrar los clientes DEMO");
}

await cleanupDemo();

if (args.has("--clean")) {
  await supabase.auth.signOut();
  console.log(`Lote ${MARKER} eliminado sin tocar otros registros.`);
  process.exit(0);
}

assertResponse(await supabase.from("clientes").insert(clientRows), "No se pudieron crear los clientes DEMO");

const createdLoans = new Map();
for (const [offset, loan] of loans.entries()) {
  const startDate = addDays(anchor, loan.start);
  const loanId = assertResponse(
    await supabase.rpc("crear_prestamo_con_cuotas", {
      p_solicitud_id: demoUuid(0x10, offset + 1),
      p_cliente_id: demoClientIds[loan.client - 1],
      p_monto: loan.capital,
      p_tasa_interes: loan.rate,
      p_plazo: loan.term,
      p_frecuencia: loan.frequency,
      p_fecha_inicio: startDate,
      p_dia_pago_semana: loan.frequency === "semanal" ? loan.weekday : null,
    }),
    `No se pudo crear ${loan.key}`,
  );
  createdLoans.set(loan.key, { ...loan, id: loanId, startDate });
  assertResponse(
    await supabase.from("prestamos").update({ creado_en: timestamp(startDate, "08:30:00") }).eq("id", loanId),
    `No se pudo fechar ${loan.key}`,
  );
  if (loan.cancelled) {
    assertResponse(
      await supabase.from("prestamos").update({ estado: "cancelado" }).eq("id", loanId),
      `No se pudo cancelar ${loan.key}`,
    );
  }
}

let paymentSequence = 0;
const paymentRecords = [];

async function pendingInstallments(loanId) {
  const rows = assertResponse(
    await supabase
      .from("cuotas")
      .select("id,numero,fecha_vencimiento,monto,monto_pagado")
      .eq("prestamo_id", loanId)
      .order("numero", { ascending: true }),
    "No se pudieron consultar las cuotas DEMO",
  ) ?? [];
  return rows.filter((item) => cents(item.monto) > cents(item.monto_pagado));
}

async function currentBalance(loanId) {
  const row = assertResponse(
    await supabase.from("prestamos").select("saldo").eq("id", loanId).single(),
    "No se pudo consultar el saldo DEMO",
  );
  return Number(row.saldo);
}

async function registerDemoPayment(loan, amount, paymentDate, label) {
  paymentSequence += 1;
  const paymentId = assertResponse(
    await supabase.rpc("registrar_pago", {
      p_solicitud_id: demoUuid(0x20, paymentSequence),
      p_prestamo_id: loan.id,
      p_monto: moneyFromCents(cents(amount)),
    }),
    `No se pudo registrar un pago de ${loan.key}`,
  );
  const payment = assertResponse(
    await supabase.from("pagos").select("datos_recibo").eq("id", paymentId).single(),
    "No se pudo preparar la fecha del recibo DEMO",
  );
  const snapshot = payment.datos_recibo
    ? { ...payment.datos_recibo, fecha: paymentDate }
    : null;
  assertResponse(
    await supabase.from("pagos").update({
      fecha: paymentDate,
      creado_en: paymentDate,
      notas: `${MARKER} ${label}`,
      datos_recibo: snapshot,
    }).eq("id", paymentId),
    "No se pudo fechar el pago DEMO",
  );
  assertResponse(
    await supabase.from("pago_aplicaciones").update({ creado_en: paymentDate }).eq("pago_id", paymentId),
    "No se pudieron fechar las aplicaciones DEMO",
  );
  paymentRecords.push({ id: paymentId, client: loan.client, loanKey: loan.key, date: paymentDate });
  if (paymentSequence % 10 === 0) console.log(`Pagos DEMO preparados: ${paymentSequence}`);
  return paymentId;
}

for (const loan of createdLoans.values()) {
  if (loan.cancelled) continue;

  if (loan.full) {
    const balance = await currentBalance(loan.id);
    await registerDemoPayment(
      loan,
      balance,
      timestamp(addDays(anchor, loan.fullOffset), "11:00:00"),
      "Liquidación ficticia.",
    );
    continue;
  }

  const groups = splitCount(loan.paid ?? 0, loan.rows ?? 0);
  for (const [groupIndex, installmentCount] of groups.entries()) {
    const pending = await pendingInstallments(loan.id);
    const selected = pending.slice(0, installmentCount);
    if (selected.length !== installmentCount) throw new Error(`Faltan cuotas para ${loan.key}.`);
    const amountCents = selected.reduce((total, item) => total + cents(item.monto) - cents(item.monto_pagado), 0);
    const dueDate = selected[selected.length - 1].fecha_vencimiento;
    const safeDate = dueDate > anchor ? anchor : dueDate;
    await registerDemoPayment(
      loan,
      moneyFromCents(amountCents),
      timestamp(safeDate, `${String(8 + (groupIndex % 8)).padStart(2, "0")}:15:00`),
      `Abono histórico ficticio ${groupIndex + 1}.`,
    );
  }

  if (loan.partial) {
    const [next] = await pendingInstallments(loan.id);
    if (!next) throw new Error(`No hay cuota para el abono parcial de ${loan.key}.`);
    const pendingCents = cents(next.monto) - cents(next.monto_pagado);
    await registerDemoPayment(
      loan,
      moneyFromCents(Math.max(1, Math.floor(pendingCents * loan.partial))),
      timestamp(addDays(anchor, loan.partialOffset), loan.partialOffset === 0 ? "09:20:00" : "14:20:00"),
      "Abono parcial ficticio.",
    );
  }

  if (loan.todayInstallments) {
    const pending = await pendingInstallments(loan.id);
    const selected = pending.slice(0, loan.todayInstallments);
    const amountCents = selected.reduce((total, item) => total + cents(item.monto) - cents(item.monto_pagado), 0);
    await registerDemoPayment(
      loan,
      moneyFromCents(amountCents),
      timestamp(anchor, `${String(10 + (loan.client % 7)).padStart(2, "0")}:05:00`),
      "Cobro ficticio del día.",
    );
  }

  if (loan.todayAmount) {
    const balance = await currentBalance(loan.id);
    await registerDemoPayment(
      loan,
      Math.min(loan.todayAmount, balance),
      timestamp(anchor, `${String(8 + (loan.client % 8)).padStart(2, "0")}:40:00`),
      "Cobro ficticio del día.",
    );
  }
}

const lastPaymentForClient = (client) => [...paymentRecords].reverse().find((item) => item.client === client)?.id ?? null;
const managementRows = [
  { client: 2, offset: -2, result: "promesa_pago", amount: 500, promiseOffset: -1, note: "Promesa vencida DEMO; no hubo pago posterior." },
  { client: 5, offset: -2, result: "promesa_pago", amount: 700, promiseOffset: -1, note: "Prometió L700; el abono posterior deja un remanente." },
  { client: 6, offset: -2, result: "promesa_pago", amount: 200, promiseOffset: -1, note: "Promesa DEMO cumplida con un pago posterior." },
  { client: 23, offset: 0, result: "promesa_pago", amount: 1200, promiseOffset: 1, note: "Promesa futura DEMO." },
  { client: 24, offset: -3, result: "promesa_pago", amount: 400, promiseOffset: -1, note: "Promesa anterior reemplazada DEMO." },
  { client: 24, offset: -1, result: "promesa_pago", amount: 900, promiseOffset: 3, note: "Última promesa DEMO; esta debe prevalecer." },
  { client: 14, offset: -1, result: "promesa_pago", amount: 1000, promiseOffset: 0, note: "Pago posterior en otro crédito deja L650 pendientes." },
  { client: 11, offset: -1, result: "no_estaba", note: "Visita DEMO: negocio cerrado." },
  { client: 4, offset: 0, result: "no_estaba", note: "Visita DEMO: cliente no estaba." },
  { client: 19, offset: 0, result: "se_nego", note: "Visita DEMO: se negó a pagar." },
  { client: 13, offset: -1, result: "otro", note: "Volver el miércoles por la tarde (DEMO)." },
  { client: 20, offset: 0, result: "otro", note: "Cliente pidió revisar su estado de cuenta (DEMO)." },
  { client: 5, offset: 0, result: "pago", paymentId: lastPaymentForClient(5), note: "Cobro DEMO enlazado." },
  { client: 18, offset: 0, result: "pago", paymentId: lastPaymentForClient(18), note: "Cobro DEMO enlazado." },
  { client: 28, offset: 0, result: "pago", paymentId: lastPaymentForClient(28), note: "Cobro DEMO enlazado." },
];

assertResponse(await supabase.from("gestiones").insert(managementRows.map((item, offset) => ({
  id: demoUuid(0x30, offset + 1),
  cliente_id: demoClientIds[item.client - 1],
  fecha: timestamp(addDays(anchor, item.offset), item.offset === 0 ? "16:00:00" : "14:00:00"),
  resultado: item.result,
  monto_prometido: item.amount ?? null,
  fecha_promesa: item.promiseOffset == null ? null : addDays(anchor, item.promiseOffset),
  pago_id: item.paymentId ?? null,
  notas: `${MARKER} ${item.note}`,
  creado_en: timestamp(addDays(anchor, item.offset), item.offset === 0 ? "16:00:00" : "14:00:00"),
}))), "No se pudieron crear las gestiones DEMO");

assertResponse(await supabase.rpc("actualizar_estados_cartera"), "No se pudieron actualizar los estados DEMO");

const demoLoanIds = [...createdLoans.values()].map((item) => item.id);
const statuses = assertResponse(
  await supabase.from("prestamos").select("cliente_id,estado").in("id", demoLoanIds),
  "No se pudieron revisar los estados DEMO",
) ?? [];
const loansByClient = new Map();
for (const loan of statuses) {
  const values = loansByClient.get(loan.cliente_id) ?? [];
  values.push(loan.estado);
  loansByClient.set(loan.cliente_id, values);
}
for (const [offset, client] of clientRows.entries()) {
  const index = offset + 1;
  const states = loansByClient.get(client.id) ?? [];
  const state = index === 8 || index === 16 || index === 30
    ? "cancelado"
    : states.includes("en_mora") ? "moroso" : "activo";
  assertResponse(await supabase.from("clientes").update({ estado: state }).eq("id", client.id), "No se pudo actualizar un cliente DEMO");
}

const installments = assertResponse(
  await supabase.from("cuotas").select("prestamo_id,monto,monto_pagado").in("prestamo_id", demoLoanIds),
  "No se pudieron validar las cuotas DEMO",
) ?? [];
const balances = assertResponse(
  await supabase.from("prestamos").select("id,saldo,estado").in("id", demoLoanIds),
  "No se pudieron validar los saldos DEMO",
) ?? [];
const pendingByLoan = new Map();
for (const installment of installments) {
  pendingByLoan.set(
    installment.prestamo_id,
    (pendingByLoan.get(installment.prestamo_id) ?? 0) + cents(installment.monto) - cents(installment.monto_pagado),
  );
}
for (const loan of balances) {
  if (cents(loan.saldo) !== (pendingByLoan.get(loan.id) ?? 0)) {
    throw new Error(`Saldo inconsistente en préstamo DEMO ${loan.id}.`);
  }
}

const statusCounts = balances.reduce((counts, loan) => {
  counts[loan.estado] = (counts[loan.estado] ?? 0) + 1;
  return counts;
}, {});

await supabase.auth.signOut();
console.log(JSON.stringify({
  marker: MARKER,
  anchor,
  clients: clientRows.length,
  loans: demoLoanIds.length,
  installments: installments.length,
  payments: paymentRecords.length,
  collectionsToday: paymentRecords.filter((item) => item.date.startsWith(anchor)).length,
  managements: managementRows.length,
  loanStatuses: statusCounts,
}, null, 2));
