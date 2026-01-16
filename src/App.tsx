import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import WalletsPage from '@/pages/WalletsPage'
import TransactionsPage from '@/pages/TransactionsPage'
import SettingsPage from '@/pages/SettingsPage'
import Layout from '@/components/layout/Layout'
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

  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
