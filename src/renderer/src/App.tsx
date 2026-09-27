import { createHashRouter } from 'react-router'
import HomePage from '@/pages/HomePage'
import NewDocumentPage from '@/pages/NewDocumentPage'
import HistoryPage from '@/pages/HistoryPage'
import SettingsPage from '@/pages/SettingsPage'

// Hash routing: the packaged app loads index.html from disk, where path-based URLs don't resolve.
// A data router (not <HashRouter>) so pages can block navigation with unsaved changes.
export const router = createHashRouter([
  { path: '/', element: <HomePage /> },
  { path: '/new', element: <NewDocumentPage /> },
  { path: '/history', element: <HistoryPage /> },
  { path: '/settings', element: <SettingsPage /> }
])
