import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

/* ============================================================
   TYPE
   ============================================================ */

type MonitoringItem = {
  gas_type: string
  pressure: number
  pressure_unit: string
  status: string
  gauge_percent: number
}


/* ============================================================
   FORMAT PRESSURE
   ============================================================ */

function formatPressure(value: number) {
  if (!Number.isFinite(value)) {
    return '-'
  }

  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(1).replace(/\.0$/, '')
}


/* ============================================================
   STATUS
   ============================================================ */

function getStatusClass(status: string) {
  const value = status.toLowerCase()

  switch (value) {
    case 'normal':
      return 'normal'

    case 'refill':
      return 'refill'

    case 'critical':
      return 'critical'

    default:
      return 'unset'
  }
}


function getStatusLabel(status: string) {
  const value = status.toLowerCase()

  switch (value) {
    case 'normal':
      return 'NORMAL'

    case 'refill':
      return 'REFILL REQUIRED'

    case 'critical':
      return 'CRITICAL'

    default:
      return 'UNSET'
  }
}


/* ============================================================
   GAUGE COLOR
   ============================================================ */

function getGaugeColor(status: string) {
  const value = status.toLowerCase()

  switch (value) {
    case 'normal':
      return '#22c55e'

    case 'refill':
      return '#f59e0b'

    case 'critical':
      return '#ef4444'

    default:
      return '#94a3b8'
  }
}


/* ============================================================
   GAUGE
   ============================================================ */

function MonitoringGauge({
  percent,
  status,
}: {
  percent: number
  status: string
}) {
  const safePercent = Math.min(
    Math.max(Number(percent) || 0, 0),
    100
  )

  const radius = 78

  const circumference = Math.PI * radius

  const dashOffset =
    circumference -
    (safePercent / 100) * circumference

  const color = getGaugeColor(status)

  return (
    <div className="login-3d-gauge">

      <svg
        viewBox="0 0 200 120"
        className="login-3d-gauge-svg"
        aria-hidden="true"
      >

        {/* Gauge background */}

        <path
          d="M 22 100 A 78 78 0 0 1 178 100"
          fill="none"
          stroke="#dce5ed"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Gauge progress */}

        <path
          d="M 22 100 A 78 78 0 0 1 178 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="login-gauge-progress"
        />

      </svg>


      {/* Gauge center */}

      <div className="login-gauge-center">

        <strong>
          {Math.round(safePercent)}%
        </strong>

        <span>
          CURRENT PRESSURE
        </span>

      </div>

    </div>
  )
}


/* ============================================================
   MONITORING CARD
   ============================================================ */

function MonitoringCard({
  item,
}: {
  item: MonitoringItem
}) {
  const statusClass =
    getStatusClass(item.status)

  return (
    <article
      className={`login-3d-monitor-card ${statusClass}`}
    >

      {/* Decorative light */}

      <div className="monitor-card-shine" />


      {/* Card header */}

      <div className="monitor-card-header">

        <div>

          <span className="monitor-card-label">
            GAS MONITORING
          </span>

          <h3>
            {item.gas_type}
          </h3>

        </div>


        <span
          className={`monitor-status ${statusClass}`}
        >
          {getStatusLabel(item.status)}
        </span>

      </div>


      {/* Gauge */}

      <MonitoringGauge
        percent={item.gauge_percent}
        status={item.status}
      />


      {/* Pressure */}

      <div className="monitor-pressure">

        <strong>
          {formatPressure(
            Number(item.pressure)
          )}
        </strong>

        <span>
          {item.pressure_unit}
        </span>

      </div>

    </article>
  )
}


/* ============================================================
   EMPTY CARD
   ============================================================ */

function EmptyMonitoringCard({
  gas,
}: {
  gas: string
}) {
  return (
    <article
      className="login-3d-monitor-card empty"
    >

      <div className="monitor-card-header">

        <div>

          <span className="monitor-card-label">
            GAS MONITORING
          </span>

          <h3>
            {gas}
          </h3>

        </div>


        <span className="monitor-status unset">
          UNSET
        </span>

      </div>


      <div className="monitor-empty">
        <span>
          No monitoring data
        </span>
      </div>

    </article>
  )
}


/* ============================================================
   LOGIN PAGE
   ============================================================ */

export default function Login() {

  const { login } = useAuth()


  /* ==========================================================
     LOGIN STATE
     ========================================================== */

  const [u, setU] = useState('')
  const [p, setP] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)


  /* ==========================================================
     MONITORING STATE
     ========================================================== */

  const [monitoring, setMonitoring] =
    useState<MonitoringItem[]>([])

  const [monitoringLoading, setMonitoringLoading] =
    useState(true)

  const [monitoringError, setMonitoringError] =
    useState('')


  /* ==========================================================
     LOAD MONITORING DATA
     ========================================================== */

  const loadMonitoring = async () => {

    try {

      setMonitoringError('')


      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'get_login_monitoring'
      )


      if (rpcError) {
        throw rpcError
      }


      if (Array.isArray(data)) {

        setMonitoring(
          data as MonitoringItem[]
        )

      } else {

        setMonitoring([])

      }

    } catch (err) {

      console.error(
        'Login monitoring error:',
        err
      )

      setMonitoringError(
        'Monitoring data unavailable.'
      )

    } finally {

      setMonitoringLoading(false)

    }
  }


  /* ==========================================================
     INITIAL LOAD
     + AUTO REFRESH EVERY 30 SECONDS
     ========================================================== */

  useEffect(() => {

    loadMonitoring()


    const interval =
      window.setInterval(
        () => {
          loadMonitoring()
        },
        30000
      )


    return () => {
      window.clearInterval(interval)
    }

  }, [])


  /* ==========================================================
     LOGIN SUBMIT
     ========================================================== */

  const submit = async (
    e: FormEvent
  ) => {

    e.preventDefault()

    setError('')
    setBusy(true)


    try {

      /*
       * Authentication tidak diubah.
       * Tetap menggunakan login()
       * dari AuthContext.
       */

      await login(u, p)

    } catch (err) {

      setError(
        err instanceof Error
          ? err.message
          : 'Login gagal'
      )

    } finally {

      setBusy(false)

    }
  }


  /* ==========================================================
     GET GAS DATA
     ========================================================== */

  const co2 = monitoring.find(
    (item) =>
      item.gas_type === 'CO₂'
  )

  const argon = monitoring.find(
    (item) =>
      item.gas_type === 'Argon'
  )


  /* ============================================================
     UI
     ============================================================ */

  return (

    <main className="login-3d-page">

      {/* ======================================================
          BACKGROUND GRID
          ====================================================== */}

      <div className="login-3d-grid" />

      <div className="login-3d-glow glow-one" />

      <div className="login-3d-glow glow-two" />


      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <div className="login-3d-content">


        {/* ====================================================
            LOGIN PANEL
            ==================================================== */}

        <section className="login-3d-login-area">

          <div className="login-3d-login-card">

            <div className="login-card-glow" />


            <div className="login-card-content">


              {/* =================================================
                  BRAND
                  ================================================= */}

              <div className="login-card-eyebrow">
                TSI SMART PRODUCTS
              </div>


              {/* =================================================
                  TITLE
                  ================================================= */}

              <h1>

                Gas Tank

                <br />

                <span>
                  Monitoring System
                </span>

              </h1>


              {/* =================================================
                  DESCRIPTION
                  ================================================= */}

              <p className="login-card-description">

      

              </p>


              {/* =================================================
                  FORM
                  ================================================= */}

              <form
                className="login-3d-form"
                onSubmit={submit}
              >


                {/* =================================================
                    USERNAME
                    ================================================= */}

                <label>

                  <span>
                    Username
                  </span>


                  <div className="login-input-wrap">

                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >

                      <path
                        d="M20 21a8 8 0 0 0-16 0"
                      />

                      <circle
                        cx="12"
                        cy="7"
                        r="4"
                      />

                    </svg>


                    <input
                      value={u}
                      onChange={(e) =>
                        setU(e.target.value)
                      }
                      placeholder="Username"
                      autoComplete="username"
                      required
                    />

                  </div>

                </label>


                {/* =================================================
                    PASSWORD
                    ================================================= */}

                <label>

                  <span>
                    Password
                  </span>


                  <div className="login-input-wrap">

                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >

                      <rect
                        x="4"
                        y="10"
                        width="16"
                        height="11"
                        rx="2"
                      />

                      <path
                        d="M8 10V7a4 4 0 0 1 8 0v3"
                      />

                    </svg>


                    <input
                      value={p}
                      onChange={(e) =>
                        setP(e.target.value)
                      }
                      type="password"
                      placeholder="Password"
                      autoComplete="current-password"
                      required
                    />

                  </div>

                </label>


                {/* =================================================
                    LOGIN ERROR
                    ================================================= */}

                {error && (

                  <div className="login-error">
                    {error}
                  </div>

                )}


                {/* =================================================
                    LOGIN BUTTON
                    ================================================= */}

                <button
                  type="submit"
                  className="login-3d-button"
                  disabled={busy}
                >

                  <span>
                    {busy
                      ? 'Memproses...'
                      : 'Login'}
                  </span>


                  {!busy && (

                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >

                      <path
                        d="M5 12h14"
                      />

                      <path
                        d="m13 6 6 6-6 6"
                      />

                    </svg>

                  )}

                </button>

              </form>


              {/* =================================================
                  SECURITY
                  ================================================= */}

              <div className="login-secure">

                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >

                  <path
                    d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"
                  />

                  <path
                    d="m9 12 2 2 4-4"
                  />

                </svg>


                <div>

                  <strong>
                    Secure Company Portal
                  </strong>

                  <span>
                    Authorized access only
                  </span>

                </div>

              </div>

            </div>

          </div>

        </section>


        {/* ====================================================
            GAS MONITORING
            ==================================================== */}

        <section className="login-3d-monitor-area">

          <div className="login-monitor-cards">


            {/* =================================================
                LOADING
                ================================================= */}

            {monitoringLoading && (

              <>

                <div
                  className="login-monitor-loading-card"
                />

                <div
                  className="login-monitor-loading-card"
                />

              </>

            )}


            {/* =================================================
                ERROR
                ================================================= */}

            {!monitoringLoading &&
              monitoringError && (

                <div
                  className="login-monitor-error"
                >
                  {monitoringError}
                </div>

              )}


            {/* =================================================
                ACTUAL DATA
                ================================================= */}

            {!monitoringLoading &&
              !monitoringError && (

                <>

                  {co2 ? (

                    <MonitoringCard
                      item={co2}
                    />

                  ) : (

                    <EmptyMonitoringCard
                      gas="CO₂"
                    />

                  )}


                  {argon ? (

                    <MonitoringCard
                      item={argon}
                    />

                  ) : (

                    <EmptyMonitoringCard
                      gas="Argon"
                    />

                  )}

                </>

              )}

          </div>

        </section>

      </div>


      {/* ======================================================
          SIMPLE FOOTER
          ====================================================== */}

      <footer className="login-3d-footer">

        <span>
          TSI SMART PRODUCTS
        </span>

        <span className="footer-separator">
          |
        </span>

        <span>
          Gas Tank Monitoring System
        </span>

      </footer>

    </main>
  )
}