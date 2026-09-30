-- TSI SMART PRODUCTS - Daily gas threshold email reminders.
-- Reminder recipient for the initial test: santoniushasibuan1@gmail.com
-- Schedule: 09:00 WIB = 02:00 UTC.

create table if not exists public.gas_email_reminder_logs (
    id uuid primary key default gen_random_uuid(),
    inspection_id uuid not null references public.inspections(id) on delete cascade,
    gas_type text not null,
    reminder_date date not null,
    severity text not null check (severity in ('Refill', 'Critical')),
    recipient_email text not null,
    provider_message_id text,
    sent_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint gas_email_reminder_unique
        unique (inspection_id, reminder_date, severity, recipient_email)
);

create index if not exists gas_email_reminder_logs_date_idx
    on public.gas_email_reminder_logs (reminder_date desc);

alter table public.gas_email_reminder_logs enable row level security;

drop policy if exists gas_email_reminder_logs_select_admin
on public.gas_email_reminder_logs;

create policy gas_email_reminder_logs_select_admin
on public.gas_email_reminder_logs
for select
to authenticated
using (public.is_admin());

grant select on table public.gas_email_reminder_logs to authenticated;

-- Enable the extensions used by Supabase Cron to invoke an Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- Vault secrets are intentionally referenced by name rather than storing API keys in SQL.
-- Create these two secrets in Supabase Vault before running the cron job:
--   tsi_project_url  = https://pstofqbammvmrljgbvdh.supabase.co
--   tsi_secret_key   = your Supabase SECRET key (never the publishable key)
--
-- The Edge Function is protected with auth: 'secret', so the scheduled request must use
-- the secret key in the apikey header.

do $$
begin
    perform cron.unschedule('tsi-daily-gas-email-reminder');
exception
    when others then null;
end;
$$;

select cron.schedule(
    'tsi-daily-gas-email-reminder',
    '0 2 * * *',
    $$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'tsi_project_url')
            || '/functions/v1/daily-gas-reminder',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'tsi_secret_key')
        ),
        body := jsonb_build_object(
            'source', 'supabase-cron',
            'scheduled_for', now()
        )
    ) as request_id;
    $$
);
