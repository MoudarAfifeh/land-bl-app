import { Outlet } from 'react-router'
import { DEVELOPER } from '@/lib/developer'

/** The developer credit. The print route sits outside AppLayout, so it is never printed. */
export function CreditFooter(): React.JSX.Element {
  return (
    <footer
      data-testid="developer-credit"
      className="py-3 text-center text-xs text-muted-foreground"
    >
      تم التطوير بواسطة <bdi>{DEVELOPER.name}</bdi>
    </footer>
  )
}

/**
 * Page, then the credit in normal flow: at the bottom of the window on short pages, after the
 * content on long ones. Never fixed, so it can't cover anything.
 */
export function AppLayout({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children ?? <Outlet />}</div>
      <CreditFooter />
    </div>
  )
}
