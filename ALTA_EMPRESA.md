# Alta de una empresa y su cuenta maestra

MultiPréstamos no permite crear empresas desde el formulario público. El alta
se hace de forma controlada en Supabase; después, la cuenta maestra invita a
los prestamistas de su propia empresa desde **Empresa → Usuarios de la
empresa**.

## Preparación (una sola vez)

Respete este orden para que las instalaciones PWA antiguas no intenten guardar
la configuración con la clave global anterior:

1. Publique primero este frontend nuevo en Vercel y abra/reinicie la PWA con
   Internet para que reciba la actualización.
2. Ejecute completo `supabase/schema.sql` en **Supabase → SQL Editor**.
3. En los secretos de Edge Functions configure `APP_URL` con el origen de la
   aplicación, sin una ruta final. Ejemplo:

   ```text
   APP_URL=https://su-aplicacion.vercel.app
   ```

   Esto impide que un enlace de invitación redirija a un sitio ajeno. La
   función rechaza invitaciones hasta que exista este secreto.
4. Vuelva a desplegar la Edge Function `invite-user`.

## Crear una empresa

1. En **Authentication → Users**, cree o invite al usuario que será la cuenta
   maestra. Copie su UUID. Todavía no debe tener una fila en `profiles`.
2. En **SQL Editor**, ejecute reemplazando los datos de ejemplo:

   ```sql
   select public.provisionar_empresa_master(
     p_user_id := '00000000-0000-0000-0000-000000000000'::uuid,
     p_empresa_nombre := 'Nombre de la empresa',
     p_nombre := 'Nombre del propietario',
     p_apellido := 'Apellido',
     p_telefono := '99999999'
   );
   ```

3. La cuenta maestra inicia sesión y completa **Datos de la empresa**.
4. Desde **Usuarios de la empresa**, invita al resto del equipo. Esas
   invitaciones siempre se guardan con la misma `empresa_id` y rol
   `prestamista`.

La función `provisionar_empresa_master` está revocada para `anon` y
`authenticated`; solo puede ejecutarse desde SQL Editor o con `service_role`.
La llave `service_role` nunca debe copiarse al frontend, a Vite ni al
navegador.

## Reglas importantes

- Cada empresa conserva exactamente una cuenta maestra activa.
- Una cuenta maestra no se crea con el botón **Invitar usuario**; ese botón es
  solamente para el equipo de la empresa actual.
- Un usuario de Auth sin `profile` queda bloqueado y no se asigna
  automáticamente a ninguna empresa.
- La configuración comercial, cartera, usuarios y fotos quedan aislados por
  empresa mediante RLS.
