# MultiPréstamos — Guía del proyecto

> App de **gestión de préstamos** (prestamista). Nació como copia de **MultiPOS**
> para heredar su interfaz. **Lo que importa es lo visual:** que se vea igual de
> bonita y ordenada que el original, y que se sienta igual de usar.

## Arquitectura (actual)

**Frontend estático + Supabase. No hay backend propio.**

- **`apps/web`** — Única app. React 19 + Vite 6 + Tailwind 4 + react-router 7.
  Compila a archivos estáticos y se despliega en **Vercel**
  (repo: https://github.com/devmushidev-svg/prestamosapp). `vercel.json` en la
  raíz define build y rewrites de SPA.
- **Datos y login:** **Supabase** (Postgres + Auth) vía `@supabase/supabase-js`,
  directo desde el navegador. Cliente en
  [`apps/web/src/lib/supabase.ts`](apps/web/src/lib/supabase.ts); llaves en
  `apps/web/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) con respaldo
  fijo en el propio archivo (la anon key es pública; RLS controla el acceso).
- **Auth:** Supabase Auth con correo/contraseña
  ([`apps/web/src/auth/AuthContext.tsx`](apps/web/src/auth/AuthContext.tsx)).
  Cada empresa tiene una cuenta maestra (`profiles.rol = 'admin'`) y los demás
  usuarios se crean por invitación con la Edge Function `invite-user`, siempre
  dentro de esa misma empresa. No hay registro público. El alta controlada de
  una empresa/master está documentada en [`ALTA_EMPRESA.md`](ALTA_EMPRESA.md).
  En Authentication → Providers → Email debe estar desactivado **Allow new
  users to sign up**; ocultar el registro en la interfaz no bloquea el endpoint
  público de Supabase.
- **Esquema de la base:** [`supabase/schema.sql`](supabase/schema.sql) — se pega
  en el SQL Editor de Supabase y se vuelve a ejecutar cuando cambie. Tablas:
  `empresas`, `profiles`, `configuracion_prestamista`, `clientes`, `prestamos`,
  `cuotas`, `pagos` y `pago_aplicaciones`, todas aisladas por empresa mediante
  RLS. Incluye las funciones
  transaccionales `crear_prestamo_con_cuotas`, `registrar_pago` y
  `actualizar_estados_cartera`.

> El backend original (Hono + Prisma + SQLite, `apps/api`) fue **eliminado**:
> no servía para Vercel (serverless, SQLite no persiste). Si necesitas ver cómo
> hacía algo, el POS original sigue corriendo en `D:\punto de venta`.

## El sistema de diseño (lo prioritario — no lo reescribas, reúsalo)

- **Tokens de color y estilo:** [`apps/web/src/index.css`](apps/web/src/index.css).
  Variables `--pf-*`, bloque `@theme` (clases `bg-pf-primary`, `text-pf-text`…)
  y utilidades `.pf-*` (`pf-card-surface`, `pf-btn-primary-gradient`,
  `pf-hero-title`, `pf-table-thead`…). 3 presets con `[data-pf-theme]`.
  Marca naranja `#f97316`; estados éxito/aviso/peligro/info; radio 1rem.
- **Tipografía:** Plus Jakarta Sans (Google Fonts, en `index.html`).
- **Componentes UI base:** [`apps/web/src/components/ui.tsx`](apps/web/src/components/ui.tsx)
  → `Card`, `Button`, `Field`, `Input`, `Textarea`, `Select`, `Modal`,
  `EmptyState`, `PaginationBar`. **Úsalos siempre.**
- **Cáscara / navegación:** [`apps/web/src/layouts/AppShell.tsx`](apps/web/src/layouts/AppShell.tsx)
  — barra superior oscura + cinta (ribbon) en escritorio; header + drawer en
  móvil. Para agregar secciones solo se tocan las listas `TABS` y `RIBBON`.
- **Encabezados:** [`PageHero.tsx`](apps/web/src/components/PageHero.tsx); logo
  [`BrandLogo.tsx`](apps/web/src/components/BrandLogo.tsx).
- **Tarjetas KPI:** `KpiCard` dentro de
  [`DashboardPage.tsx`](apps/web/src/pages/DashboardPage.tsx).
- En móvil: tabla oculta con `max-md:hidden` + tarjetas `md:hidden`.

## Modelo de datos (Supabase, español)

- **configuracion_prestamista**: una ficha por empresa; nombre, propietario,
  RTN, teléfono y dirección. Su ausencia activa la configuración inicial.
- **empresas / profiles**: frontera multiempresa, cuenta maestra y usuarios
  invitados de cada empresa.
- **clientes**: nombre, identidad (DNI), teléfono, dirección, lugar_trabajo,
  referencias, estado (activo/moroso/cancelado), notas.
- **prestamos**: numero legible, cliente_id, monto (capital), tasa_interes, plazo
  (nº cuotas), frecuencia (diario/semanal/quincenal/mensual), fecha_inicio,
  fecha_primer_pago, dia_pago_semana, tasa_mora y saldo,
  estado (activo/al_dia/en_mora/pagado/cancelado).
- **cuotas**: prestamo_id, numero, fecha_vencimiento, monto, monto_pagado,
  estado (pendiente/pagada/vencida).
- **pagos**: una fila por cobro/recibo; solicitud idempotente, número de recibo,
  fecha, monto, saldos anterior/posterior y snapshot inmutable del comprobante.
- **pago_aplicaciones**: reparto de cada pago entre una o varias cuotas; permite
  pagos parciales sin duplicar recibos.

Tipos TypeScript en [`apps/web/src/types.ts`](apps/web/src/types.ts).
Moneda: Lempira, símbolo `L` (`formatMoney` en
[`lib/format.ts`](apps/web/src/lib/format.ts), locale `es-HN`).

## Estado del MVP (orden de construcción, visual primero)

1. ✅ Login (Supabase Auth) + Clientes + Panel con 6 KPIs (clientes y préstamos
   activos, total prestado, por cobrar, en mora y cobrado hoy).
2. ✅ Listar/crear/ver préstamo + generar tabla de cuotas. Interés **fijo total**:
   se aplica una sola vez al capital; las cuotas se distribuyen en centavos y
   suman exactamente el saldo inicial.
3. ✅ Configuración inicial del prestamista + ficha extendida y estado de
   clientes + número legible y primera fecha de pago del préstamo.
4. ✅ Registrar pagos parciales/completos + actualizar atómicamente saldo,
   cuotas, vencimientos y estado.
5. ✅ Comprobante térmico/PDF/WhatsApp + historial + reportes de cartera,
   morosidad y cobros por período + exportación compatible con Excel.
6. ✅ Planes comerciales: diario 24/40 días, semanal 3/6/9/12 meses y
   quincenal 9/12 meses. El semanal guarda un día fijo de lunes a sábado;
   los préstamos mensuales anteriores siguen siendo compatibles.
7. ✅ Agenda de cobros (vencidos, hoy y próximos 7 días), recordatorios
   manuales por WhatsApp, alertas accionables en el panel y estado de cuenta
   A4/PDF por cliente.
8. ✅ PWA instalable con copia IndexedDB por usuario, operación offline de
   clientes/préstamos/pagos/cobranza, recibos provisionales y cola idempotente
   que se sincroniza al recuperar Internet. Guía operativa en
   [`MODO_OFFLINE.md`](MODO_OFFLINE.md).

El porcentaje de mora de 1.5 % queda guardado como condición en los préstamos
nuevos, pero todavía no se agrega automáticamente al saldo. Falta confirmar la
prioridad de aplicación entre mora, interés y capital. El MVP mantiene interés
fijo total y marca mora por calendario.

Los correos automáticos y la solicitud formal con codeudor/firma quedan para
una etapa posterior: requieren credenciales privadas y definición del flujo de
aprobación. No bloquearon las funciones operativas actuales.

## Recibos / impresión

Un solo módulo: [`apps/web/src/lib/receiptService.ts`](apps/web/src/lib/receiptService.ts)
con `emitirRecibo(datos)`. Es el **único punto** que cambia entre MVP y versión
completa.

- **MVP:** recibo HTML a ancho térmico (58/80 mm) + `window.print()` vía iframe
  oculto (patrón de `lib/ticketPrint.ts` del POS original en `D:\punto de venta`).
- **v2 (después):** envolver la PWA con Capacitor.js y agregar
  `imprimirEscPosBluetooth()` (ESC/POS + `@capacitor-community/bluetooth-le`).
  **No instalar Capacitor ni plugins todavía** — el stub ya existe.

## Cómo correr (dev)

```bash
npm install        # en la raíz
npm run dev        # web en http://localhost:5173 (datos van directo a Supabase)
```

Requisitos: ejecutar o volver a ejecutar `supabase/schema.sql` en el SQL Editor
de Supabase después de cambios del esquema, desplegar `invite-user` cuando
cambie y seguir `ALTA_EMPRESA.md` para crear una empresa nueva.

## Despliegue (Vercel)

Push a `main` del repo → Vercel construye con `npm run build` y sirve
`apps/web/dist` (ya configurado en `vercel.json`). Las llaves viajan en el
código como respaldo, así que no hacen falta variables de entorno.

## Cómo trabajar

- Prioridad: verse idéntica al POS. Reutilizar el sistema de diseño, no inventar.
- Función por función; mostrar cada pantalla antes de seguir.
- Español (Honduras); moneda Lempira `L`.
