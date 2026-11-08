/**
 * Trigger subtle haptic feedback on supporting devices.
 * Uses navigator.vibrate in PWA/browser, or Tauri haptic plugins if available.
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') {
  if (typeof window === 'undefined') return;

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const patterns: Record<string, number | number[]> = {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [10, 40, 20],
      warning: [20, 50, 20],
      error: [40, 60, 40],
    };
    try {
      navigator.vibrate(patterns[type] || 15);
    } catch {
      // Ignored if device doesn't support or user interacted outside gesture
    }
  }
}
