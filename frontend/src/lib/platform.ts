export const platform = {
  isTauri: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  isPWA:
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as any).standalone === true)),
  isMobile:
    typeof window !== 'undefined' &&
    (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
      window.innerWidth < 768),
  isIOS:
    typeof window !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)),
  isAndroid: typeof window !== 'undefined' && /Android/.test(navigator.userAgent),
};
