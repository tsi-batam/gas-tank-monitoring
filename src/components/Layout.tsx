import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/1.jpg'
import tspLogo from '../assets/2.png'

export default function Layout({
  page,
  setPage,
  children,
}: {
  page: string
  setPage: (p: string) => void
  children: ReactNode
}) {
  const { profile, logout } = useAuth()

  // =========================================================
  // MENU BERDASARKAN ROLE
  // =========================================================

  const items: string[] = ['Dashboard']

  // Admin dan Operator
  if (
    profile?.role === 'admin' ||
    profile?.role === 'operator'
  ) {
    items.push('Inspection')
  }

  // Semua role
  items.push('Export')

  // Admin saja
  if (profile?.role === 'admin') {
    items.push('Limit', 'Users')
  }

  return (
    <div className="app-shell">

      {/* =====================================================
          SIDEBAR
          ===================================================== */}
      <aside>

        {/* BRAND SIDEBAR */}
        <div className="side-brand">
          <img
            src={logo}
            alt="PT TSI Smart Product"
            className="side-logo"
          />

          <div>
            <strong>TSI SMART</strong>
            <small>Gas Monitoring</small>
          </div>
        </div>

        {/* MENU */}
        <nav>
          {items.map((item) => (
            <button
              key={item}
              type="button"
              className={
                page === item
                  ? 'active'
                  : ''
              }
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        {/* LOGOUT */}
        <button
          type="button"
          className="logout"
          onClick={logout}
        >
          Logout
        </button>

      </aside>


      {/* =====================================================
          MAIN CONTENT
          ===================================================== */}
      <section className="content">

        {/* ===================================================
            HEADER
            =================================================== */}
        <header>

          {/* TSP LOGO */}
          <div className="header-brand">
            <img
              src={tspLogo}
              alt="TSI Smart Products"
              className="tsp-header-logo"
            />
          </div>


          {/* USER INFORMATION */}
          <div className="user-chip">
            <strong>
              {profile?.full_name}
            </strong>

            <small>
              {profile?.role}
            </small>
          </div>

        </header>


        {/* ===================================================
            PAGE CONTENT
            =================================================== */}
        <div className="page">
          {children}
        </div>


        <footer className="app-copyright">
          © 2026 Santonius
        </footer>
        
      </section>
          
    </div>
  )
}

