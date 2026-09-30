-- Gas Tank Monitoring System / PT TSI Smart Product
-- Base schema for a new/empty Supabase project.
-- Threshold values intentionally remain NULL until confirmed by Engineering.
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('Admin','Operator','User'); exception when duplicate_object then null; end $$;

do $$ begin create type public.gas_type as enum ('CO₂','Argon'); exception when duplicate_object then null; end $$;

do $$ begin create type public.inspection_status as enum ('Normal','Refill','Critical','Unset'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  full_name text not null,
  role public.app_role not null default 'User',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles(lower(username));

create table if not exists public.gas_settings (
  id uuid primary key default gen_random_uuid(),
  gas_type public.gas_type not null,
  pressure_unit text not null,
  refill_threshold numeric(14,4),
  critical_threshold numeric(14,4),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(gas_type, pressure_unit),
  check ((gas_type='CO₂' and pressure_unit in ('mmWC','bar')) or (gas_type='Argon' and pressure_unit in ('mmH₂O','kPa','MPa'))),
  check (refill_threshold is null or critical_threshold is null or critical_threshold <= refill_threshold)
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_date timestamptz not null default now(),
  gas_type public.gas_type not null,
  in_kgs numeric(10,2) check (in_kgs is null or in_kgs >= 0),
  pressure numeric(12,3) not null check (pressure >= 0),
  pressure_unit text not null,
  inspector_name text not null,
  status public.inspection_status not null default 'Unset',
  notes text,
  photo_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((gas_type='CO₂' and pressure_unit in ('mmWC','bar')) or (gas_type='Argon' and pressure_unit in ('mmH₂O','kPa','MPa')))
);
create index if not exists inspections_date_idx on public.inspections(inspection_date desc);
create index if not exists inspections_gas_date_idx on public.inspections(gas_type,inspection_date desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.gas_settings;
create trigger settings_touch before update on public.gas_settings for each row execute function public.touch_updated_at();
drop trigger if exists inspections_touch on public.inspections;
create trigger inspections_touch before update on public.inspections for each row execute function public.touch_updated_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='Admin' and is_active); $$;
create or replace function public.is_operator_or_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('Admin','Operator') and is_active); $$;
create or replace function public.is_authenticated_active() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and is_active); $$;

create or replace function public.validate_inspection_cycle() returns trigger language plpgsql security definer set search_path=public as $$
declare previous_record public.inspections; begin
  select * into previous_record from public.inspections where gas_type=new.gas_type order by inspection_date desc limit 1;
  if previous_record.id is not null and coalesce(new.in_kgs,0) <= 0 then
    if new.pressure_unit <> previous_record.pressure_unit then raise exception 'Pressure unit cannot change without refill'; end if;
    if new.pressure > previous_record.pressure then raise exception 'Pressure cannot increase without refill'; end if;
  end if;
  return new;
end $$;
drop trigger if exists inspection_cycle_validation on public.inspections;
create trigger inspection_cycle_validation before insert on public.inspections for each row execute function public.validate_inspection_cycle();

create or replace function public.calculate_inspection_status(p_gas_type public.gas_type,p_pressure numeric,p_unit text) returns public.inspection_status language plpgsql stable as $$
declare refill numeric; critical numeric; begin
  select refill_threshold,critical_threshold into refill,critical from public.gas_settings where gas_type=p_gas_type and pressure_unit=p_unit;
  if refill is null or critical is null then return 'Unset'; end if;
  if p_pressure <= critical then return 'Critical'; end if;
  if p_pressure <= refill then return 'Refill'; end if;
  return 'Normal';
end $$;

insert into public.gas_settings(gas_type,pressure_unit) values
 ('CO₂','mmWC'),('CO₂','bar'),('Argon','mmH₂O'),('Argon','kPa'),('Argon','MPa')
on conflict(gas_type,pressure_unit) do nothing;

alter table public.profiles enable row level security;
alter table public.gas_settings enable row level security;
alter table public.inspections enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_select on public.gas_settings;
create policy settings_select on public.gas_settings for select to authenticated using (public.is_authenticated_active());
drop policy if exists settings_admin_update on public.gas_settings;
create policy settings_admin_update on public.gas_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists inspections_select on public.inspections;
create policy inspections_select on public.inspections for select to authenticated using (public.is_authenticated_active());
drop policy if exists inspections_insert on public.inspections;
create policy inspections_insert on public.inspections for insert to authenticated with check (public.is_operator_or_admin() and created_by=auth.uid());
drop policy if exists inspections_update on public.inspections;
create policy inspections_update on public.inspections for update to authenticated using (public.is_operator_or_admin()) with check (public.is_operator_or_admin());
drop policy if exists inspections_delete on public.inspections;
create policy inspections_delete on public.inspections for delete to authenticated using (public.is_admin());

drop policy if exists audit_admin_select on public.audit_logs;
create policy audit_admin_select on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists audit_insert_self on public.audit_logs;
create policy audit_insert_self on public.audit_logs for insert to authenticated with check (user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inspection-images','inspection-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false;
