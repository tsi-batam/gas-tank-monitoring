-- ============================================================
-- TSI SMART PRODUCTS
-- Daily Gas Reminder - Database Fix
--
-- Purpose:
-- 1. Prevent duplicate reminder emails per gas per day.
-- 2. Keep existing reminder history.
-- 3. Make the database compatible with the final
--    daily-gas-reminder Edge Function.
--
-- IMPORTANT:
-- This migration does NOT modify:
-- - inspections
-- - inspection cycle validation
-- - gas_settings
-- - Storage
-- - existing reminder data
-- ============================================================


-- ============================================================
-- 1. REMOVE OLD UNIQUE CONSTRAINT
-- ============================================================

alter table public.gas_email_reminder_logs
drop constraint if exists gas_email_reminder_unique;


-- ============================================================
-- 2. REMOVE POSSIBLE OLD UNIQUE INDEX
-- ============================================================

drop index if exists public.gas_email_reminder_unique_idx;


-- ============================================================
-- 3. CREATE NEW DAILY UNIQUE INDEX
--
-- One gas can send only one reminder to the same recipient
-- on the same Jakarta calendar date.
--
-- Example:
--
-- CO₂ + 2026-09-30 + email
--     -> maximum 1 reminder
--
-- Argon + 2026-09-30 + email
--     -> maximum 1 reminder
--
-- CO₂ + 2026-10-01 + email
--     -> can send again
-- ============================================================

create unique index if not exists
gas_email_reminder_daily_unique_idx
on public.gas_email_reminder_logs
(
    gas_type,
    reminder_date,
    recipient_email
);


-- ============================================================
-- 4. INDEX FOR GAS + DATE LOOKUP
--
-- Used by the Edge Function when checking whether today's
-- reminder has already been sent.
-- ============================================================

create index if not exists
gas_email_reminder_logs_gas_date_idx
on public.gas_email_reminder_logs
(
    gas_type,
    reminder_date desc
);


-- ============================================================
-- 5. INDEX FOR RECIPIENT HISTORY
-- ============================================================

create index if not exists
gas_email_reminder_logs_recipient_date_idx
on public.gas_email_reminder_logs
(
    recipient_email,
    reminder_date desc
);


-- ============================================================
-- 6. KEEP RLS ENABLED
-- ============================================================

alter table public.gas_email_reminder_logs
enable row level security;


-- ============================================================
-- 7. ADMIN CAN READ REMINDER LOGS
-- ============================================================

drop policy if exists
gas_email_reminder_logs_select_admin
on public.gas_email_reminder_logs;


create policy
gas_email_reminder_logs_select_admin
on public.gas_email_reminder_logs
for select
to authenticated
using (
    public.is_admin()
);


-- ============================================================
-- 8. SERVICE ROLE / EDGE FUNCTION
--
-- The Edge Function uses the Supabase secret/service key.
-- Therefore it bypasses normal RLS policies.
--
-- DO NOT create an INSERT policy for normal users.
-- Reminder logs must only be created by the server-side
-- Edge Function.
-- ============================================================


-- ============================================================
-- 9. VERIFY REQUIRED COLUMNS
--
-- No ALTER TABLE is performed here because the original
-- migration already creates these columns.
--
-- Expected columns:
--
-- id
-- inspection_id
-- gas_type
-- reminder_date
-- severity
-- recipient_email
-- provider_message_id
-- sent_at
-- created_at
-- ============================================================


-- ============================================================
-- 10. FINAL COMMENTS
-- ============================================================

comment on table public.gas_email_reminder_logs is
'Daily email reminder history for gas threshold alerts. One reminder per gas, recipient, and Jakarta calendar day.';

comment on column public.gas_email_reminder_logs.reminder_date is
'Calendar date used for daily reminder deduplication. The Edge Function calculates this using Asia/Jakarta.';

comment on column public.gas_email_reminder_logs.severity is
'Reminder severity: Refill or Critical.';


-- ============================================================
-- END
-- ============================================================