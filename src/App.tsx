import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import AccountsPage from '@/pages/AccountsPage'
import TransactionsPage from '@/pages/TransactionsPage'
import SettingsPage from '@/pages/SettingsPage'
import Layout from '@/components/layout/Layout'
import { ThemeProvider } from '@/components/theme-provider'
import { initDB } from '@/lib/db'
import { ensureDailySnapshot } from '@/lib/snapshot-service'

function App() {
  useEffect(() => {
    const setup = async () => {
      await initDB();
      await ensureDailySnapshot();
    };
    setup();
  }, []);

  const basename = import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <ThemeProvider defaultTheme="system" storageKey="simperfi-ui-theme">
      <Router basename={basename}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/wallets" element={<Navigate to="/accounts" replace />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  )
}

export default App
