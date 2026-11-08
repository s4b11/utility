/**
 * The utility app icon: the indigo tile with white code brackets, identical to
 * public/icons/favicon.svg and the Android launcher icon. Sized by the `.mark`
 * class (30px on the rail, 42px on the form card) or by `size`/className.
 * Literal colours (not themed), decorative (aria-hidden): the adjacent name or
 * the control's label carries the meaning.
 */
export function BrandMark({ className = 'mark', size }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 108 108" aria-hidden="true" focusable="false">
      <rect width="108" height="108" rx="24.3" fill="#4F46E5" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M43 40 34 54 43 68" />
        <path d="M65 40 74 54 65 68" />
      </g>
    </svg>
  );
}

/** Lockup: icon + product name ("utility"). */
export function Brand({ className = '' }: { className?: string }) {
  return (
    <span className={`brand ${className}`}>
      <BrandMark />
      <span className="brand-name">utility</span>
    </span>
  );
}
