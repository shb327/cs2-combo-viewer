// First: the embed's listener, so no early message from the parent page is lost.
import '@/lib/embed/early-messages'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DbProvider } from '@/context/db-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppRoutes } from '@/routes'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <DbProvider>
          <AppRoutes />
        </DbProvider>
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
)
