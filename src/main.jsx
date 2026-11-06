import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { lazyPage } from './lazyPage'

// /overlay/* are OBS browser sources: no site layout, transparent page
const OverlayPage = lazyPage(() => import('./overlays/OverlayPage'))
const isOverlay = window.location.pathname.startsWith('/overlay/')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isOverlay ? (
      <Suspense fallback={null}>
        <OverlayPage />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
