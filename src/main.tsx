import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AccidentReportPage from './AccidentReportPage.tsx'

const isAccidentReportRoute = /^\/report\/?$/.test(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAccidentReportRoute ? <AccidentReportPage /> : <App />}
  </StrictMode>,
)
