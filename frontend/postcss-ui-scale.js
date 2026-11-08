/**
 * Type scale at build time, so the spec stylesheets (src/styles/m3e.css is a verbatim copy)
 * stay untouched: every px/rem length in `font-size`, `line-height` and the `font` shorthand,
 * in all CSS (spec, app layer, Tailwind text-* utilities), becomes
 * `calc(<length> * var(--ui-text-scale, 1))`.
 *
 * The scale itself is set in src/styles/app.css: 0.8 on phones and narrow windows, 1 (spec
 * size) on desktop. Spacing, shapes and touch targets keep their spec sizes. Icons follow the
 * same switch through `--ui-icon-scale`.
 */
const LENGTH = /(-?\d*\.?\d+)(px|rem)\b/g;
const PROPS = new Set(['font-size', 'line-height', 'font']);

const scale = (value) => value.replace(LENGTH, (_, n, unit) => `calc(${n}${unit} * var(--ui-text-scale, 1))`);

export default function uiScale() {
  return {
    postcssPlugin: 'ui-scale',
    Declaration(decl) {
      if (!PROPS.has(decl.prop) || decl.__uiScaled || decl.value.includes('--ui-text-scale')) return;
      decl.__uiScaled = true;
      decl.value = scale(decl.value);
    },
  };
}
uiScale.postcss = true;
