import { useEffect, useState } from 'react'
import { getSettings } from '../services/inspection'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { GasSetting } from '../types'

type SaveState = 'idle' | 'saving' | 'success' | 'error'

interface RowState {
  state: SaveState
  message: string
}

export default function Settings() {
  const { profile } = useAuth()

  const [rows, setRows] = useState<GasSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})

  const loadSettings = async () => {
    setLoading(true)
    setPageError('')

    try {
      const data = await getSettings()
      setRows(data)
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Gagal mengambil data Gas Settings.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const updateValue = (
    id: string,
    field: 'refill_threshold' | 'critical_threshold',
    value: string,
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                value.trim() === '' ? null : Number(value),
            }
          : row,
      ),
    )

    setRowStates((current) => ({
      ...current,
      [id]: {
        state: 'idle',
        message: '',
      },
    }))
  }

  const save = async (row: GasSetting) => {
    if (!profile) {
      setRowStates((current) => ({
        ...current,
        [row.id]: {
          state: 'error',
          message: 'User belum terautentikasi.',
        },
      }))
      return
    }

    if (profile.role !== 'admin') {
      setRowStates((current) => ({
        ...current,
        [row.id]: {
          state: 'error',
          message: 'Hanya Admin yang dapat mengubah settings.',
        },
      }))
      return
    }

    setRowStates((current) => ({
      ...current,
      [row.id]: {
        state: 'saving',
        message: 'Menyimpan...',
      },
    }))

    try {
      if (
        row.refill_threshold !== null &&
        !Number.isFinite(row.refill_threshold)
      ) {
        throw new Error('Refill Threshold harus berupa angka.')
      }

      if (
        row.critical_threshold !== null &&
        !Number.isFinite(row.critical_threshold)
      ) {
        throw new Error('Critical Threshold harus berupa angka.')
      }

      if (
        row.refill_threshold !== null &&
        row.critical_threshold !== null &&
        row.critical_threshold > row.refill_threshold
      ) {
        throw new Error(
          'Critical Threshold tidak boleh lebih besar dari Refill Threshold.',
        )
      }

      const { error } = await supabase
        .from('gas_settings')
        .update({
          refill_threshold: row.refill_threshold,
          critical_threshold: row.critical_threshold,
          updated_by: profile.id,
        })
        .eq('id', row.id)

      if (error) {
        throw error
      }

      const { data, error: readError } = await supabase
        .from('gas_settings')
        .select('*')
        .eq('id', row.id)
        .single()

      if (readError) {
        throw readError
      }

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? (data as GasSetting)
            : item,
        ),
      )

      setRowStates((current) => ({
        ...current,
        [row.id]: {
          state: 'success',
          message: 'Settings berhasil disimpan.',
        },
      }))
    } catch (error) {
      console.error('Gas Settings Save Error:', error)

      let message = 'Gagal menyimpan settings.'

      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error
      ) {
        const err = error as {
          message?: string
          details?: string
          hint?: string
          code?: string
        }

        message = [
          err.message,
          err.details,
          err.hint,
          err.code ? `Code: ${err.code}` : '',
        ]
          .filter(Boolean)
          .join(' | ')
      } else if (error instanceof Error) {
        message = error.message
      }

      setRowStates((current) => ({
        ...current,
        [row.id]: {
          state: 'error',
          message,
        },
      }))
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h2>Gas Settings</h2>
          <p>
            Threshold operasional. Isi sesuai nilai resmi perusahaan.
          </p>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={() => void loadSettings()}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {pageError && (
        <div className="error">
          {pageError}
        </div>
      )}

      <section className="panel">
        {loading ? (
          <div className="empty">
            Memuat Gas Settings...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gas</th>
                  <th>Unit</th>
                  <th>Refill Threshold</th>
                  <th>Critical Threshold</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const state = rowStates[row.id] ?? {
                    state: 'idle' as SaveState,
                    message: '',
                  }

                  return (
                    <tr key={row.id}>
                      <td>{row.gas_type}</td>

                      <td>{row.pressure_unit}</td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={row.refill_threshold ?? ''}
                          onChange={(e) =>
                            updateValue(
                              row.id,
                              'refill_threshold',
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={row.critical_threshold ?? ''}
                          onChange={(e) =>
                            updateValue(
                              row.id,
                              'critical_threshold',
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="secondary"
                          disabled={state.state === 'saving'}
                          onClick={() => void save(row)}
                        >
                          {state.state === 'saving'
                            ? 'Saving...'
                            : 'Save'}
                        </button>

                        {state.message && (
                          <div
                            style={{
                              marginTop: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color:
                                state.state === 'success'
                                  ? '#15803d'
                                  : state.state === 'error'
                                    ? '#b42318'
                                    : '#64748b',
                            }}
                          >
                            {state.message}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}