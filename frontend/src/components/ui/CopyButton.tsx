import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';

interface CopyButtonProps {
  text: string;
  className?: string;
  ariaLabel?: string;
}

/** 4.2 icon button: tooltip and label read "Copy …", then "Copied" with a check for 2 s. */
export function CopyButton({ text, className = '', ariaLabel = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      triggerHaptic('success');
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const label = copied ? 'Copied' : ariaLabel;
  // Callers may pass their own `icon-btn …` classes; only add the base class when they don't.
  const classes = /(^|\s)icon-btn(\s|$)/.test(className) ? className : `icon-btn ${className}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      data-tip={label}
      className={classes.trim()}
    >
      {copied ? <Check className="i text-success" aria-hidden="true" /> : <Copy className="i" aria-hidden="true" />}
    </button>
  );
}
