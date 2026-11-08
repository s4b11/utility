import type { Config } from 'tailwindcss';

/**
 * Material 3 Expressive tokens (docs/design/DESIGN.md section 2) exposed to Tailwind.
 * Every colour is a role read from the CSS custom properties in src/styles/m3e.css, so
 * light/dark themes recolour utilities too. Never use Tailwind's stock palette.
 *
 *   bg-surface, bg-surface-container(-lowest|-low|-high|-highest), bg-primary, bg-primary-container,
 *   bg-secondary-container, bg-tertiary-container, bg-error(-container), bg-success(-container) ...
 *   text-on-surface, text-on-surface-variant, text-primary, text-on-primary-container ...
 *   border-outline, border-outline-variant
 *   bg-tone / bg-tone-container / text-on-tone-container (reads the .t-* tone classes)
 */
const sys = (name: string) => `var(--md-sys-color-${name})`;
const ext = (name: string) => `var(--md-ext-color-${name})`;
const extRole = (n: string) => ({
  [n]: ext(n),
  [`on-${n}`]: ext(`on-${n}`),
  [`${n}-container`]: ext(`${n}-container`),
  [`on-${n}-container`]: ext(`on-${n}-container`),
});

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Spec component classes that share a name with a Tailwind display utility (DESIGN.md 4.12, 4.16).
  blocklist: ['list-item', 'table'],
  theme: {
    extend: {
      colors: {
        primary: sys('primary'),
        'on-primary': sys('on-primary'),
        'primary-container': sys('primary-container'),
        'on-primary-container': sys('on-primary-container'),
        secondary: sys('secondary'),
        'on-secondary': sys('on-secondary'),
        'secondary-container': sys('secondary-container'),
        'on-secondary-container': sys('on-secondary-container'),
        tertiary: sys('tertiary'),
        'on-tertiary': sys('on-tertiary'),
        'tertiary-container': sys('tertiary-container'),
        'on-tertiary-container': sys('on-tertiary-container'),
        error: sys('error'),
        'on-error': sys('on-error'),
        'error-container': sys('error-container'),
        'on-error-container': sys('on-error-container'),
        surface: sys('surface'),
        'surface-dim': sys('surface-dim'),
        'surface-bright': sys('surface-bright'),
        'surface-container-lowest': sys('surface-container-lowest'),
        'surface-container-low': sys('surface-container-low'),
        'surface-container': sys('surface-container'),
        'surface-container-high': sys('surface-container-high'),
        'surface-container-highest': sys('surface-container-highest'),
        'on-surface': sys('on-surface'),
        'on-surface-variant': sys('on-surface-variant'),
        outline: sys('outline'),
        'outline-variant': sys('outline-variant'),
        'inverse-surface': sys('inverse-surface'),
        'inverse-on-surface': sys('inverse-on-surface'),
        'inverse-primary': sys('inverse-primary'),
        ...extRole('success'),
        ...extRole('warning'),
        ...extRole('violet'),
        ...extRole('teal'),
        ...extRole('rose'),
        tone: 'var(--tone)',
        'on-tone': 'var(--on-tone)',
        'tone-container': 'var(--tone-container)',
        'on-tone-container': 'var(--on-tone-container)',
        // 2.7 state layers as solid backgrounds (hover 8%, pressed 10%)
        'state-hover': `color-mix(in srgb, ${sys('on-surface')} 8%, transparent)`,
        'state-pressed': `color-mix(in srgb, ${sys('on-surface')} 10%, transparent)`,
      },
      fontFamily: {
        sans: ['var(--md-ref-typeface-plain)'],
        brand: ['var(--md-ref-typeface-brand)'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        // 2.4 corner scale
        xs: 'var(--md-sys-shape-corner-extra-small)',
        sm: 'var(--md-sys-shape-corner-small)',
        md: 'var(--md-sys-shape-corner-medium)',
        lg: 'var(--md-sys-shape-corner-large)',
        'lg-inc': 'var(--md-sys-shape-corner-large-increased)',
        xl: 'var(--md-sys-shape-corner-extra-large)',
        'xl-inc': 'var(--md-sys-shape-corner-extra-large-increased)',
        '2xl': 'var(--md-sys-shape-corner-extra-extra-large)',
      },
      boxShadow: {
        // 2.5 elevation
        1: 'var(--md-sys-elevation-level1)',
        2: 'var(--md-sys-elevation-level2)',
        3: 'var(--md-sys-elevation-level3)',
        4: 'var(--md-sys-elevation-level4)',
        5: 'var(--md-sys-elevation-level5)',
      },
      transitionTimingFunction: {
        'spatial-fast': 'var(--md-sys-motion-spatial-fast-easing)',
        'spatial-default': 'var(--md-sys-motion-spatial-default-easing)',
        'effects-fast': 'var(--md-sys-motion-effects-fast-easing)',
      },
      padding: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },
      margin: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
