# MultiPréstamos sin Internet

La aplicación es una PWA instalable. Después de iniciar sesión y preparar la
cartera con Internet, el mismo dispositivo puede consultar clientes,
préstamos, cuotas, agenda, ruta, reportes e historial; además puede registrar
clientes, préstamos, pagos, visitas y cambios del orden de cobro sin señal.

## Instalar la aplicación

1. Abra la dirección publicada directamente en **Chrome o Edge**. En iPhone o
   iPad use **Safari**; no use la vista interna de WhatsApp o Facebook.
2. Abra **Configuraciones → Instalar y modo offline** dentro de MultiPréstamos.
3. Pulse **Instalar MultiPréstamos**.
4. Si Chrome o Edge no muestra el botón, espere unos segundos o abra su menú y elija **Instalar
   aplicación** o **Agregar a pantalla de inicio**.

En iPhone o iPad se instala desde Safari: **Compartir → Agregar a pantalla de
inicio**.

## Preparar el dispositivo antes de salir a cobrar

1. Entre a la aplicación con Internet al menos una vez.
2. Abra **Configuraciones → Instalar y modo offline**.
3. Pulse **Preparar datos offline** o **Sincronizar ahora**.
4. Compruebe que muestra **Este dispositivo está listo para trabajar sin
   Internet**, `0 pendientes` y una fecha de última sincronización.

La aplicación vuelve a sincronizar al recuperar la señal mientras está abierta
o la próxima vez que se abra con Internet. El indicador flotante informa si
está lista, sin conexión, enviando cambios o si algo requiere revisión.

Abra la aplicación con Internet al menos una vez cada 7 días para renovar el
acceso local. No borre los datos del sitio ni use navegación privada.

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

`npm run dev` no genera el instalador PWA. Para comprobarlo localmente use:

```powershell
npm.cmd run build
npm.cmd run preview
```

Abra `http://localhost:4173`. Un teléfono no puede instalar desde una dirección
`http://IP-DE-LA-PC:4173`; para el teléfono use la URL HTTPS publicada.

Después de preparar la cartera puede agregar `?modo-offline=1` a la URL local.
Este interruptor solo comprueba las lecturas y escrituras de IndexedDB; para
probar que la aplicación arranca sin red también debe poner el navegador en
modo Offline o desconectar Internet y volver a abrirla. El interruptor no se
activa en Vercel.
