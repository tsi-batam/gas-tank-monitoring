import { useState } from 'react'
import { exportInspectionExcel } from '../services/export'

export default function Export() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleExport = async () => {
    setBusy(true)
    setMessage('')
    setError('')

    try {
      await exportInspectionExcel()

      setMessage(
        'Excel berhasil dibuat dan sudah di-download.',
      )
    } catch (err) {
      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Gagal membuat file Excel.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h2>Export Excel</h2>
          <p>
            Export data inspection Gas Tank Monitoring
            System.
          </p>
        </div>
      </div>

      <section className="panel">
        <h3>Export Inspection Data</h3>

        <p className="muted">
          File Excel berisi Summary, data CO₂, dan
          data Argon.
        </p>

        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => void handleExport()}
            disabled={busy}
          >
            {busy
              ? 'Membuat Excel...'
              : 'Export Excel'}
          </button>
        </div>

        {message && (
          <p className="muted">
            {message}
          </p>
        )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}
      </section>
    </>
  )
}