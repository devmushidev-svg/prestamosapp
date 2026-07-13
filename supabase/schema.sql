-- MultiPréstamos — esquema inicial.
-- Ejecutar en Supabase: panel → SQL Editor → pegar → Run.
-- El script es repetible: vuelve a crear las políticas RLS con la misma configuración.

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  identidad text,
  telefono text,
  direccion text,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists prestamos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  monto numeric(14,2) not null check (monto > 0),
  tasa_interes numeric(6,2) not null default 0
    constraint prestamos_tasa_no_negativa check (tasa_interes >= 0),
  plazo integer not null check (plazo > 0),
  frecuencia text not null check (frecuencia in ('semanal', 'quincenal', 'mensual')),
  fecha_inicio date not null default current_date,
  saldo numeric(14,2) not null
    constraint prestamos_saldo_no_negativo check (saldo >= 0),
  estado text not null default 'activo'
    check (estado in ('activo', 'al_dia', 'en_mora', 'pagado', 'cancelado')),
  solicitud_id uuid,
  creado_en timestamptz not null default now()
);

create table if not exists cuotas (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references prestamos(id) on delete cascade,
  numero integer not null
    constraint cuotas_numero_positivo check (numero > 0),
  fecha_vencimiento date not null,
  monto numeric(14,2) not null
    constraint cuotas_monto_positivo check (monto > 0),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'pagada', 'vencida')),
  unique (prestamo_id, numero),
  constraint cuotas_id_prestamo_unique unique (id, prestamo_id)
);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references prestamos(id),
  cuota_id uuid,
  fecha timestamptz not null default now(),
  monto numeric(14,2) not null check (monto > 0),
  recibo text,
  constraint pagos_cuota_prestamo_fk
    foreign key (cuota_id, prestamo_id) references cuotas(id, prestamo_id)
);

-- Migraciones idempotentes para proyectos donde las tablas ya existían antes
-- de agregar estas validaciones.
alter table prestamos add column if not exists solicitud_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prestamos_tasa_no_negativa') then
    alter table prestamos add constraint prestamos_tasa_no_negativa check (tasa_interes >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prestamos_saldo_no_negativo') then
    alter table prestamos add constraint prestamos_saldo_no_negativo check (saldo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cuotas_numero_positivo') then
    alter table cuotas add constraint cuotas_numero_positivo check (numero > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cuotas_monto_positivo') then
    alter table cuotas add constraint cuotas_monto_positivo check (monto > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cuotas_id_prestamo_unique') then
    alter table cuotas add constraint cuotas_id_prestamo_unique unique (id, prestamo_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pagos_cuota_prestamo_fk') then
    alter table pagos add constraint pagos_cuota_prestamo_fk
      foreign key (cuota_id, prestamo_id) references cuotas(id, prestamo_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prestamos_solicitud_id_unique') then
    alter table prestamos add constraint prestamos_solicitud_id_unique unique (solicitud_id);
  end if;
end $$;

create index if not exists idx_prestamos_cliente on prestamos (cliente_id);
create index if not exists idx_cuotas_prestamo on cuotas (prestamo_id);
create index if not exists idx_pagos_prestamo on pagos (prestamo_id);
create index if not exists idx_pagos_fecha on pagos (fecha);

-- RLS: acceso total para usuarios autenticados (los usuarios se crean a mano
-- en el panel de Supabase: Authentication → Users → Add user).
-- ponytail: política única de un solo negocio; políticas por rol llegan si algún día hay multi-usuario con permisos.
alter table clientes enable row level security;
alter table prestamos enable row level security;
alter table cuotas enable row level security;
alter table pagos enable row level security;

drop policy if exists "autenticados" on clientes;
drop policy if exists "autenticados" on prestamos;
drop policy if exists "autenticados" on cuotas;
drop policy if exists "autenticados" on pagos;

create policy "autenticados" on clientes for all to authenticated using (true) with check (true);
create policy "autenticados" on prestamos for all to authenticated using (true) with check (true);
create policy "autenticados" on cuotas for all to authenticated using (true) with check (true);
create policy "autenticados" on pagos for all to authenticated using (true) with check (true);

-- Crea el préstamo y todas sus cuotas dentro de una sola transacción.
-- Interés fijo total: capital + round(capital * tasa / 100, 2).
-- La primera cuota vence después de un período completo y los centavos
-- sobrantes se reparten para que la suma sea exactamente igual al saldo.
drop function if exists public.crear_prestamo_con_cuotas(uuid, numeric, numeric, integer, text, date);

create or replace function public.crear_prestamo_con_cuotas(
  p_solicitud_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_tasa_interes numeric,
  p_plazo integer,
  p_frecuencia text,
  p_fecha_inicio date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prestamo_id uuid;
  v_existing public.prestamos%rowtype;
  v_interes numeric;
  v_total numeric;
  v_total_centavos bigint;
  v_base_centavos bigint;
  v_sobrante bigint;
begin
  if p_solicitud_id is null then
    raise exception using message = 'La identificación de solicitud es obligatoria', errcode = '23502';
  end if;
  if p_cliente_id is null then
    raise exception using message = 'El cliente es obligatorio', errcode = '23502';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 999999999999.99
    or p_monto <> round(p_monto, 2) then
    raise exception using message = 'El capital debe ser positivo y tener máximo dos decimales', errcode = '23514';
  end if;
  if p_tasa_interes is null or p_tasa_interes < 0 or p_tasa_interes > 9999.99
    or p_tasa_interes <> round(p_tasa_interes, 2) then
    raise exception using message = 'La tasa debe estar entre 0 y 9999.99 y tener máximo dos decimales', errcode = '23514';
  end if;
  if p_plazo is null or p_plazo < 1 or p_plazo > 600 then
    raise exception using message = 'El plazo debe estar entre 1 y 600 cuotas', errcode = '23514';
  end if;
  if p_frecuencia is null or p_frecuencia not in ('semanal', 'quincenal', 'mensual') then
    raise exception using message = 'La frecuencia no es válida', errcode = '23514';
  end if;
  if p_fecha_inicio is null then
    raise exception using message = 'La fecha de inicio es obligatoria', errcode = '23502';
  end if;

  perform 1 from public.clientes where id = p_cliente_id;
  if not found then
    raise exception using message = 'El cliente no existe', errcode = '23503';
  end if;

  v_interes := round(p_monto * p_tasa_interes / 100, 2);
  v_total := p_monto + v_interes;
  if v_total > 999999999999.99 then
    raise exception using message = 'El total del préstamo excede el máximo permitido', errcode = '22003';
  end if;

  v_total_centavos := round(v_total * 100)::bigint;
  v_base_centavos := v_total_centavos / p_plazo;
  v_sobrante := mod(v_total_centavos, p_plazo::bigint);
  if v_base_centavos < 1 then
    raise exception using message = 'El total es demasiado bajo para la cantidad de cuotas', errcode = '23514';
  end if;

  insert into public.prestamos (
    solicitud_id, cliente_id, monto, tasa_interes, plazo, frecuencia, fecha_inicio, saldo, estado
  ) values (
    p_solicitud_id, p_cliente_id, p_monto, p_tasa_interes, p_plazo, p_frecuencia, p_fecha_inicio, v_total, 'activo'
  )
  on conflict (solicitud_id) do nothing
  returning id into v_prestamo_id;

  if v_prestamo_id is null then
    select * into v_existing
    from public.prestamos
    where solicitud_id = p_solicitud_id;

    if not found then
      raise exception using message = 'No se pudo confirmar la solicitud del préstamo', errcode = '40001';
    end if;
    if v_existing.cliente_id is distinct from p_cliente_id
      or v_existing.monto is distinct from p_monto
      or v_existing.tasa_interes is distinct from p_tasa_interes
      or v_existing.plazo is distinct from p_plazo
      or v_existing.frecuencia is distinct from p_frecuencia
      or v_existing.fecha_inicio is distinct from p_fecha_inicio then
      raise exception using message = 'La solicitud ya fue usada con datos diferentes', errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  insert into public.cuotas (prestamo_id, numero, fecha_vencimiento, monto, estado)
  select
    v_prestamo_id,
    serie.numero,
    case p_frecuencia
      when 'semanal' then p_fecha_inicio + (serie.numero * 7)
      when 'quincenal' then p_fecha_inicio + (serie.numero * 15)
      else (p_fecha_inicio + make_interval(months => serie.numero))::date
    end,
    (
      v_base_centavos + case when serie.numero <= v_sobrante then 1 else 0 end
    )::numeric / 100,
    'pendiente'
  from generate_series(1, p_plazo) as serie(numero);

  return v_prestamo_id;
end;
$$;

revoke all on function public.crear_prestamo_con_cuotas(uuid, uuid, numeric, numeric, integer, text, date)
  from public, anon;
grant execute on function public.crear_prestamo_con_cuotas(uuid, uuid, numeric, numeric, integer, text, date)
  to authenticated;
