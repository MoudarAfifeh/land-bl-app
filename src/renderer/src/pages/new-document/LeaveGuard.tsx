import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

/**
 * Asks before leaving the page while `when` is true: in-app navigation shows this dialog;
 * closing or reloading the window is confirmed by main (will-prevent-unload).
 */
export function LeaveGuard({ when }: { when: boolean }): React.JSX.Element {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  return (
    // Buttons call reset/proceed directly: an onOpenChange handler would also run after
    // "proceed" and cancel the navigation.
    <AlertDialog open={blocker.state === 'blocked'}>
      <AlertDialogContent onEscapeKeyDown={() => blocker.reset?.()}>
        <AlertDialogHeader>
          <AlertDialogTitle>تغييرات غير محفوظة</AlertDialogTitle>
          <AlertDialogDescription>
            لم يتم حفظ هذه الوثيقة بعد. إذا خرجت الآن ستفقد البيانات المدخلة.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>البقاء في الصفحة</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => blocker.proceed?.()}
          >
            الخروج دون حفظ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
