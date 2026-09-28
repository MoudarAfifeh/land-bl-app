import { createHashRouter } from 'react-router'
import HomePage from '@/pages/HomePage'
import NewDocumentPage from '@/pages/NewDocumentPage'
import DocumentPage from '@/pages/DocumentPage'
import HistoryPage from '@/pages/HistoryPage'
import SettingsPage from '@/pages/SettingsPage'
import PrintPage from '@/pages/PrintPage'
import { AppLayout } from '@/components/DeveloperCredit'

// Hash routing: the packaged app loads index.html from disk, where path-based URLs don't resolve.
// A data router (not <HashRouter>) so pages can block navigation with unsaved changes.
// Every screen has the developer credit (AppLayout); the print route doesn't: it is what gets
// printed and saved as PDF.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/new', element: <NewDocumentPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/documents/:id', element: <DocumentPage /> },
      { path: '/settings', element: <SettingsPage /> }
    ]
  },
  { path: '/print/:id', element: <PrintPage /> }
])
