# MultiPréstamos sin Internet

La aplicación es una PWA instalable. Después de iniciar sesión y preparar la
cartera una vez con Internet, el mismo dispositivo puede consultar clientes,
préstamos, cuotas, agenda, ruta, reportes e historial; además puede registrar
clientes, préstamos, pagos, visitas y cambios del orden de cobro sin señal.

## Instalar la aplicación

1. Abra **Configuraciones** dentro de MultiPréstamos.
2. En **Aplicación en este dispositivo**, pulse **Instalar MultiPréstamos**.
3. Si Chrome o Edge no muestra el botón, abra su menú y elija **Instalar
   aplicación** o **Agregar a pantalla de inicio**.

En iPhone o iPad se instala desde Safari: **Compartir → Agregar a pantalla de
inicio**.

## Preparar el dispositivo antes de salir a cobrar

1. Entre a la aplicación con Internet al menos una vez.
2. Abra **Configuraciones → Trabajo sin Internet**.
3. Pulse **Preparar datos offline** o **Sincronizar ahora**.
4. Compruebe que indica `0 pendientes` y muestra una fecha de última
   sincronización.

La aplicación vuelve a sincronizar al recuperar la señal. El indicador
flotante informa si está sin conexión, enviando cambios o si algo requiere
revisión.

## Pagos hechos sin señal

- El saldo y las cuotas cambian inmediatamente en el dispositivo.
- Se genera un comprobante provisional `PEND-…`, que se puede imprimir o
  compartir.
- Al volver Internet se usa la misma solicitud idempotente, evitando cobros
  duplicados, se conserva la fecha real de captura y se asigna el número
  oficial `REC-…`.
- No cierre sesión ni borre los datos del navegador mientras haya operaciones
  pendientes.

## Casos que todavía necesitan Internet

- El primer inicio de sesión en un dispositivo.
- Subir o reemplazar fotografías de fachada/DNI.
- Cerrar sesión de forma segura.
- Obtener el número oficial de un recibo provisional.

## Verificación local para desarrollo

Después de compilar y abrir la aplicación en localhost, agregue
`?modo-offline=1` a la URL. Este interruptor solo funciona en `localhost` o
`127.0.0.1`; permite comprobar la copia IndexedDB sin desconectar el equipo y
no se activa en Vercel.
