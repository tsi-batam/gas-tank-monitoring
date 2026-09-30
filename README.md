# Gas Tank Monitoring System — PT TSI Smart Product

Starter rebuild: React + TypeScript + Vite + Supabase.

## Jalankan lokal

1. Copy `.env.example` menjadi `.env.local`.
2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Jalankan:

```bash
npm install
npm run dev
```

## Database

Jalankan `supabase/migrations/001_initial.sql` di Supabase SQL Editor pada database yang masih sesuai dengan schema aplikasi.

## Catatan

- Login UI memakai Username + Password.
- Identitas email sintetis hanya dipakai internal oleh Supabase Auth.
- Jangan pernah memasukkan `service_role` key ke `.env.local` yang dikirim ke browser.
- Threshold harus diisi sesuai nilai resmi Engineering/perusahaan.
- Tahap ini sudah menyediakan Dashboard, Inspection, Settings Admin, dan daftar Users. Edge Functions untuk bootstrap/create user dan audit yang lebih ketat akan menjadi tahap berikutnya.
