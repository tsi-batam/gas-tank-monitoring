-- TSI SMART PRODUCTS - Inspection cycle validation, status calculation, and private photo storage.
-- Threshold values are intentionally NOT seeded here because the official company values
-- were not verified. The existing gas_settings rows remain unchanged.

create or replace function public.validate_inspection_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    previous record;
    is_refill boolean := coalesce(new.in_kgs, 0) > 0;
begin
    -- Serialize inserts per gas type so two simultaneous inspections cannot bypass the cycle rule.
    perform pg_advisory_xact_lock(hashtextextended(new.gas_type, 0));

    select i.id, i.pressure, i.pressure_unit, i.in_kgs, i.inspection_date
      into previous
      from public.inspections i
     where i.gas_type = new.gas_type
     order by i.inspection_date desc, i.created_at desc, i.id desc
     limit 1;

    if previous.id is null then
        return new;
    end if;

    -- Unit may only change when the new record is a refill.
    if not is_refill and new.pressure_unit <> previous.pressure_unit then
        raise exception 'Pressure unit tidak boleh berubah tanpa refill. Unit aktif: %', previous.pressure_unit
            using errcode = '23514';
    end if;

    -- Without refill, pressure may not increase within the active cycle.
    if not is_refill and new.pressure_unit = previous.pressure_unit and new.pressure > previous.pressure then
        raise exception 'Pressure tidak boleh meningkat tanpa refill. Pressure terakhir: % %', previous.pressure, previous.pressure_unit
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_inspection_cycle on public.inspections;
create trigger trg_validate_inspection_cycle
before insert on public.inspections
for each row execute function public.validate_inspection_cycle();

create or replace function public.calculate_inspection_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    setting record;
begin
    select refill_threshold, critical_threshold
      into setting
      from public.gas_settings
     where gas_type = new.gas_type
       and pressure_unit = new.pressure_unit
     limit 1;

    if setting.refill_threshold is null or setting.critical_threshold is null then
        new.status := 'Unset';
    elsif new.pressure <= setting.critical_threshold then
        new.status := 'Critical';
    elsif new.pressure <= setting.refill_threshold then
        new.status := 'Refill';
    else
        new.status := 'Normal';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_calculate_inspection_status on public.inspections;
create trigger trg_calculate_inspection_status
before insert or update of pressure, gas_type, pressure_unit
on public.inspections
for each row execute function public.calculate_inspection_status();

-- Private bucket. The frontend must only use the publishable key; no service_role key belongs in Vite.
insert into storage.buckets (id, name, public)
values ('inspection-images', 'inspection-images', false)
on conflict (id) do update set public = false;

drop policy if exists inspection_images_select_active on storage.objects;
drop policy if exists inspection_images_insert_operator on storage.objects;
drop policy if exists inspection_images_delete_admin on storage.objects;

create policy inspection_images_select_active
on storage.objects
for select
to authenticated
using (
    bucket_id = 'inspection-images'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_active = true
    )
);

create policy inspection_images_insert_operator
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'inspection-images'
    and public.is_operator_or_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
);

create policy inspection_images_delete_admin
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'inspection-images'
    and public.is_admin()
);

