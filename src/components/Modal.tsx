import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
  )

export const Modal = ({
  open,
  onClose,
  labelledBy,
  children,
  initialFocusRef,
}: ModalProps): React.JSX.Element | null => {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const focusTimerId = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }

      const panel = panelRef.current
      if (!panel) {
        return
      }

      const focusables = getFocusableElements(panel)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        panel.focus()
      }
    }, 0)

    return () => {
      window.clearTimeout(focusTimerId)
    }
  }, [initialFocusRef, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const panel = panelRef.current
      if (!panel) {
        return
      }

      const focusables = getFocusableElements(panel)
      if (focusables.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeElement = document.activeElement as HTMLElement | null
      const isInsidePanel = activeElement ? panel.contains(activeElement) : false

      if (event.shiftKey) {
        if (!isInsidePanel || activeElement === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!isInsidePanel || activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="modal-overlay is-open"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="modal-surface is-open"
        onMouseDown={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
