import { useCallback, useEffect, useId, useRef, useState, type RefObject, type SVGProps } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleAlert, Copy, ExternalLink, Mail, MessageCircle, Send, X } from 'lucide-react'
import './DeveloperContact.css'

/**
 * Developer credit strip (rendered as the last row of the site footer) plus a
 * self-contained contact dialog. Isolated on purpose: no shared state, no new
 * dependencies, styles live in DeveloperContact.css.
 */

const DEVELOPER = 'Gangadharan S.'
const EMAIL = 'gangadharan1218@gmail.com'
const DISCORD = 'gangadharan1'
const GITHUB_USER = 'Gangadharan-S-dev'
const GITHUB_URL = `https://github.com/${GITHUB_USER}`
/** Must match the closing animation duration in DeveloperContact.css. */
const EXIT_MS = 180

// lucide-react 1.x ships no brand marks, so the two platform logos are inlined (Simple Icons paths).
function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

/** Clipboard API first; falls back to a hidden textarea for non-secure (plain http) origins. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the legacy path */ }
  const previousFocus = document.activeElement as HTMLElement | null
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  } finally {
    previousFocus?.focus?.()
  }
}

type Phase = 'closed' | 'open' | 'closing'

export default function DeveloperContact() {
  const [phase, setPhase] = useState<Phase>('closed')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogId = useId()

  const close = useCallback(() => setPhase((p) => (p === 'open' ? 'closing' : p)), [])

  // Keep the dialog mounted for the exit animation, then unmount it.
  useEffect(() => {
    if (phase !== 'closing') return
    const t = window.setTimeout(() => setPhase('closed'), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  return (
    <>
      <div className="dd-credit">
        <div className="dd-credit__inner">
          <p className="dd-credit__text">
            Developed &amp; Designed by <span className="dd-credit__name">{DEVELOPER}</span>
          </p>
          <button
            ref={triggerRef}
            type="button"
            className="dd-credit__btn"
            onClick={() => setPhase('open')}
            aria-haspopup="dialog"
            aria-expanded={phase === 'open'}
            aria-controls={phase !== 'closed' ? dialogId : undefined}
          >
            <MessageCircle aria-hidden="true" />
            Contact
          </button>
        </div>
      </div>
      {phase !== 'closed' && <ContactDialog id={dialogId} closing={phase === 'closing'} onClose={close} returnFocusRef={triggerRef} />}
    </>
  )
}

type Toast = { id: number; ok: boolean; message: string }

type DialogProps = {
  id: string
  closing: boolean
  onClose: () => void
  /** Focus target on close. Explicit because Safari doesn't focus buttons on click. */
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

function ContactDialog({ id, closing, onClose, returnFocusRef }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pressedBackdrop = useRef(false)
  const titleId = useId()
  const descId = useId()
  const [copied, setCopied] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // Scroll lock, background inert, initial focus — all restored on unmount.
  useEffect(() => {
    const returnTo = returnFocusRef.current
    const { body, documentElement } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    const root = document.getElementById('root')
    const prevInert = root?.inert ?? false
    if (root) root.inert = true
    closeRef.current?.focus()
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      if (root) root.inert = prevInert // must be lifted before refocusing inside #root
      returnTo?.focus({ preventScroll: true })
    }
  }, [returnFocusRef])

  // Escape closes; Tab / Shift+Tab stay inside the dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      const panel = panelRef.current
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const outside = !panel.contains(active)
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(t)
  }, [copied])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  const copy = async (key: string, value: string, label: string) => {
    const ok = await copyText(value)
    if (ok) setCopied(key)
    const message = ok ? `${label} copied to clipboard` : 'Couldn’t copy — please copy it manually'
    // New id each time so a repeated copy re-triggers the toast animation.
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, ok, message }))
  }

  const copyButton = (key: string, value: string, label: string) => {
    const done = copied === key
    return (
      <button
        type="button"
        className={`dd-contact__copy${done ? ' is-copied' : ''}`}
        onClick={() => copy(key, value, label)}
        aria-label={done ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        title={done ? 'Copied' : 'Copy'}
      >
        {done ? <Check key="done" aria-hidden="true" /> : <Copy key="idle" aria-hidden="true" />}
      </button>
    )
  }

  return createPortal(
    <div
      className={`dd-contact${closing ? ' is-closing' : ''}`}
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        // Only a press that starts *and* ends on the backdrop closes (no accidental close after text selection).
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose()
        pressedBackdrop.current = false
      }}
    >
      <div
        ref={panelRef}
        id={id}
        className="dd-contact__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="dd-contact__header">
          <span className="dd-contact__avatar" aria-hidden="true">GS</span>
          <div className="dd-contact__heading">
            <h2 id={titleId} className="dd-contact__title">Get in touch</h2>
            <p id={descId} className="dd-contact__desc">
              DocDoctor is developed &amp; designed by {DEVELOPER} Reach out for feedback, bug reports or collaboration.
            </p>
          </div>
          <button ref={closeRef} type="button" className="dd-contact__close" onClick={onClose} aria-label="Close contact dialog">
            <X aria-hidden="true" />
          </button>
        </div>

        <ul className="dd-contact__list">
          <li className="dd-contact__item">
            <a className="dd-contact__main" href={`mailto:${EMAIL}`} aria-label={`Send an email to ${EMAIL}`}>
              <span className="dd-contact__icon dd-contact__icon--email"><Mail aria-hidden="true" /></span>
              <span className="dd-contact__text">
                <span className="dd-contact__label">Email</span>
                <span className="dd-contact__value">{EMAIL}</span>
              </span>
              <Send className="dd-contact__hint" aria-hidden="true" />
            </a>
            {copyButton('email', EMAIL, 'Email address')}
          </li>

          <li className="dd-contact__item">
            <div className="dd-contact__main">
              <span className="dd-contact__icon dd-contact__icon--discord"><DiscordIcon /></span>
              <span className="dd-contact__text">
                <span className="dd-contact__label">Discord</span>
                <span className="dd-contact__value dd-contact__value--select">{DISCORD}</span>
              </span>
            </div>
            {copyButton('discord', DISCORD, 'Discord username')}
          </li>

          <li className="dd-contact__item">
            <a
              className="dd-contact__main"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open GitHub profile ${GITHUB_USER} (opens in a new tab)`}
            >
              <span className="dd-contact__icon dd-contact__icon--github"><GithubIcon /></span>
              <span className="dd-contact__text">
                <span className="dd-contact__label">GitHub</span>
                <span className="dd-contact__value">{GITHUB_USER}</span>
              </span>
              <ExternalLink className="dd-contact__hint" aria-hidden="true" />
            </a>
            {copyButton('github', GITHUB_URL, 'GitHub profile link')}
          </li>
        </ul>
      </div>

      <div className="dd-contact__toast-region" role="status" aria-live="polite">
        {toast && (
          <span key={toast.id} className={`dd-contact__toast${toast.ok ? '' : ' is-error'}`}>
            {toast.ok ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            {toast.message}
          </span>
        )}
      </div>
    </div>,
    document.body,
  )
}
