# Gas Tank Monitoring — Stage 2

Tahap ini menyamakan halaman **Input Inspection** dengan field utama HTML lama dan menyiapkan validasi cycle di database.

## Yang berubah

- Date & Time
- Gas Type
- In Quantity (KGS)
- Pressure Unit
- Pressure
- Checked By
- Remarks / Abnormality
- Multiple Photo Evidence
- Clear Form
- Save Inspection
- Riwayat inspection dengan field utama lama
- Foto disimpan di Supabase Storage private bucket
- Status inspection dihitung oleh database berdasarkan `gas_settings`
- Aturan cycle divalidasi oleh database:
  - `In KGS > 0` = refill
  - tanpa refill, unit tidak boleh berubah
  - tanpa refill, pressure tidak boleh meningkat
  - refill membuka cycle baru dan mengizinkan perubahan unit

## Migration Supabase

Jalankan file berikut di Supabase SQL Editor:

`supabase/migrations/20260929_inspection_cycle_and_photos.sql`

Migration ini **tidak mengisi nilai threshold**. Nilai resmi perusahaan tetap harus dimasukkan melalui Gas Settings setelah nilainya dikonfirmasi.

## Catatan

Sebelum migration dijalankan, upload foto dan status database belum dapat bekerja penuh karena bucket/triggers belum tersedia.

Jangan memasukkan `service_role` key ke `.env`, frontend, atau GitHub.
