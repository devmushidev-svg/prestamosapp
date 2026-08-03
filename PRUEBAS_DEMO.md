# Guía rápida de pruebas — lote El Progreso

Este lote contiene información **completamente ficticia**. Los nombres,
identidades, teléfonos, direcciones comerciales y referencias no pertenecen a
personas reales. Las colonias solo sirven para probar la organización de rutas
en El Progreso, Yoro.

## Acceso

- Aplicación: <https://loan-app-azure.vercel.app/>
- Use las credenciales de prueba compartidas por separado.

## Recorrido recomendado

1. Revise el **Panel**: los seis indicadores, vencidos, cobros de hoy y próximos
   siete días deben tener valores.
2. Abra **Ruta de cobro**: pruebe las pestañas de cobros de hoy, toda la cartera,
   visitados/no visitados, búsqueda y ruta personalizada por colonia.
3. Abra **Agenda**: cambie entre vencidas, hoy y próximas.
4. Revise **Reportes**: filtros, paginación, PDF/imprimir y Excel (.csv).
5. Revise **Clientes** y **Préstamos** en escritorio y en teléfono.

## Casos preparados

| Cliente DEMO | Qué probar |
| --- | --- |
| Ana López (DEMO 01) | Dos préstamos activos y pago/comprobante consolidado. |
| Carlos Mejía (DEMO 02) | Promesa vencida, préstamo en mora e historial pagado. |
| Karla Hernández (DEMO 05) | Promesa parcialmente cumplida y pago parcial reciente. |
| Luis Pineda (DEMO 06) | Cliente al día con pago registrado hoy. |
| Óscar Aguilar (DEMO 08) | Préstamo cancelado. |
| Daniela Martínez (DEMO 09) | Cuota semanal que vence hoy. |
| Héctor Ramírez (DEMO 14) | Dos préstamos y aplicación de pago entre créditos. |
| Wendy Núñez (DEMO 15) | Crédito casi terminado, pero con atraso. |
| Yessenia Acosta (DEMO 23) | Cuota quincenal de hoy y promesa futura. |
| Edgardo Suazo (DEMO 24) | Dos préstamos y promesa sustituida. |
| Tatiana Portillo (DEMO 27) | Cuota parcialmente pagada. |
| Iris Euceda (DEMO 29) | Cliente activo todavía sin préstamo. |
| Ramón Membreño (DEMO 30) | Cliente cancelado, sin teléfono ni dirección. |

## Volumen esperado

- 30 clientes DEMO
- 32 préstamos
- 850 cuotas
- 94 pagos históricos, de los cuales 9 corresponden al día de generación
- 15 gestiones de cobro

El generador usa como fecha base el día de ejecución. Por eso vencimientos,
promesas y cobros de hoy se mantienen útiles cuando se vuelva a cargar el lote.

## Regenerar o retirar el lote

Desde la raíz del proyecto, defina temporalmente
`SUPABASE_DEMO_EMAIL` y `SUPABASE_DEMO_PASSWORD` y ejecute:

```bash
npm run demo:seed
```

El comando limpia primero exclusivamente los registros identificados con
`DEMO-EP-*`, por lo que se puede repetir sin duplicarlos. Para retirarlos:

```bash
npm run demo:clean
```
