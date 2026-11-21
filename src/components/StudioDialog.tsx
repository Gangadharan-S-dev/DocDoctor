import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { BorderBeam } from './FuturisticPrimitives'

export interface StudioDialogProps {
  id?: string
  open: boolean
  closing?: boolean
  onClose: () => void
  /** Labelledby / aria-label for screen readers */
  labelledBy?: string
  describedBy?: string
  ariaLabel?: string
  /** Optional ref to focus on open; falls back to first focusable element */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Optional ref to restore focus to when closed */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Placement: centered modal, top command-palette, or fullscreen lightbox */
  placement?: 'center' | 'top' | 'fullscreen'
  /** Slide up as a bottom sheet on small mobile viewports (<480px) */
  mobileSheet?: boolean
  /** Max width utility class for the panel */
  panelClassName?: string
  /** Show top specular BorderBeam */
  beam?: boolean
  beamColor?: string
  /** Allow Toaster above dialog when #root is marked inert */
  inertRoot?: boolean
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Unified accessible Modal / Mobile BottomSheet primitive for DocDoctor.
 * Handles scroll locking with scrollbar compensation, Escape dismiss, Tab focus
 * trapping, safe backdrop press detection, and GPU-composited entrance/exit motion.
 */
export default function StudioDialog({
  id,
  open,
  closing = false,
  onClose,
  labelledBy,
  describedBy,
  ariaLabel,
  initialFocusRef,
  returnFocusRef,
  placement = 'center',
  mobileSheet = false,
  panelClassName = 'max-w-md',
  beam = true,
  beamColor,
  inertRoot = false,
  children,
}: StudioDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    if (!open) return
    const returnTo = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    const { body, documentElement } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

    const root = inertRoot ? document.getElementById('root') : null
    const prevInert = root?.inert ?? false
    if (root) root.inert = true

    const focusTimer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else {
        const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        first?.focus()
      }
    }, 10)

    return () => {
      window.clearTimeout(focusTimer)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      if (root) root.inert = prevInert
      returnTo?.focus?.({ preventScroll: true })
    }
  }, [open, initialFocusRef, returnFocusRef, inertRoot])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const outside = !panelRef.current.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const backdropLayout =
    placement === 'top'
      ? 'items-start justify-center px-4 pt-[10vh]'
      : placement === 'fullscreen'
        ? 'flex-col p-3 sm:p-6'
        : mobileSheet
          ? 'items-end justify-center p-0 min-[481px]:items-center min-[481px]:p-4'
          : 'items-center justify-center p-4'

  const content = (
    <div
      data-closing={closing ? 'true' : undefined}
      className={`studio-dialog-backdrop fixed inset-0 z-[100] flex bg-[#060913]/65 backdrop-blur-md overscroll-contain ${backdropLayout}`}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose()
        pressedBackdrop.current = false
      }}
    >
      {placement === 'fullscreen' ? (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className="flex h-full w-full flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          data-mobile-sheet={mobileSheet ? 'true' : undefined}
          className={`studio-dialog-panel relative w-full overflow-hidden border border-slate-200/85 bg-surface-1 text-fg-primary shadow-2xl dark:border-slate-700/80 dark:shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_28px_64px_-18px_rgba(0,0,0,0.75)] ${
            mobileSheet
              ? 'max-h-[90dvh] rounded-t-3xl border-b-0 min-[481px]:max-h-[calc(100dvh-2rem)] min-[481px]:rounded-3xl min-[481px]:border-b'
              : 'max-h-[calc(100dvh-2rem)] rounded-3xl'
          } ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {beam && <BorderBeam color={beamColor} durationSec={8} />}
          {children}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
