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
4. Pulse **Proteger copia** si el navegador muestra esa opción.
5. Compruebe que muestra **Este dispositivo está listo para trabajar sin
   Internet**, `0 pendientes`, una fecha de última sincronización y, cuando el
   navegador lo conceda, **Copia protegida contra la limpieza automática**.

La aplicación vuelve a sincronizar al recuperar la señal mientras está abierta
o la próxima vez que se abra con Internet. El indicador flotante informa si
está lista, sin conexión, enviando cambios o si algo requiere revisión.

El acceso local no caduca por tiempo: permanece hasta cerrar sesión o borrar
los datos del sitio. Sin embargo, vuelva a sincronizar siempre que tenga señal
para respaldar en Supabase los cobros hechos en la calle. No use navegación
privada.

La protección evita que el navegador limpie automáticamente la copia por falta
de espacio, pero ninguna web puede impedir que una persona borre manualmente
los datos, elimine el perfil o pierda el dispositivo. La copia definitiva de
una operación es la que ya aparece sincronizada en Supabase.

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
- Subir o reemplazar fotografías de fachada. Las fotos ya sincronizadas sí se
  incluyen en la copia offline.
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
