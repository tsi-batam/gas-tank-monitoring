import { useEffect, useMemo, useState } from 'react'
import {
  deleteInspection,
  getInspectionPhotos,
  getInspections,
  getSettings,
} from '../services/inspection'
import { createPhotoUrl } from '../services/storage'
import { useAuth } from '../contexts/AuthContext'
import type {
  GasSetting,
  Inspection,
  GasType,
} from '../types'

type DashboardStatus =
  | 'CRITICAL'
  | 'REFILL REQUIRED'
  | 'SAFE / NORMAL'
  | 'NOT CONFIGURED'

const GAS_TYPES: GasType[] = ['CO₂', 'Argon']

function getDashboardStatus(
  inspection?: Inspection,
): DashboardStatus {
  if (!inspection) {
    return 'NOT CONFIGURED'
  }

  switch (inspection.status) {
    case 'Critical':
      return 'CRITICAL'

    case 'Refill':
      return 'REFILL REQUIRED'

    case 'Normal':
      return 'SAFE / NORMAL'

    default:
      return 'NOT CONFIGURED'
  }
}

function getStatusClass(status: DashboardStatus) {
  switch (status) {
    case 'CRITICAL':
      return 'critical'

    case 'REFILL REQUIRED':
      return 'refill'

    case 'SAFE / NORMAL':
      return 'normal'

    default:
      return 'unset'
  }
}

function formatDate(value?: string) {
  if (!value) return '—'

  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—'
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 3,
  }).format(value)
}

function Gauge({
  pressure,
  setting,
}: {
  pressure: number | null
  setting?: GasSetting
}) {
  const critical = setting?.critical_threshold ?? null
  const refill = setting?.refill_threshold ?? null

  const value = pressure ?? 0

  /*
   * Skala gauge dibuat dinamis.
   * Tujuannya agar angka pressure tetap terlihat
   * meskipun threshold belum dikonfigurasi.
   */
  const max = useMemo(() => {
    const candidates = [
      value,
      critical ?? 0,
      refill ?? 0,
    ]

    const highest = Math.max(...candidates)

    if (highest <= 0) {
      return 100
    }

    return Math.max(highest * 1.25, 100)
  }, [value, critical, refill])

  const valueRatio = Math.min(Math.max(value / max, 0), 1)

  const criticalRatio =
    critical !== null
      ? Math.min(Math.max(critical / max, 0), 1)
      : 0

  const refillRatio =
    refill !== null
      ? Math.min(Math.max(refill / max, 0), 1)
      : 0

  /*
   * Half circle menggunakan path:
   * kiri bawah -> atas -> kanan bawah
   */
  const radius = 90
  const circumference = Math.PI * radius

  const criticalLength =
    circumference * criticalRatio

  const warningLength =
    circumference * Math.max(refillRatio - criticalRatio, 0)

  const normalLength =
    circumference * Math.max(1 - refillRatio, 0)

  const needleAngle = -90 + valueRatio * 180

  return (
    <div className="dashboard-gauge-wrap">
      <div className="dashboard-gauge">
        <svg
          viewBox="0 0 220 130"
          aria-label="Pressure gauge"
        >
          {/* Base */}
          <path
            d="M 20 110 A 90 90 0 0 1 200 110"
            fill="none"
            stroke="#e9edf1"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Critical */}
          {critical !== null && criticalLength > 0 && (
            <path
              d="M 20 110 A 90 90 0 0 1 200 110"
              fill="none"
              stroke="#ef4444"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${criticalLength} ${circumference}`}
            />
          )}

          {/* Warning */}
          {refill !== null && warningLength > 0 && (
            <path
              d="M 20 110 A 90 90 0 0 1 200 110"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${warningLength} ${circumference}`}
              strokeDashoffset={-criticalLength}
            />
          )}

          {/* Normal */}
          {refill !== null && normalLength > 0 && (
            <path
              d="M 20 110 A 90 90 0 0 1 200 110"
              fill="none"
              stroke="#22c55e"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${normalLength} ${circumference}`}
              strokeDashoffset={
                -(criticalLength + warningLength)
              }
            />
          )}

          {/* Jika threshold belum dikonfigurasi */}
          {critical === null && refill === null && (
            <path
              d="M 20 110 A 90 90 0 0 1 200 110"
              fill="none"
              stroke="#d1d5db"
              strokeWidth="18"
              strokeLinecap="round"
            />
          )}

          {/* Needle */}
          {pressure !== null && (
            <g
              transform={`rotate(${needleAngle} 110 110)`}
            >
              <line
                x1="110"
                y1="110"
                x2="110"
                y2="39"
                stroke="#172033"
                strokeWidth="3"
                strokeLinecap="round"
              />

              <circle
                cx="110"
                cy="110"
                r="7"
                fill="#172033"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Threshold markers */}
          {critical !== null && (
            <circle
              cx={110 - 90 * Math.cos(Math.PI * criticalRatio)}
              cy={110 - 90 * Math.sin(Math.PI * criticalRatio)}
              r="3"
              fill="#ef4444"
            />
          )}

          {refill !== null && (
            <circle
              cx={110 - 90 * Math.cos(Math.PI * refillRatio)}
              cy={110 - 90 * Math.sin(Math.PI * refillRatio)}
              r="3"
              fill="#f59e0b"
            />
          )}
        </svg>

        <div className="dashboard-gauge-value">
          {pressure === null
            ? '—'
            : formatNumber(pressure)}
        </div>

        <div className="dashboard-gauge-unit">
          {pressure === null
            ? 'NO DATA'
            : setting?.pressure_unit ?? ''}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()

  const [rows, setRows] = useState<Inspection[]>([])
  const [settings, setSettings] = useState<GasSetting[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({})
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = async () => {
    try {
      setError('')

      const [
        inspectionRows,
        settingRows,
      ] = await Promise.all([
        getInspections(),
        getSettings(),
      ])

      setRows(inspectionRows)
      setSettings(settingRows)

      if (inspectionRows.length > 0) {
        const photos = await getInspectionPhotos(
          inspectionRows.map((row) => row.id),
        )

        const counts: Record<string, number> = {}
        const urls: Record<string, string[]> = {}

        for (const photo of photos) {
          counts[photo.inspection_id] =
            (counts[photo.inspection_id] ?? 0) + 1
        }

        await Promise.all(
          photos.map(async (photo) => {
            try {
              const signedUrl = await createPhotoUrl(
                photo.storage_path,
              )

              if (!urls[photo.inspection_id]) {
                urls[photo.inspection_id] = []
              }

              urls[photo.inspection_id].push(signedUrl)
            } catch (photoError) {
              console.error(
                `Gagal membuat URL foto ${photo.storage_path}:`,
                photoError,
              )
            }
          }),
        )

        setPhotoCounts(counts)
        setPhotoUrls(urls)
      } else {
        setPhotoCounts({})
        setPhotoUrls({})
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.trim()
      ) {
        setError(err.message)
      } else {
        setError(
          'Gagal membaca data dashboard.',
        )
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const latestByGas = (gas: GasType) => {
    return rows.find(
      (row) => row.gas_type === gas,
    )
  }

  const getSetting = (
    gas: GasType,
    unit?: string,
  ) => {
    if (!unit) return undefined

    return settings.find(
      (setting) =>
        setting.gas_type === gas &&
        setting.pressure_unit === unit,
    )
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadDashboard()
  }

  const handleDelete = async (
    inspection: Inspection,
  ) => {
    if (profile?.role !== 'admin') {
      setError(
        'Hanya Admin yang dapat menghapus inspection.',
      )
      return
    }

    const confirmed = window.confirm(
      `Hapus inspection ${inspection.gas_type} tanggal ${formatDate(
        inspection.inspection_date,
      )}?`,
    )

    if (!confirmed) return

    try {
      setError('')

      await deleteInspection(
        inspection.id,
      )

      await loadDashboard()
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.trim()
      ) {
        setError(err.message)
      } else {
        setError(
          'Gagal menghapus inspection.',
        )
      }
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          Memuat dashboard...
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">

      {/* HEADER */}

      <div className="dashboard-title-row">
        <div>
          <h2>Gas Tank Monitoring System</h2>

          <p>
            Ringkasan kondisi gas tank terbaru.
          </p>
        </div>

        <div className="dashboard-record-count">
          {rows.length} inspection record
          {rows.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="dashboard-error">
          {error}
        </div>
      )}

      {/* GAS CARDS */}

      <div className="dashboard-gas-grid">

        {GAS_TYPES.map((gas) => {
          const inspection =
            latestByGas(gas)

          const setting = getSetting(
            gas,
            inspection?.pressure_unit,
          )

          const status =
            getDashboardStatus(
              inspection,
            )

          const statusClass =
            getStatusClass(status)

          const cardClass =
            statusClass === 'normal'
              ? 'normal-card'
              : statusClass === 'refill'
                ? 'refill-card'
                : statusClass === 'critical'
                  ? 'critical-card'
                  : 'unset-card'

          return (
            <div
              key={gas}
              className={`dashboard-gas-card ${cardClass}`}
            >

              {/* GAS HEADER */}

              <div className="dashboard-gas-header">
                <h3>{gas}</h3>

                <span
                  className={`dashboard-status ${statusClass}`}
                >
                  {status}
                </span>
              </div>

              {inspection ? (
                <>
                  <div className="dashboard-muted">
                    Current Pressure
                  </div>

                  <Gauge
                    pressure={
                      inspection.pressure
                    }
                    setting={setting}
                  />

                  <div className="dashboard-main-pressure">
                    {formatNumber(
                      inspection.pressure,
                    )}

                    <span>
                      {inspection.pressure_unit}
                    </span>
                  </div>

                  {/* LEGEND */}

                  <div className="dashboard-gauge-legend">
                    <span>
                      <i className="legend-dot low" />
                      Critical
                    </span>

                    <span>
                      <i className="legend-dot warning" />
                      Refill
                    </span>

                    <span>
                      <i className="legend-dot normal" />
                      Normal
                    </span>
                  </div>

                  {/* INFORMATION */}

                  <div className="dashboard-info-grid">

                    <div>
                      <span>
                        In Quantity
                      </span>

                      <strong>
                        {inspection.in_kgs ===
                        null
                          ? '0 KGS'
                          : `${formatNumber(
                              inspection.in_kgs,
                            )} KGS`}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Checked By
                      </span>

                      <strong>
                        {inspection.inspector_name ||
                          '—'}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Date / Time
                      </span>

                      <strong>
                        {formatDate(
                          inspection.inspection_date,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Photo Evidence
                      </span>

                      <strong>
                        {photoCounts[
                          inspection.id
                        ] ?? 0}{' '}
                        foto
                      </strong>
                    </div>

                  </div>

                  {/* THRESHOLD */}

                  <div className="dashboard-thresholds">

                    <div>
                      <span>
                        Refill Threshold
                      </span>

                      <strong>
                        {setting?.refill_threshold ===
                        null ||
                        setting?.refill_threshold ===
                        undefined
                          ? 'Not configured'
                          : `${formatNumber(
                              setting.refill_threshold,
                            )} ${inspection.pressure_unit}`}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Critical Threshold
                      </span>

                      <strong>
                        {setting?.critical_threshold ===
                        null ||
                        setting?.critical_threshold ===
                        undefined
                          ? 'Not configured'
                          : `${formatNumber(
                              setting.critical_threshold,
                            )} ${inspection.pressure_unit}`}
                      </strong>
                    </div>

                  </div>

                  {/* REMARKS */}

                  {inspection.notes && (
                    <div className="dashboard-remarks">
                      <b>Remarks:</b>{' '}
                      {inspection.notes}
                    </div>
                  )}

                  {(photoUrls[inspection.id]?.length ?? 0) > 0 && (
                    <div className="dashboard-photo-section">
                      <span className="dashboard-photo-label">
                        Photo Evidence
                      </span>

                      <div className="dashboard-photo-list">
                        {photoUrls[inspection.id].map((url, index) => (
                          <button
                            key={`${inspection.id}-photo-${index}`}
                            type="button"
                            className="dashboard-photo-thumb-button"
                            onClick={() => setSelectedPhoto(url)}
                            aria-label={`Lihat foto evidence ${index + 1}`}
                          >
                            <img
                              src={url}
                              alt={`Photo evidence ${index + 1}`}
                              className="dashboard-photo-thumb"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </>
              ) : (
                <div className="dashboard-no-data">

                  <div className="dashboard-no-data-value">
                    —
                  </div>

                  <p>
                    Belum ada data inspection
                    untuk {gas}.
                  </p>

                </div>
              )}

            </div>
          )
        })}

      </div>

      {/* RECORDS */}

      <section className="dashboard-record-panel">

        <div className="dashboard-section-title">

          <div>
            <h3>
              Latest Inspection Records
            </h3>

            <p>
              Data pemeriksaan terbaru dari
              seluruh gas tank.
            </p>
          </div>

          <button
            type="button"
            className="secondary dashboard-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>

        </div>

        <div className="dashboard-table-wrap">

          <table className="dashboard-table">

            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Gas</th>
                <th>In (KGS)</th>
                <th>Pressure</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Checked By</th>
                <th>Remarks / Photo</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="dashboard-empty"
                  >
                    Belum ada data inspection.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {

                  const status =
                    getDashboardStatus(row)

                  const statusClass =
                    getStatusClass(status)

                  const photoCount =
                    photoCounts[row.id] ?? 0

                  return (
                    <tr key={row.id}>

                      <td>
                        {formatDate(
                          row.inspection_date,
                        )}
                      </td>

                      <td>
                        <strong>
                          {row.gas_type}
                        </strong>
                      </td>

                      <td>
                        {row.in_kgs === null
                          ? 0
                          : formatNumber(
                              row.in_kgs,
                            )}
                      </td>

                      <td>
                        {formatNumber(
                          row.pressure,
                        )}
                      </td>

                      <td>
                        {row.pressure_unit}
                      </td>

                      <td>
                        <span
                          className={`dashboard-status ${statusClass}`}
                        >
                          {status}
                        </span>
                      </td>

                      <td>
                        {row.inspector_name}
                      </td>

                      <td className="dashboard-remarks-cell">
                        <div>{row.notes || '—'}</div>

                        {photoCount > 0 && (
                          <div className="dashboard-table-photo-list">
                            {photoUrls[row.id]?.map((url, index) => (
                              <button
                                key={`${row.id}-table-photo-${index}`}
                                type="button"
                                className="dashboard-table-photo-button"
                                onClick={() => setSelectedPhoto(url)}
                                aria-label={`Lihat foto evidence ${index + 1}`}
                              >
                                <img
                                  src={url}
                                  alt={`Photo evidence ${index + 1}`}
                                  className="dashboard-table-photo"
                                  loading="lazy"
                                />
                              </button>
                            ))}
                            <span className="dashboard-photo-count">
                              📷 {photoCount}
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        {profile?.role ===
                        'admin' ? (
                          <button
                            type="button"
                            className="dashboard-delete-btn"
                            onClick={() =>
                              handleDelete(row)
                            }
                            disabled={refreshing}
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="dashboard-no-action">
                            —
                          </span>
                        )}
                      </td>

                    </tr>
                  )
                })
              )}

            </tbody>

          </table>

        </div>

      </section>

      {selectedPhoto && (
        <div
          className="dashboard-photo-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Photo evidence"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            className="dashboard-photo-modal-close"
            onClick={() => setSelectedPhoto(null)}
            aria-label="Tutup foto"
          >
            ×
          </button>

          <img
            src={selectedPhoto}
            alt="Photo evidence"
            className="dashboard-photo-modal-image"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

    </div>
  )
}