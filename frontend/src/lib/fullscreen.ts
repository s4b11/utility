import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from './platform';
import { useBackHandler } from './backStack';

/**
 * Full-screen view for a tool workspace.
 *
 * `active` turns the workspace into a fixed overlay that covers the whole app (rail,
 * header and bottom nav included); use `fullscreenClasses` for that container. In a
 * browser it also asks for native full screen so the browser chrome goes away too;
 * inside the Tauri app (and anywhere the Fullscreen API is unavailable) the overlay
 * alone fills the screen. Escape, the exit button, or leaving native full screen all
 * exit. Native full screen is released when the component unmounts.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false);
  const nativeRef = useRef(false);

  const exit = useCallback(() => {
    setActive(false);
    if (nativeRef.current && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    nativeRef.current = false;
  }, []);

  const enter = useCallback(() => {
    setActive(true);
    const root = document.documentElement;
    if (!platform.isTauri && document.fullscreenEnabled && !document.fullscreenElement && root.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => { nativeRef.current = true; })
        .catch(() => { nativeRef.current = false; });
    }
  }, []);

  useBackHandler(active, exit);

  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) exit();
    };
    // Leaving native full screen (browser Esc / gesture) also closes the overlay.
    const onChange = () => {
      if (nativeRef.current && !document.fullscreenElement) {
        nativeRef.current = false;
        setActive(false);
      }
    };
    const body = document.body;
    const wasLocked = body.classList.contains('overflow-hidden');
    body.classList.add('overflow-hidden');
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      if (!wasLocked) body.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [active, exit]);

  useEffect(() => () => {
    if (nativeRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  return { active, enter, exit, toggle };
}

/**
 * Classes for the workspace container while full screen: a fixed layer above the shell
 * (bottom nav z-30, header z-20) and below dialogs (z-70), toasts and tooltips, with
 * the page padding plus safe-area insets so nothing sits under the status bar,
 * notch or gesture bar.
 */
export const fullscreenClasses =
  'fixed inset-0 z-[60] flex flex-col gap-4 overflow-hidden bg-surface ' +
  'pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] ' +
  'pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] ' +
  'lg:pt-[max(24px,env(safe-area-inset-top))] lg:pb-[max(24px,env(safe-area-inset-bottom))] ' +
  'lg:pl-[max(24px,env(safe-area-inset-left))] lg:pr-[max(24px,env(safe-area-inset-right))]';
