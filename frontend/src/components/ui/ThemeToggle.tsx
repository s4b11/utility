import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { triggerHaptic } from '../../lib/haptics';

/** DESIGN.md 2.1 toggle: moon in light theme, sun in dark theme. */
export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
  return (
    <button type="button" className={className} aria-label={label} data-tip={label} onClick={() => { triggerHaptic('light'); toggle(); }}>
      {theme === 'dark' ? <Sun className="i" /> : <Moon className="i" />}
    </button>
  );
}
