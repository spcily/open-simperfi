import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const SPA_REDIRECT_KEY = '__opensimperfi_redirect'
const redirectPath = typeof window !== 'undefined' ? sessionStorage.getItem(SPA_REDIRECT_KEY) : null
if (redirectPath) {
  sessionStorage.removeItem(SPA_REDIRECT_KEY)
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  const parsed = new URL(path, window.location.origin)
  window.history.replaceState(null, '', parsed.pathname + parsed.search + parsed.hash)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
