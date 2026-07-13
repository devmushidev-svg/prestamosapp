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
