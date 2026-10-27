import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';

interface ModalProps {
  /** id of the element that names the dialog. */
  titleId: string;
  /** Called on Escape; the caller decides whether closing is allowed right now. */
  onClose: () => void;
  /** Receives focus when the modal opens. */
  initialFocusRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)';

/** Overlay + dialog: Escape closes, focus stays inside, page scroll is locked, focus returns on close. */
export function Modal({ titleId, onClose, initialFocusRef, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocusRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [initialFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    // Keep keyboard focus inside the dialog.
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
