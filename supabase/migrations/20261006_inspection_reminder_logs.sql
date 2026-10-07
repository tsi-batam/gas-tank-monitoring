create table if not exists public.inspection_reminder_logs (
    id uuid primary key default gen_random_uuid(),

    reminder_date date not null,

    recipient_email text not null,

    last_input_date date,

    provider_message_id text,

    created_at timestamptz not null default now(),

    constraint inspection_reminder_logs_unique_daily
        unique (
            reminder_date,
            recipient_email
        )
);

create index if not exists idx_inspection_reminder_logs_reminder_date
on public.inspection_reminder_logs (
    reminder_date
);

alter table public.inspection_reminder_logs
enable row level security;