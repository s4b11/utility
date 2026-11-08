import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';
import { triggerHaptic } from '../../lib/haptics';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Label for the safe way out, e.g. "Keep note" (DESIGN.md 4.21). */
  cancelLabel?: string;
  /** Shows the confirm button busy (4.1): spinner, aria-disabled, clicks ignored. */
  busy?: boolean;
}

/** DESIGN.md 4.24 destructive confirmation: alert icon, question headline, supporting text naming the
 *  record, the safe outcome as a text dismiss, then a `danger` confirm. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  cancelLabel = 'Cancel',
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      icon={<TriangleAlert className="i" />}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn text">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              triggerHaptic(danger ? 'error' : 'medium');
              onConfirm();
              onClose();
            }}
            aria-disabled={busy ? 'true' : undefined}
            className={`btn ${danger ? 'danger' : 'filled'} ${busy ? 'is-busy' : ''}`}
          >
            <span className="loading" aria-hidden="true" />
            <span>{confirmLabel}</span>
          </button>
        </>
      }
    />
  );
}
