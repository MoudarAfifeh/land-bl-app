import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import type { LicenseStatus } from '@shared/api'
import { router } from './App'
import ActivationPage from './pages/ActivationPage'
import { AppLayout } from './components/DeveloperCredit'

const unreadable: LicenseStatus = {
  active: false,
  error: 'LICENSE_REQUIRED',
  machineCode: null,
  customerName: null,
  issuedAt: null,
  expiresAt: null,
  daysLeft: null
}

/**
 * Without a valid license only the activation screen exists: the router (every other page) is
 * not mounted. Main enforces the same rule on every IPC call.
 */
function Root(): React.JSX.Element | null {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    window.api.license.status().then(setStatus, () => setStatus(unreadable))
  }, [])

  if (!status) return null
  if (!status.active)
    return (
      <AppLayout>
        <ActivationPage
          status={status}
          onActivated={(next) => {
            // Start the app from the home page (main has opened the database).
            void router.navigate('/', { replace: true })
            setStatus(next)
          }}
        />
      </AppLayout>
    )
  return <RouterProvider router={router} />
}

export default Root
