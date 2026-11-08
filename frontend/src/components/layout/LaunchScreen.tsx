import { BrandMark } from '../ui/BrandMark';

/** First paint: product mark and name over the loading indicator (DESIGN.md 4.20). */
export function LaunchScreen() {
  return (
    <div role="status" aria-label="Opening utility" className="grid min-h-dvh place-items-center bg-surface text-on-surface">
      <div className="flex flex-col items-center gap-6 animate-[fade-in_var(--md-sys-motion-effects-default)]">
        <span className="brand headline-small">
          <BrandMark className="h-[48px] w-[48px] flex-none" size={48} />
          <span className="brand-name">utility</span>
        </span>
        <span className="loading" aria-hidden="true" />
      </div>
    </div>
  );
}
