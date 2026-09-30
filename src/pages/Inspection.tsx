import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInspection,
  getInspectionPhotos,
  getInspections,
} from '../services/inspection'
import { uploadInspectionPhotos } from '../services/storage'
import { useAuth } from '../contexts/AuthContext'
import type { GasType, Inspection } from '../types'

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16)
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }

  return 'Gagal menyimpan inspection.'
}

export default function Inspection() {
  const { profile } = useAuth()

  const fileRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Inspection[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})

  const [gas, setGas] = useState<GasType>('CO₂')
  const [unit, setUnit] = useState('mmWC')

  const [inspectionDate, setInspectionDate] = useState(
    toDateTimeLocal(),
  )

  const [pressure, setPressure] = useState('')
  const [kgs, setKgs] = useState('')
  const [checkedBy, setCheckedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])

  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const units = useMemo(
    () =>
      gas === 'CO₂'
        ? ['mmWC', 'bar']
        : ['mmH₂O', 'kPa', 'MPa'],
    [gas],
  )

  useEffect(() => {
    if (profile && !checkedBy) {
      setCheckedBy(profile.full_name)
    }
  }, [profile, checkedBy])

  useEffect(() => {
    setUnit(gas === 'CO₂' ? 'mmWC' : 'mmH₂O')
  }, [gas])

  const refresh = async () => {
    const nextRows = await getInspections()

    setRows(nextRows)

    if (nextRows.length === 0) {
      setPhotoCounts({})
      return
    }

    const photoRows = await getInspectionPhotos(
      nextRows.map((row) => row.id),
    )

    const counts: Record<string, number> = {}

    for (const photo of photoRows) {
      counts[photo.inspection_id] =
        (counts[photo.inspection_id] ?? 0) + 1
    }

    setPhotoCounts(counts)
  }

  useEffect(() => {
    void refresh().catch((err) => {
      setError(
        getErrorMessage(err).replace(
          'Gagal menyimpan inspection.',
          'Gagal membaca inspection.',
        ),
      )
    })
  }, [])

  const clearForm = () => {
    setInspectionDate(toDateTimeLocal())
    setGas('CO₂')
    setUnit('mmWC')
    setPressure('')
    setKgs('')
    setCheckedBy(profile?.full_name ?? '')
    setNotes('')
    setPhotos([])

    if (fileRef.current) {
      fileRef.current.value = ''
    }

    setMsg('')
    setError('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()

    if (!profile) {
      setError('User belum terautentikasi.')
      return
    }

    setBusy(true)
    setMsg('')
    setError('')

    try {
      const pressureValue = Number(pressure)
      const kgsValue =
        kgs === ''
          ? null
          : Number(kgs)

      // =========================
      // VALIDASI FORM
      // =========================

      if (!inspectionDate) {
        throw new Error('Date & Time wajib diisi.')
      }

      if (
        !Number.isFinite(pressureValue) ||
        pressureValue < 0
      ) {
        throw new Error(
          'Pressure harus berupa angka 0 atau lebih.',
        )
      }

      if (
        kgsValue !== null &&
        (!Number.isFinite(kgsValue) || kgsValue < 0)
      ) {
        throw new Error(
          'In Quantity (KGS) harus 0 atau lebih.',
        )
      }

      if (!checkedBy.trim()) {
        throw new Error('Checked By wajib diisi.')
      }

      // =========================
      // SIMPAN INSPECTION
      // =========================

      const inspection = await createInspection(
        {
          inspection_date: new Date(
            inspectionDate,
          ).toISOString(),

          gas_type: gas,

          in_kgs: kgsValue,

          pressure: pressureValue,

          pressure_unit: unit,

          inspector_name: checkedBy.trim(),

          notes: notes.trim() || null,

          photo_path: null,
        },
        profile.id,
      )

      // =========================
      // UPLOAD FOTO
      // =========================

      if (photos.length > 0) {
        await uploadInspectionPhotos(
          inspection.id,
          profile.id,
          photos,
        )
      }

      // =========================
      // BERHASIL
      // =========================

      setMsg('Inspection berhasil disimpan.')

      // Bersihkan field input,
      // tetapi jangan menghapus pesan sukses.
      setInspectionDate(toDateTimeLocal())
      setGas('CO₂')
      setUnit('mmWC')
      setPressure('')
      setKgs('')
      setCheckedBy(profile.full_name)
      setNotes('')
      setPhotos([])

      if (fileRef.current) {
        fileRef.current.value = ''
      }

      await refresh()
    } catch (err) {
      // =========================
      // ERROR DATABASE / VALIDASI
      // =========================

      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h2>Input Inspection</h2>

          <p>
            Catat pemeriksaan gas tank sesuai siklus inspeksi.
          </p>
        </div>
      </div>

      <section className="panel form-panel">
        <form
          onSubmit={submit}
          className="grid-form"
        >
          {/* DATE & TIME */}

          <label>
            Date &amp; Time

            <input
              type="datetime-local"
              value={inspectionDate}
              onChange={(e) =>
                setInspectionDate(e.target.value)
              }
              required
            />
          </label>

          {/* GAS TYPE */}

          <label>
            Gas Type

            <select
              value={gas}
              onChange={(e) =>
                setGas(e.target.value as GasType)
              }
            >
              <option value="CO₂">
                CO₂
              </option>

              <option value="Argon">
                Argon
              </option>
            </select>
          </label>

          {/* IN KGS */}

          <label>
            In Quantity (KGS)

            <input
              type="number"
              step="0.01"
              min="0"
              value={kgs}
              onChange={(e) =>
                setKgs(e.target.value)
              }
              placeholder="0 jika tidak refill"
            />
          </label>

          {/* PRESSURE UNIT */}

          <label>
            Pressure Unit

            <select
              value={unit}
              onChange={(e) =>
                setUnit(e.target.value)
              }
              disabled={!kgs || Number(kgs) <= 0}
            >
              {units.map((u) => (
                <option
                  key={u}
                  value={u}
                >
                  {u}
                </option>
              ))}
            </select>
          </label>

          {/* PRESSURE */}

          <label>
            Pressure

            <input
              type="number"
              step="0.001"
              min="0"
              value={pressure}
              onChange={(e) =>
                setPressure(e.target.value)
              }
              required
            />
          </label>

          {/* CHECKED BY */}

          <label>
            Checked By

            <input
              type="text"
              value={checkedBy}
              onChange={(e) =>
                setCheckedBy(e.target.value)
              }
              required
            />
          </label>

          {/* REMARKS */}

          <label className="wide">
            Remarks / Abnormality

            <textarea
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value)
              }
              rows={4}
            />
          </label>

          {/* PHOTO */}

          <label className="wide">
            Photo Evidence

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setPhotos(
                  Array.from(
                    e.target.files ?? [],
                  ),
                )
              }
            />

            <span className="muted">
              {photos.length > 0
                ? `${photos.length} foto dipilih.`
                : 'Opsional. Bisa memilih beberapa foto.'}
            </span>
          </label>

          {/* ACTION */}

          <div className="wide actions">
            <button
              type="button"
              className="secondary"
              onClick={clearForm}
              disabled={busy}
            >
              Clear Form
            </button>

            <button
              type="submit"
              className="primary"
              disabled={busy}
            >
              {busy
                ? 'Menyimpan...'
                : 'Save Inspection'}
            </button>
          </div>

          {/* SUCCESS */}

          {msg && (
            <div className="wide success-message">
              {msg}
            </div>
          )}

          {/* ERROR */}

          {error && (
            <div className="wide error">
              {error}
            </div>
          )}
        </form>
      </section>

      {/* RECORDS */}

      <section className="panel">
        <h3>Inspection Records</h3>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Gas</th>
                <th>In (KGS)</th>
                <th>Pressure</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Checked By</th>
                <th>Remarks</th>
                <th>Photo</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Date(
                      r.inspection_date,
                    ).toLocaleString('id-ID')}
                  </td>

                  <td>
                    {r.gas_type}
                  </td>

                  <td>
                    {r.in_kgs ?? 0}
                  </td>

                  <td>
                    {r.pressure}
                  </td>

                  <td>
                    {r.pressure_unit}
                  </td>

                  <td>
                    <span
                      className={`status ${r.status.toLowerCase()}`}
                    >
                      {r.status}
                    </span>
                  </td>

                  <td>
                    {r.inspector_name}
                  </td>

                  <td>
                    {r.notes || '—'}
                  </td>

                  <td>
                    {photoCounts[r.id]
                      ? photoCounts[r.id]
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="empty">
              Belum ada data inspection.
            </div>
          )}
        </div>
      </section>
    </>
  )
}