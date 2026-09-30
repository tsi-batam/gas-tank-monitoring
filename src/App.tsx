import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inspection from './pages/Inspection'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Export from './pages/Export'

export default function App() {
  const { session, loading, profile } = useAuth()

  const [page, setPage] = useState('Dashboard')

  if (loading) {
    return (
      <div className="loading">
        Loading...
      </div>
    )
  }

  if (!session || !profile) {
    return <Login />
  }

  return (
    <Layout
      page={page}
      setPage={setPage}
    >
      {page === 'Dashboard' && (
        <Dashboard />
      )}

      {page === 'Inspection' && (
        <Inspection />
      )}

      {page === 'Limit' &&
        profile.role === 'admin' && (
          <Settings />
        )}

      {page === 'Users' &&
        profile.role === 'admin' && (
          <Users />
        )}

      {page === 'Export' && (
        <Export />
      )}
    </Layout>
  )
}