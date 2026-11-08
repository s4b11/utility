import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { useBackHandler } from '../../lib/backStack';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class. sm/md/lg map to the 4.21 dialog width (480); wider values pass through. */
  maxWidth?: string;
  /** Optional line under the title (`--text-2`); wired to `aria-describedby`. */
  description?: React.ReactNode;
  /** `dialog` (DESIGN.md 4.24, default): centred card. `sheet` (4.25): detached side sheet. */
  variant?: 'dialog' | 'sheet';
  /** Optional dialog icon (24, `secondary`, centred); the headline then centres (DESIGN.md 4.24). */
  icon?: React.ReactNode;
}

/** Exit: `dialog-out` / `sheet-out` play on the effects springs, then the layer unmounts (DESIGN.md 4.24: 160 ms). */
const CLOSE_MS = 220;
/** Widths that collapse onto the spec dialog width (`.dialog`: 280-560, 48 less than the viewport). */
const SPEC_WIDTHS = new Set(['max-w-xs', 'max-w-sm', 'max-w-md', 'max-w-lg']);

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
  description,
  variant = 'dialog',
  icon,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const descId = useId();
  useBackHandler(isOpen, () => closeRef.current());

  // Keep the layer mounted for the exit animation, showing what it last showed while open.
  const [present, setPresent] = useState(isOpen);
  const shown = useRef({ title, children, footer, description });
  if (isOpen) shown.current = { title, children, footer, description };

  useEffect(() => {
    if (isOpen) {
      setPresent(true);
      return;
    }
    if (!present) return;
    const t = window.setTimeout(() => setPresent(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [isOpen, present]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const wasLocked = document.body.classList.contains('overflow-hidden');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.body.classList.add('overflow-hidden');
    window.addEventListener('keydown', handleKeyDown);
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();

    return () => {
      if (!wasLocked) document.body.classList.remove('overflow-hidden');
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen && !present) return null;

  const closing = !isOpen;
  const view = shown.current;
  const hasBody = view.children !== null && view.children !== undefined && view.children !== false;
  const describedBy = view.description ? descId : undefined;

  const closeButton = (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onClose();
      }}
      className="icon-btn shrink-0"
      aria-label="Close"
      data-tip="Close"
    >
      <X className="i" aria-hidden="true" />
    </button>
  );

  // A single wrapper passed as `footer` (e.g. <div className="flex justify-end gap-2">) fills the row.
  const footerFill = '[&>div:only-child]:min-w-0 [&>div:only-child]:flex-1';

  const scrim = <div aria-hidden="true" className="modal-scrim" onClick={onClose} />;

  if (variant === 'sheet') {
    // DESIGN.md 4.25 detached modal side sheet.
    return (
      <div className={`modal-layer sheet ${closing ? 'closing pointer-events-none' : ''}`}>
        {scrim}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={view.title}
          aria-describedby={describedBy}
          tabIndex={-1}
          className="side-sheet outline-none"
        >
          <div className="sheet-card safe-pt">
            <header className="sheet-head">
              <div className="min-w-0 flex-1">
                <h2 className="break-words [overflow-wrap:anywhere]">{view.title}</h2>
                {view.description && <p id={descId}>{view.description}</p>}
              </div>
              {closeButton}
            </header>
            <div className={`sheet-body overscroll-contain ${view.footer ? '' : 'safe-pb'}`}>{view.children}</div>
            {view.footer && <footer className={`sheet-actions safe-pb ${footerFill}`}>{view.footer}</footer>}
          </div>
        </div>
      </div>
    );
  }

  const widthClass = SPEC_WIDTHS.has(maxWidth) ? '' : maxWidth;

  // DESIGN.md 4.24 dialog: headline, supporting text, scrolling body, right-aligned actions.
  // Dismissal is the text action in the footer; a close icon only appears without one.
  return (
    <div className={`modal-layer ${closing ? 'closing pointer-events-none' : ''}`}>
      {scrim}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`dialog outline-none ${widthClass}`}
      >
        <div className="dialog-card">
          {icon ? (
            <>
              <div className="dialog-icon" aria-hidden="true">{icon}</div>
              <h2 className="dialog-headline">{view.title}</h2>
            </>
          ) : (
            <header className="dialog-head">
              <h2 className="dialog-headline">{view.title}</h2>
              {!view.footer && closeButton}
            </header>
          )}
          {view.description && <p id={descId} className="dialog-support">{view.description}</p>}
          {hasBody && <div className="dialog-body overscroll-contain">{view.children}</div>}
          {view.footer && <footer className={`dialog-actions ${footerFill}`}>{view.footer}</footer>}
        </div>
      </div>
    </div>
  );
}
