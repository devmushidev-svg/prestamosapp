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
  Los usuarios se crean a mano en el panel de Supabase (Authentication → Users
  → Add user, con “Auto Confirm”). No hay registro público ni roles (MVP).
  En Authentication → Providers → Email debe estar desactivado **Allow new
  users to sign up**; ocultar el registro en la interfaz no bloquea el endpoint
  público de Supabase.
- **Esquema de la base:** [`supabase/schema.sql`](supabase/schema.sql) — se pega
  en el SQL Editor de Supabase y se vuelve a ejecutar cuando cambie. Tablas:
  `configuracion_prestamista`, `clientes`, `prestamos`, `cuotas`, `pagos`, todas con RLS “solo
  autenticados”. Incluye la función transaccional
  `crear_prestamo_con_cuotas`.

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

- **configuracion_prestamista**: ficha singleton del negocio; nombre, propietario,
  RTN, teléfono y dirección. Su ausencia activa la configuración inicial.
- **clientes**: nombre, identidad (DNI), teléfono, dirección, lugar_trabajo,
  referencias, estado (activo/moroso/cancelado), notas.
- **prestamos**: numero legible, cliente_id, monto (capital), tasa_interes, plazo
  (nº cuotas), frecuencia (semanal/quincenal/mensual), fecha_inicio,
  fecha_primer_pago, saldo,
  estado (activo/al_dia/en_mora/pagado/cancelado).
- **cuotas**: prestamo_id, numero, fecha_vencimiento, monto,
  estado (pendiente/pagada/vencida).
- **pagos**: prestamo_id, cuota_id, fecha, monto, recibo (nº comprobante).

Tipos TypeScript en [`apps/web/src/types.ts`](apps/web/src/types.ts).
Moneda: Lempira, símbolo `L` (`formatMoney` en
[`lib/format.ts`](apps/web/src/lib/format.ts), locale `es-HN`).

## Estado del MVP (orden de construcción, visual primero)

1. ✅ Login (Supabase Auth) + Clientes + Panel con 4 KPIs (Total prestado,
   Por cobrar, En mora, Cobrado hoy).
2. ✅ Listar/crear/ver préstamo + generar tabla de cuotas. Interés **fijo total**:
   se aplica una sola vez al capital; las cuotas se distribuyen en centavos y
   suman exactamente el saldo inicial.
3. ✅ Configuración inicial del prestamista + ficha extendida y estado de
   clientes + número legible y primera fecha de pago del préstamo.
4. ⬜ Registrar pagos parciales/completos + actualizar saldo, cuotas y estado.
5. ⬜ Comprobante de pago + reportes de cartera (morosidad, cobros por período).

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
de Supabase después de cambios del esquema, y crear un usuario en
Authentication → Users.

## Despliegue (Vercel)

Push a `main` del repo → Vercel construye con `npm run build` y sirve
`apps/web/dist` (ya configurado en `vercel.json`). Las llaves viajan en el
código como respaldo, así que no hacen falta variables de entorno.

## Cómo trabajar

- Prioridad: verse idéntica al POS. Reutilizar el sistema de diseño, no inventar.
- Función por función; mostrar cada pantalla antes de seguir.
- Español (Honduras); moneda Lempira `L`.
