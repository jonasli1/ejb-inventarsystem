import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getCachedTheme } from './lib/theme'

// Apply the last-known theme synchronously before the first paint, so a
// dark-mode user doesn't see a flash of the light theme while /auth/me
// (the authoritative, per-user value) is still in flight.
applyTheme(getCachedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
