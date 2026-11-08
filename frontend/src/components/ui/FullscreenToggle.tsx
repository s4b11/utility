import { Maximize2, Minimize2 } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

/** Icon button (4.2) that enters / exits a tool's full-screen view. */
export function FullscreenToggle({ active, onToggle, className = 'icon-btn' }: { active: boolean; onToggle: () => void; className?: string }) {
  const label = active ? 'Exit full screen' : 'Full screen';
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      onClick={() => { triggerHaptic('light'); onToggle(); }}
    >
      {active ? <Minimize2 className="i" aria-hidden="true" /> : <Maximize2 className="i" aria-hidden="true" />}
    </button>
  );
}
