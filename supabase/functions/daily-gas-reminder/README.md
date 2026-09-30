# Daily Gas Reminder

Sends a daily 09:00 WIB reminder to `santoniushasibuan1@gmail.com` for the latest inspection of each gas type when the current pressure is at/below a configured threshold.

- `pressure <= critical_threshold` -> CRITICAL / URGENT
- `critical_threshold < pressure <= refill_threshold` -> REFILL REQUIRED
- latest inspection `in_kgs > 0` -> refill completed; reminder stops
- reminder repeats each Jakarta calendar day until refill

The function reads server-only secrets. Do not put them in the React/Vite `.env.local`.
