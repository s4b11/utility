# Component system - Material 3 Expressive design specification

Version: 2.0  
Date: 6 November 2026  
Implementation: `components.html`  
Document purpose: reproduce, understand and maintain every interface component on Material 3 Expressive (M3E): its colour roles, type scale, shape scale and shape library, spring motion, state layers and components.

Revision: second edition. Rebuilds the whole system from version 1.0 (a custom flat design) on Material 3 Expressive. Section 10 maps every version 1.0 component to its replacement. No product name is part of the system; "Product name" is a placeholder wherever a name appears.

## 1. Scope, sources and strategy

### 1.1 Scope and source of truth

This document specifies the tokens, base styles, components, states, behaviour, composition rules, accessibility, copy conventions and window-size behaviour of the system. `components.html` renders all of it in light and dark themes and from five seed colours.

The implementation is the source of truth for literal values. Section 13 contains its complete component stylesheet. `components.html` is self-contained (HTML, CSS, JavaScript, icon sprite embedded) and makes no network requests.

### 1.2 How the tokens were produced

| Token group | Method |
|---|---|
| Colour roles | Generated from a seed colour (`#2563EB`). Each palette holds the seed's hue in OKLCH at a fixed chroma; a tone is the colour whose CIELAB L* equals the tone number (the definition M3 uses). Roles take the standard M3 tones (2.1). The same algorithm runs in the page for the seed picker. |
| Spring motion | The M3E expressive spring tokens (stiffness, damping ratio) solved as damped springs, sampled at 29 points and written as CSS `linear()` curves with their settling time (2.6). |
| Shapes | 13 shapes from the M3E shape library approximated as 64-point polygons with identical point order, so any shape can morph into any other with a CSS transition (2.4). |
| Sizes, corners, type, elevation, state opacities | Material 3 and M3 Expressive published values. |

Differences from Google's own tooling, stated plainly:

- Material Theme Builder uses the HCT colour space (CAM16 hue and chroma). This generator holds hue in OKLCH instead. Tones match by definition; hue and chroma are close but not identical. To match Theme Builder exactly, export its roles and paste them over section 2.1.
- Material's springs run in a physics engine. `linear()` curves reproduce their shape and duration for transitions that run to completion, but they do not carry velocity when interrupted.
- The shape library polygons are faithful in character, not path-identical to Google's shape definitions.

### 1.3 Design strategy

The components follow ten rules. Every value later in this document applies one of them.

| # | Rule | How it shows up |
|---:|---|---|
| 1 | **Colour is a role, never a hex.** Components reference roles (`primary`, `surface-container-high`), so one seed and one theme switch recolour everything. | All colour in section 4 is a role. The seed picker regenerates every role live. |
| 2 | **Tonal hierarchy before shadow.** Depth comes first from five surface container tones; shadow is reserved for things that float. | Cards and tables sit on container tones. FABs, menus, dialogs, toolbars and snackbars cast shadows (2.5). |
| 3 | **Containers carry emphasis.** Strong colour goes on large, important things (filled buttons, FABs, vibrant toolbars); quiet content uses container and on-container pairs. | Primary for the main action; secondary-container for selection; tertiary-container for accents and the selected menu item. |
| 4 | **Shape has meaning.** Round means "press me"; a tighter corner means "being pressed"; a change of shape means "selected". Abstract shapes add emphasis and personality where a plain circle would be generic. | Buttons morph corners on press and selection (4.1). KPI icons, empty states and the loading indicator use library shapes. |
| 5 | **Corners scale with size.** Small parts get small corners; big containers get big ones. | 4 for fields and snackbars up to 28 for dialogs and 48 for hero surfaces (2.4). |
| 6 | **Motion is physical.** Spatial changes use springs that may overshoot; colour and opacity use springs that never do. Fast for small parts, slow for large ones. | Button corners: fast spatial. Dialogs and sheets: default spatial. Shape morphs: slow spatial (2.6). |
| 7 | **Size is emphasis.** One hero action may be large or extra large; everything else stays small. | Five button sizes from 32 to 136 (4.1). |
| 8 | **Interaction is a layer.** Hover, focus and press are translucent layers of the content colour plus a ripple, so they work on every container colour. | 8%, 10%, 10% (2.7). |
| 9 | **Explain, don't hide.** Unavailable icon actions stay visible with a tooltip saying why; busy buttons show a loading indicator in place of their label. | 4.2, 4.1. |
| 10 | **One at a time.** One primary action per screen, one open menu, one snackbar. | 4.1, 4.21, 4.23. |

## 2. Foundations

### 2.1 Colour roles

Roles are CSS custom properties named `--md-sys-color-*` on `:root`, overridden on `:root[data-theme="dark"]`. Light and dark values below are for the default seed `#2563EB`.

#### Accent roles

| Role | Light | Dark | Tone light / dark | Use |
|---|---|---|---|---|
| `primary` | `#1552D9` | `#AAC7FF` | 40 / 80 | Filled buttons, active sort arrow, checked controls, focus caret |
| `on-primary` | `#FFFFFF` | `#002583` | 100 / 20 | Content on primary |
| `primary-container` | `#D4E3FF` | `#0038B7` | 90 / 30 | FAB, vibrant toolbar, hero, "Scheduled" status |
| `on-primary-container` | `#0038B7` | `#D4E3FF` | 30 / 90 | Content on primary container |
| `secondary` | `#565F6F` | `#BDC7D9` | 40 / 80 | Selected toggle (tonal), selected connected button |
| `on-secondary` | `#FFFFFF` | `#29313F` | 100 / 20 | |
| `secondary-container` | `#D9E3F6` | `#3F4756` | 90 / 30 | Tonal buttons, active rail indicator, selected chip, selected row, current page |
| `on-secondary-container` | `#3F4756` | `#D9E3F6` | 30 / 90 | |
| `tertiary` | `#7A4F7F` | `#E7B7EC` | 40 / 80 | Accent shapes |
| `on-tertiary` | `#FFFFFF` | `#48214D` | 100 / 20 | |
| `tertiary-container` | `#FBD7FF` | `#603766` | 90 / 30 | Selected menu item, empty-state shape, large FAB |
| `on-tertiary-container` | `#603766` | `#FBD7FF` | 30 / 90 | |
| `error` | `#BD1015` | `#FFB4AA` | 40 / 80 | Error fields, danger buttons, badges |
| `on-error` | `#FFFFFF` | `#690004` | 100 / 20 | |
| `error-container` | `#FFDAD5` | `#930008` | 90 / 30 | "Cancelled" status |
| `on-error-container` | `#930008` | `#FFDAD5` | 30 / 90 | |

Palettes: primary holds the seed's chroma (OKLCH C 0.215); secondary 0.028; tertiary the seed hue + 60° at 0.09; neutral 0.008; neutral variant 0.02; error a fixed red hue at 0.2.

#### Surfaces

| Role | Light | Dark | Tone light / dark | Use |
|---|---|---|---|---|
| `surface` | `#F6F9FF` | `#111317` | 98 / 6 | Page, outlined card, specimen panels |
| `surface-dim` | `#D7DADF` | `#111317` | 87 / 6 | Dimmed backgrounds |
| `surface-bright` | `#F6F9FF` | `#37393D` | 98 / 24 | Bright backgrounds |
| `surface-container-lowest` | `#FFFFFF` | `#0C0E12` | 100 / 4 | Data table, list items |
| `surface-container-low` | `#F1F4F9` | `#1A1C1F` | 96 / 10 | Elevated card, side sheet, sign-in card, elevated button |
| `surface-container` | `#EBEEF3` | `#1E2023` | 94 / 12 | Menus, KPI cards, toolbar, app bar when scrolled |
| `surface-container-high` | `#E5E8EE` | `#282A2E` | 92 / 17 | Dialogs, search bar, popovers |
| `surface-container-highest` | `#E0E3E8` | `#333539` | 90 / 22 | Filled text fields, filled card, switch track |

#### Content, outline and inverse

| Role | Light | Dark | Tone | Use |
|---|---|---|---|---|
| `on-surface` | `#1A1C1F` | `#E0E3E8` | 10 / 90 | Primary text and icons |
| `on-surface-variant` | `#414752` | `#C0C7D4` | NV 30 / 80 | Secondary text, labels, inactive icons |
| `outline` | `#717783` | `#8A919D` | NV 50 / 60 | Outlined text fields, switch border |
| `outline-variant` | `#C0C7D4` | `#414752` | NV 80 / 30 | Dividers, chip and card outlines |
| `inverse-surface` | `#2E3035` | `#E0E3E8` | 20 / 90 | Snackbar, plain tooltip |
| `inverse-on-surface` | `#EEF1F6` | `#2E3035` | 95 / 20 | Text on inverse surface |
| `inverse-primary` | `#AAC7FF` | `#1552D9` | 80 / 40 | Snackbar action |
| `scrim`, `shadow` | `#000000` | `#000000` | | Scrim at 32%; elevation shadows |

#### Theme and seed selection

| Rule | Value |
|---|---|
| Theme attribute | `data-theme="light"` or `"dark"` on `<html>` |
| First paint | An inline script reads `sessionStorage['theme']`, else follows `prefers-color-scheme` |
| Toggle | Icon button (moon / sun); stores the choice for the session |
| `color-scheme` | Declared with each palette so native controls match |
| Seed | `sessionStorage['seed']`. The default seed uses the static values above; another seed writes a generated style block over them |
| Seeds offered | Blue `#2563EB`, Green `#0F8A5F`, Violet `#8B4FD6`, Orange `#E5591E`, Pink `#D6336C` |
| Body transition | Background and colour on the default effects spring, so theme and seed changes cross-fade |

### 2.2 Extended roles and tone classes

Status colours are custom colours with the same four-role structure, named `--md-ext-color-*`. Each holds a source hue at OKLCH chroma 0.13.

| Role | Light colour / container / on-container | Dark colour / container / on-container | Meaning |
|---|---|---|---|
| `success` | `#006D3C` / `#93F7B8` / `#00522C` | `#76DA9C` / `#00522C` / `#93F7B8` | Open, completed, success |
| `warning` | `#8F4E00` / `#FFDCC1` / `#6D3A00` | `#FFB77C` / `#6D3A00` / `#FFDCC1` | On hold, warning |
| `violet` | `#6152A6` / `#E2DFFF` / `#4A398B` | `#C6C0FF` / `#4A398B` / `#E2DFFF` | Profile ready, analysis |
| `teal` | `#006972` / `#86F3FF` / `#004F56` | `#33DAEA` / `#004F56` / `#86F3FF` | Invites sent, published |
| `rose` | `#9C3D5F` / `#FFD9E3` / `#802348` | `#FFB1C7` / `#802348` / `#FFD9E3` | Recordings |

`on-*` is `#FFFFFF` in light theme and tone 20 in dark theme.

Tone classes give any component four variables to read: `--tone`, `--on-tone`, `--tone-container`, `--on-tone-container`.

| Class | Maps to |
|---|---|
| `.t-primary`, `.t-secondary`, `.t-tertiary`, `.t-error` | The accent roles |
| `.t-success`, `.t-warning`, `.t-violet`, `.t-teal`, `.t-rose` | The extended roles |
| `.t-neutral` | `on-surface-variant` on `surface-container-highest` |

### 2.3 Typography

| Property | Value |
|---|---|
| Brand face (`--md-ref-typeface-brand`) | "Google Sans Flex", "Google Sans", "Roboto Flex", Roboto, then the system sans |
| Plain face (`--md-ref-typeface-plain`) | "Google Sans Flex", "Roboto Flex", Roboto, then the system sans |
| Loading | No font CDN. The faces are used when installed or self-hosted; otherwise the system sans renders the same scale |
| Body | `400 14px/20px`, +0.25px (body-medium) |

Type scale (`.display-large` and so on):

| Role | Size / line | Weight | Tracking | Face | Used for |
|---|---|---|---|---|---|
| display-large | 57 / 64 | 400 | -0.25 | brand | |
| display-medium | 45 / 52 | 400 | 0 | brand | Showcase hero |
| display-small | 36 / 44 | 400 | 0 | brand | KPI numbers |
| headline-large | 32 / 40 | 400 | 0 | brand | Sign-in headline, XL button |
| headline-medium | 28 / 36 | 400 | 0 | brand | Medium app bar |
| headline-small | 24 / 32 | 400 | 0 | brand | Dialog and sheet headlines, L button, section titles |
| title-large | 22 / 28 | 400 | 0 | brand | Small app bar, empty-state title |
| title-medium | 16 / 24 | 500 | 0.15 | plain | M button, avatar initials, FAB label |
| title-small | 14 / 20 | 500 | 0.1 | plain | Row names, rich tooltip title |
| body-large | 16 / 24 | 400 | 0.5 | plain | Text field input and label, search, list headline |
| body-medium | 14 / 20 | 400 | 0.25 | plain | Body, table cells, snackbar, dialog supporting text |
| body-small | 12 / 16 | 400 | 0.4 | plain | Supporting text, floated labels, plain tooltip |
| label-large | 14 / 20 | 500 | 0.1 | plain | Buttons XS and S, chips, menu items, table headers |
| label-medium | 12 / 16 | 500 | 0.5 | plain | Rail labels, status labels, app-bar subtitle |
| label-small | 11 / 16 | 500 | 0.5 | plain | Badges |

Emphasized styles (`.emphasized`) raise weight: display, headline, title-large and body styles to 500; title-medium, title-small and labels to 600. Use one emphasized style per view, for the thing that should lead. These weights are this system's choice; check them against Google's published emphasized tokens if exact parity matters.

Numbers that align use `font-variant-numeric: tabular-nums`.

### 2.4 Shape

#### Corner scale

| Token | Value | Used by |
|---|---:|---|
| `--md-sys-shape-corner-none` | 0 | Full-bleed surfaces |
| `extra-small` | 4 | Text fields, snackbar, plain tooltip, split-button inner corners, connected-group pressed |
| `small` | 8 | Chips, status labels, connected-group inner corners, pressed XS / S buttons, kbd |
| `medium` | 12 | Cards, menu items, square XS / S buttons, current page, pressed M buttons, chip while open, rich tooltip |
| `large` | 16 | KPI cards, menus, data table, side sheet, FAB, segmented list outer corners, square M button, pressed L / XL |
| `large-increased` | 20 | Medium FAB |
| `extra-large` | 28 | Dialogs, sign-in card, popovers, large FAB, square L / XL buttons, showcase panels |
| `extra-large-increased` | 32 | Hero surfaces |
| `extra-extra-large` | 48 | Showcase hero, large sheets |
| `full` | 9999 | Buttons, icon buttons, search bar, avatars, switch, badges, rail indicator, toolbar, FAB menu items |

#### Shape library

Thirteen shapes are available as `--shape-NAME` (a `polygon()` with 64 points in the same order), applied with `clip-path`:

`circle`, `cookie-4`, `cookie-6`, `cookie-9`, `cookie-12`, `clover-4`, `sunny`, `soft-burst`, `pentagon`, `triangle`, `square`, `oval`, `pill`.

| Where | Shape |
|---|---|
| KPI icon containers | `cookie-9`, `clover-4`, `sunny`, `soft-burst` |
| Emphasis avatar | `cookie-6` |
| Empty state | `clover-4`, 96 |
| Loading indicator | Cycles soft-burst → cookie-9 → pentagon → pill → sunny → cookie-4 → oval |

Because every shape shares a point count, `transition: clip-path var(--md-sys-motion-spatial-slow)` morphs between any two. Use library shapes for decoration and emphasis, never for text containers: their edges cut into content.

### 2.5 Elevation

| Level | Shadow | Use |
|---:|---|---|
| 0 | none | Most surfaces |
| 1 | `0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)` | Elevated card and button; hovered filled and tonal buttons; side sheet |
| 2 | `0 1px 2px rgba(0,0,0,.3), 0 2px 6px 2px rgba(0,0,0,.15)` | Menus, rich tooltip, hovered elevated button |
| 3 | `0 1px 3px rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15)` | FAB, FAB menu items, dialogs, floating toolbar, snackbar |
| 4 | `0 2px 3px rgba(0,0,0,.3), 0 6px 10px 4px rgba(0,0,0,.15)` | Hovered FAB |
| 5 | `0 4px 4px rgba(0,0,0,.3), 0 8px 12px 6px rgba(0,0,0,.15)` | Dragged items |

The same shadows serve both themes; in dark theme the surface container tone does most of the work.

### 2.6 Motion

Each spring is exposed three ways: `--md-sys-motion-NAME` (a "duration easing" pair for use in `transition`), `-easing` and `-duration`.

| Token | Stiffness | Damping ratio | Settles in | Overshoot | Use |
|---|---:|---:|---:|---:|---|
| `spatial-fast` | 800 | 0.6 | 348 ms | 9.5% | Button corners, press growth, switch thumb, checkbox tick, chips, menus in, snackbar in, toolbar in, floating labels |
| `spatial-default` | 380 | 0.8 | 412 ms | 1.5% | Dialogs, side sheet, rail expand, FAB menu, chevron flips, sort arrow |
| `spatial-slow` | 200 | 0.8 | 568 ms | 1.5% | Shape morphs, hero shapes, indeterminate linear progress |
| `effects-fast` | 3800 | 1 | 138 ms | 0 | State layers, colour and opacity changes, exits |
| `effects-default` | 1600 | 1 | 212 ms | 0 | Scrim, theme cross-fade, sheet exit |
| `effects-slow` | 800 | 1 | 300 ms | 0 | Ripple fade |

The standard (non-expressive) scheme is also generated for calmer contexts: `std-spatial-fast` 1400 / 0.9 (156 ms), `std-spatial-default` 700 / 0.9 (220 ms), `std-spatial-slow` 300 / 0.9 (335 ms).

Rules:

- Spatial springs move, resize, rotate and reshape. Effects springs fade and recolour. Never use a spatial spring on opacity: overshoot would flash.
- Small parts use fast; containers use default; large decorative changes use slow.
- Exits use an effects spring and are shorter than the matching entrance.
- Keyframe animations that are not springs: ripple (550 ms), loading indicator (4.55 s cycle), circular and wavy progress (1–1.4 s loops).
- `prefers-reduced-motion: reduce` sets every animation and transition to 0.01 ms; the loading indicator keeps morphing but stops spinning.

### 2.7 State layers

Interactive elements carry `.sl`: a `::before` layer filled with the content colour (`currentColor`, or `--sl-color`) at:

| State | Opacity |
|---|---:|
| Hover | 8% |
| Focus (`:focus-visible`) | 10%, plus a 3 px `secondary` outline offset 2 px |
| Pressed | 10%, plus a ripple: a circle twice the diagonal, starting at the pointer, scaling from 0 to 1 while fading from 12% to 0 over 550 ms |
| Dragged | 16% |

Disabled: container `on-surface` at 10%, content `on-surface` at 38%, no state layer. Text and outlined buttons keep a transparent container.

The checkbox and switch use a 40 px circular state layer around the control instead of the element's own box.

### 2.8 Icons

| Property | Value |
|---|---|
| Delivery | One inline sprite of `<symbol id="i-NAME" viewBox="0 0 24 24">` |
| Use | `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-NAME"/></svg>` |
| Style | Outlined, 2 px stroke, round caps and joins, `currentColor`; matches Material Symbols Rounded at weight 400 |
| Size | 24 by default; 20 in XS / S buttons, chips (18), menu items; 16 in status labels; 32–40 in L / XL buttons |

The sprite holds 52 icons: grid, briefcase, contact, cal-clock, file-chart, user, user-check, help, bell, logout, card, search, plus, edit, chev-down, chev-left, chev-right, first, last, arrow-up, filter, calendar, cal-plus, eye, eye-off, lock, mail, upload, download, copy, send, x, x-circle, check, check-circle, alert, info, clock, video, sparkle, sun, moon, menu, menu-open, pin, link, more, palette, trash, format, italic, underline. Material Symbols can replace the sprite one for one.

## 3. Base layer

| Rule | Value |
|---|---|
| Box sizing | `border-box` everywhere |
| Body | `surface` background, `on-surface` text, body-medium; colours cross-fade on the default effects spring |
| Form controls | Inherit font, colour and letter-spacing |
| Focus | `:focus-visible { outline: 3px solid secondary; outline-offset: 2px }` |
| Hidden | `[hidden], .hidden { display: none !important }` |
| Screen-reader only | `.sr` |
| Icon | `svg.i` as in 2.8 |
| State layer | `.sl` as in 2.7 |

## 4. Components

Each component lists anatomy, values, variants, states and behaviour. Class names are the canonical ones in `components.html`.

### 4.1 Button

`<button class="btn filled s sl">`.

| Size | Height | Padding | Icon | Icon gap | Label | Square corner | Pressed corner |
|---|---:|---:|---:|---:|---|---:|---:|
| `xs` | 32 | 12 | 20 | 4 | label-large | 12 | 8 |
| `s` (default) | 40 | 16 | 20 | 8 | label-large | 12 | 8 |
| `m` | 56 | 24 | 24 | 8 | title-medium | 16 | 12 |
| `l` | 96 | 48 | 32 | 12 | headline-small | 28 | 16 |
| `xl` | 136 | 64 | 40 | 16 | headline-large | 28 | 16 |

Round is the default shape (full corners); `.square` uses the square corner. Pressing morphs to the pressed corner on the fast spatial spring. Minimum width 48.

| Style | Container | Content | Hover |
|---|---|---|---|
| `filled` | `primary` | `on-primary` | level 1 |
| `tonal` | `secondary-container` | `on-secondary-container` | level 1 |
| `elevated` | `surface-container-low`, level 1 | `primary` | level 2 |
| `outlined` | transparent, 1 px `outline-variant` | `on-surface-variant` | state layer |
| `text` | transparent, padding 12 | `primary` | state layer |
| `danger` (extension) | `error` | `on-error` | state layer |
| `danger-text` (extension) | transparent | `error` | state layer |

Toggle buttons (`.toggle` with `aria-pressed`):

| Style | Unselected | Selected |
|---|---|---|
| filled | `surface-container` / `on-surface-variant` | `primary` / `on-primary` |
| tonal | `secondary-container` | `secondary` / `on-secondary` |
| outlined | outline | `inverse-surface` / `inverse-on-surface` |

A selected round toggle morphs to its square corner; a selected square toggle morphs to round.

States: disabled per 2.7 (`disabled` attribute). Busy: `.is-busy` plus `aria-disabled="true"` hides the label and shows a loading indicator (4.20) centred in its place, in `on-primary` on filled buttons; the form gets `aria-busy`.

Usage: one filled button per view for the main action. Tonal for strong secondary actions; outlined for alternatives; text for low emphasis and dialog dismissals; elevated only on busy backgrounds. Use M or larger only for a screen's hero action. `danger` and `danger-text` are this system's extension for destructive confirmations; Material has no stock destructive button.

### 4.2 Icon button

`<button class="icon-btn s sl" aria-label="…" data-tip="…">`.

| Size | Container | Icon | Square corner | Pressed corner |
|---|---:|---:|---:|---:|
| `xs` | 32 | 20 | 12 | 8 |
| `s` (default) | 40 | 24 | 12 | 8 |
| `m` | 56 | 24 | 16 | 12 |
| `l` | 96 | 32 | 28 | 16 |
| `xl` | 136 | 40 | 28 | 16 |

Widths: `.narrow` 0.8 × height, default 1 ×, `.wide` 1.3 ×. Styles: standard (transparent, `on-surface-variant`), `filled`, `tonal`, `outlined`, plus `danger` (error content). Toggle: standard selected turns `primary`; filled unselected is `surface-container`; tonal selected is `secondary`; selected morphs round to square.

Disabled uses `aria-disabled="true"` (not `disabled`) so the tooltip still explains why: content at 38%, no state layer, click ignored.

### 4.3 Button groups

| Group | Values |
|---|---|
| Standard (`.btn-group`) | Gap 18 (XS), 12 (S), 8 (M). The pressed button widens (8 px more padding, or 1.15 × width for icon buttons) on the fast spatial spring while its neighbours give way |
| Connected (`.connected`) | Gap 2. Outer corners full; inner corners 8; pressed 4. Selected item (`aria-checked="true"`) becomes fully round, fills `secondary` / `on-secondary` and slides in a leading check. Unselected items are `surface-container` / `on-surface-variant` |

Connected groups replace segmented buttons. They use `role="radiogroup"` with `role="radio"` items for single selection.

### 4.4 Split button

`.split` holds a leading button and a trailing `.split-trail` button.

| Part | Value |
|---|---|
| Gap | 2 |
| Leading button | Corners full outside, 4 inside |
| Trailing button | 48 wide; corners 4 inside, full outside; `chev-down` |
| Pressed | Inner corners 8 |
| Open (`aria-expanded="true"`) | Trailing becomes a full circle; chevron rotates 180° (default spatial) |

The trailing button opens a menu aligned to its end. Both halves share one style (filled, tonal, outlined).

### 4.5 FAB and FAB menu

| Variant | Size | Corner | Icon |
|---|---:|---:|---:|
| `fab` | 56 | 16 | 24 |
| `fab medium` | 80 | 20 | 28 |
| `fab large` | 96 | 28 | 36 |
| `fab extended` | 56 high, padding 0 20 0 16 | 16 | 24 + title-medium label |

Colours: `primary-container` (default), `.secondary`, `.tertiary` containers with their on-colours. Elevation level 3, hover 4; `.flat` removes the shadow (used inside the rail).

FAB menu (`.fab-menu`): items are 56 high, full corners, `primary-container`, title-medium, level 3. Opening staggers them in (30 ms apart) from 16 px below at 80% scale on the fast spatial spring; the toggle morphs into a 56 px round `primary` button and its plus rotates 135° into a close mark. Escape or choosing an item closes it.

### 4.6 Checkbox

| Part | Value |
|---|---|
| Box | 18 × 18, corner 2, 2 px `on-surface-variant` border |
| Checked / indeterminate | `primary` fill and border; mark `on-primary` |
| Check mark | Scales in on the fast spatial spring |
| Error | `error` border |
| Target | `.cb-target`, 40 × 40 circle with an `on-surface` state layer (primary when checked); margin -11 so layout stays 18 |
| With label | `.check-row`, gap 16, min height 40 |

### 4.7 Switch

`<label class="switch"><input type="checkbox" role="switch"><span class="sw-track"><span class="sw-thumb">…check…</span></span>Label</label>`

| Part | Off | On |
|---|---|---|
| Track | 52 × 32, `surface-container-highest`, 2 px `outline` | `primary`, no border |
| Thumb | 16, `outline`, centred 16 from the left | 24, `on-primary`, centred 36 from the left, `on-primary-container` check icon 16 |
| Pressed | 28 | 28 |
| State layer | 40 circle around the thumb | |
| Motion | Thumb position and size on the fast spatial spring | |

Switches apply immediately. Use a checkbox when a choice is submitted with a form.

### 4.8 Text field

Structure: `.field` (column, gap 4) holding `.tf` and `.tf-support`. Inside `.tf`: optional `.lead` icon, the `<input>` or `<select>` with `placeholder=" "`, the `<label class="tf-label">`, optional `.trail` icon or icon button.

| Part | Value |
|---|---|
| Height | 56 |
| Input | body-large, padding 0 16; 52 with a leading or trailing element |
| Label | body-large, `on-surface-variant`, vertically centred at left 16 (52 with a leading icon) |
| Floated label | body-small; floats on focus, on content, or always with `.float` |
| Icons | 24, `on-surface-variant`, 12 from the edge; trailing icon buttons sit 4 from the edge |
| Supporting text | body-small, `on-surface-variant`, padding 0 16; hidden when empty |
| Focus | Label `primary` |

| Variant | Container | Indicator |
|---|---|---|
| `outlined` | Transparent, corner 4, 1 px `outline` (hover `on-surface`) | Focus 2 px `primary`; floated label sits on the border at left 12 with a `--tf-bg` backing |
| `filled` | `surface-container-highest`, top corners 4 | 1 px `on-surface-variant` bottom line, 2 px `primary` on focus; floated label at top 8; input padding-top 18 |
| `readonly` | `surface-container-high`, `on-surface-variant` text | none |

Error (`.field.error`): outline or indicator `error`, label and trailing icon `error`, supporting text becomes the error message, input `aria-invalid="true"` with `aria-describedby` to it.

Selects use the same field with `.float` and a trailing `chev-down`. Autofill keeps the field's own background. Outlined fields read `--tf-bg` so the floated label's backing matches whatever surface they sit on (dialogs set it to `surface-container-high`).

Password reveal: a trailing icon button toggles `password` / `text`, swaps `eye` / `eye-off` and updates its label and tooltip.

### 4.9 Search bar

| Part | Value |
|---|---|
| Container | 56 high, full corners, `surface-container-high`; hover adds an 8% `on-surface` layer; focus `surface-container-highest` |
| Width | 100%, max 720 |
| Leading icon | `search`, `on-surface` |
| Input | body-large; placeholder `on-surface-variant` |
| kbd hint | `/`, 24 high, corner 8, `surface-container-highest`; hidden on focus, with text, or on touch |
| Trailing | Clear icon button (only with text) and an optional 32 avatar |

Pressing `/` anywhere focuses the bar unless typing in a field, a modifier is held, or a dialog or sheet is open.

### 4.10 Chips

| Part | Value |
|---|---|
| Height | 32 |
| Corner | 8; 12 while its menu is open |
| Border | 1 px `outline-variant` |
| Label | label-large, `on-surface-variant`, truncates; max width 280 |
| Padding | 0 16; 8 on the side with an icon |
| Icons | 18 |

| Type | Behaviour |
|---|---|
| Filter (`aria-pressed`) | Selected: `secondary-container` / `on-secondary-container`, no border, a leading check slides in on the fast spatial spring |
| Dropdown filter | Trailing `chev-down` that flips while open; label shows the current value ("Status" → "Open"); `.on` when not "all" |
| Input | Leading avatar (24), trailing remove button (24 circle) |
| Assist | Leading icon in `primary` |

While any filter is active, a text button "Clear filters" appears after the chips.

### 4.11 Status label and badge

Status label (an extension built from tone roles; Material has no stock status component):

| Part | Value |
|---|---|
| Height | 28 |
| Corner | 8; `.pill` for full |
| Padding | 0 12 0 8 |
| Colours | `--tone-container` / `--on-tone-container` |
| Label | label-medium |
| Mark | Icon 16 (stroke 2.2) or an 8 px dot in `--tone` |

Badge (`.badge` inside `.badge-host`):

| Variant | Value |
|---|---|
| Small | 6 × 6 `error` dot, top-right of the icon |
| Large | 16 high, min width 16, padding 0 4, full corners, `error` / `on-error`, label-small, tabular |

Badges sit on icons (rail, app bar). A small badge needs an accessible text alternative nearby.

### 4.12 Avatar and list

| Part | Value |
|---|---|
| Avatar | 40 circle (32 with `.s`), title-medium initials, `--tone-container` / `--on-tone-container` |
| Emphasis avatar | `.shape`: `cookie-6` |
| Tint | Chosen from the name: primary, violet, teal, warning or rose by character-code sum |
| Person cell | Avatar, then name (title-small, `on-surface`) and email (body-medium `on-surface-variant`, truncates at 260, 200 under 840) |
| List item | Min 56, padding 8 16, gap 16, `surface-container-lowest`, corner 4 |
| Segmented list | Items 2 apart; first item's top corners and last item's bottom corners 16 |
| Text | Overline label-medium; headline body-large; supporting body-medium |

### 4.13 Card

| Variant | Container |
|---|---|
| `elevated` | `surface-container-low`, level 1 |
| `filled` | `surface-container-highest` |
| `outlined` | `surface`, 1 px `outline-variant` |

Corner 12, padding 16.

KPI card: `surface-container`, corner 16, padding 16, gap 16. Label title-small `on-surface-variant`; icon in a 40 px library shape filled with `--tone-container`; number display-small, tabular. Grid of four columns, two under 1200 px; gap 12 (8 under 600). KPI totals ignore search and filters.

### 4.14 Top app bar

| Variant | Value |
|---|---|
| Small | Min 64; padding 8 8 8 16; title title-large; subtitle label-medium `on-surface-variant` |
| Medium | Min 112; actions on the top row; title headline-medium on its own row below |
| Scrolled | `surface-container` once content scrolls under it |
| Actions | Icon buttons, then at most one filled button (8 px left margin). Under 840 the button collapses to its icon |

### 4.15 Navigation rail

| Part | Collapsed | Expanded |
|---|---|---|
| Width | 96 | 240 |
| Head | Menu icon button, then a 56 flat FAB (`primary-container`) | Menu-open icon button, then an extended FAB |
| Item | Column: indicator, then label-medium label | Row: indicator spans the full width |
| Indicator | 56 × 32, full corners | Full width × 56, full corners, padding 0 16, label-large label, count at the end |
| Active (`aria-current="page"`) | `secondary-container` / `on-secondary-container`; label `on-surface` | same |
| Section label | hidden | label-large `on-surface-variant` ("Hiring") |
| Badge | Large badge on the icon | Replaced by the count |
| Tooltip | To the right of each item | none |

Width, indicator size and FAB width animate on the default spatial spring; the FAB label fades on the fast effects spring.

### 4.16 Data table

| Part | Value |
|---|---|
| Container | `surface-container-lowest`, 1 px `outline-variant`, corner 16 |
| Table | Min width 880, scrolls horizontally |
| Header | 56 high, label-large `on-surface-variant`, bottom divider |
| Row | 72 high, body-medium `on-surface-variant`, divider `outline-variant`; first column 24 from the edge |
| Hover | 8% `on-surface` layer |
| Selected | `secondary-container`; text `on-secondary-container` |
| Check column | 56 wide, checkbox with its 40 target |
| Actions column | Right-aligned standard icon buttons |
| Empty value | `—` in `outline`, `aria-label="Not added"` |

Sort headers (`.th-sort`): pill button with an 18 px arrow that is invisible at rest, 60% on hover, and `primary` when sorted (rotated 180° for descending on the default spatial spring). `aria-sort` on the sorted `<th>`. Cycle: text and rank A–Z first, dates newest first, second click reverses, third resets to the default (Updated, newest first). Empty values sort last; ties fall back to the default then to id.

Under 840 px rows become two-column cards (header hidden, each cell labelled from `data-label`, checkbox top-right, actions right-aligned).

### 4.17 Floating toolbar

| Part | Value |
|---|---|
| Container | 64 high, padding 0 8, full corners, level 3 |
| Standard | `surface-container` / `on-surface` |
| Vibrant | `primary-container` / `on-primary-container` |
| Content | Label (title-medium) then icon buttons |

Bulk actions on a table use a vibrant floating toolbar centred 16 px above the table's bottom edge. It slides up on the fast spatial spring when the first row is selected and away when the selection clears; while hidden its buttons leave the tab order. The table adds 88 px of bottom padding while it shows.

### 4.18 Pagination

| Part | Value |
|---|---|
| Footer | Min 64, padding 8 12 8 24, top divider, body-medium `on-surface-variant`, tabular |
| Rows per page | Dropdown filter chip (10, 25, 50) |
| Range | "41–50 of 236" |
| Step buttons | Standard icon buttons: first, previous, next, last; disabled at the ends |
| Page buttons | 40 round, label-large |
| Current page | `secondary-container`, corner 12 (morphs from round) |
| Slots | All pages up to 7; otherwise `1 2 3 4 5 … n`, `1 … n-4 … n`, or `1 … p-1 p p+1 … n` |
| Under 840 | Numbers hide; "Page n of m" shows; "Rows per page" label hides |

Changing rows per page keeps the first visible row on screen.

### 4.19 Empty state

| Part | Value |
|---|---|
| Box | Centred column, gap 8, max width 400, padding 56 24 |
| Shape | 96, `clover-4`, `tertiary-container` with a 40 px `on-tertiary-container` icon, 16 below |
| Title | title-large `on-surface` |
| Text | body-medium `on-surface-variant`, 16 below |
| Action | One button: filled to create the first record, tonal to clear filters |

### 4.20 Progress indicators

| Indicator | Values | Use |
|---|---|---|
| Loading indicator (`.loading`) | 48 container, shape inset 10%, `primary`; morphs through 7 shapes (about 650 ms each) while turning 3 full turns per 4.55 s cycle | Waits under about 5 seconds; inside busy buttons (28) |
| Contained (`.loading.contained`) | 48 `primary-container` circle, `on-primary-container` shape | On busy content |
| Wavy linear (determinate) | SVG: 4 px `primary` sine wave (amplitude 3, wavelength 40) drifting 40 px per second, clipped at the value; 4 px `secondary-container` track after an 8 px gap; 2 px stop dot at the end | Longer tasks with known progress |
| Linear (indeterminate) | 4 high, `secondary-container` track, `primary` bar moving on the slow spatial curve | Unknown progress |
| Circular (indeterminate) | 48, 4 px stroke | Legacy contexts |

Indicators carry `role="progressbar"`, an `aria-label`, and for determinate ones `aria-valuenow`.

### 4.21 Menu

| Part | Value |
|---|---|
| Container | `surface-container`, corner 16, padding 4, level 2, min 200, max min(320, 100vw - 24) |
| Groups | `.menu-group`, items 2 apart, groups 8 apart |
| Item | Min 48, padding 0 12, corner 12, label-large `on-surface`, icon 20 `on-surface-variant` |
| Selected (`aria-checked="true"`) | `tertiary-container` / `on-tertiary-container`, corner 16, leading check |
| Danger item | `error` text and icon |
| Separator | 1 px `outline-variant`, margin 4 12 |
| Status options | Leading 10 px tone dot |
| Entrance | Grows from its anchor (scaleY .6, -8 px) on the fast spatial spring |
| Popover (`.menu.pop`) | 340 wide, padding 16, corner 28, `surface-container-high`; title label-large; filter-chip presets; outlined date fields |

Placement: 4 px below the anchor, flipped above when needed (origin flips too), clamped 12 px inside the viewport, repositioned on scroll, closed on resize. One menu at a time; clicking its trigger again closes it. Focus moves to the selected item or the first; Arrow keys wrap, Home and End jump, Enter selects, Escape closes and returns focus, Tab closes. Roles: `menu`, `menuitem` or `menuitemradio` with `aria-checked`, `separator`; popovers are `role="dialog"` with a label.

### 4.22 Tooltips

| Variant | Value |
|---|---|
| Plain (`.tip`) | `inverse-surface` / `inverse-on-surface`, corner 4, padding 4 8, min height 24, max width 200, body-small |
| Rich (`.tip.rich`) | `surface-container`, corner 12, padding 12 16 8, max 312, title-small subhead + body-medium, level 2 |
| Placement | Centred 4 px above (below if no room); 8 px to the right on the rail; clamped 8 px inside the viewport |
| Motion | Scales from 0.8 on the fast spatial spring and fades on the fast effects spring |
| Layer | Top layer (`popover="manual"`), so it shows over dialogs |

Shown on mouse hover and keyboard focus, never on touch (`hover: none` hides it). Hidden on press, focus out and scroll. The text always repeats the control's `aria-label`.

### 4.23 Snackbar

One host, `<div class="snackbars hidden" id="snackHost" aria-live="polite" popover="manual">`.

| Part | Value |
|---|---|
| Position | Bottom centre, 24 above the safe area |
| Container | `inverse-surface`, corner 4, level 3, min height 48, width 344–672 (full width minus 32 on small screens), padding 6 4 6 16 |
| Text | body-medium `inverse-on-surface` |
| Action | Text button in `inverse-primary` |
| Close | Icon button, shown with an action or on request |
| Timing | 4 s; 6 s with an action |
| Motion | In: rises 24 px from 80% height on the fast spatial spring. Out: fades on the fast effects spring |

API: `snackbar(text, { action, onAction, close })`; an empty text dismisses. One at a time: a new message replaces the current one and restarts its timer. The host is raised into the top layer each time, and while a modal dialog is open it moves inside it so its buttons stay clickable, returning to `<body>` when the dialog closes.

Snackbars confirm results and offer undo. They do not carry status colour: tone is expressed by the words and the action ("Retry", "Undo").

### 4.24 Dialog

`<dialog class="dialog">` opened with `showModal()`, containing `form.dialog-card`.

| Part | Value |
|---|---|
| Width | 280–560 (and 48 less than the viewport) |
| Container | `surface-container-high`, corner 28, padding 24 (20 under 600), level 3 |
| Scrim | `scrim` at 32%, default effects fade |
| Icon | Optional, 24, `secondary`, centred, 16 above the headline; the headline then centres |
| Headline | headline-small `on-surface`, 16 below |
| Supporting text | body-medium `on-surface-variant` |
| Body | Column, gap 16, scrolls if tall |
| Actions | Right-aligned, gap 8, 24 above: text dismiss, then the confirm button (filled, or `danger` for destructive) |
| Motion | In: from -16 px and 88% scale on the default spatial spring. Out: fade to 96% on the fast effects spring, closed after 160 ms |

Validation: submit clears errors, validates every field, shows all errors at once, focuses the first invalid field and keeps the dialog open; each error clears as soon as its field is fixed; a valid submit closes the dialog and confirms with a snackbar. Escape, the dismiss button and a click on the scrim close it. The dialog is labelled by its headline and described by its supporting text.

Destructive confirmation: a question headline ("Cancel this schedule?"), an alert icon, supporting text that names the record, "Keep schedule" as the text dismiss and "Cancel schedule" as a `danger` confirm.

### 4.25 Side sheet

Detached modal side sheet: `<dialog class="side-sheet">` with `.sheet-card`.

| Part | Value |
|---|---|
| Position | Right edge, inset 16 on all sides, full height minus 32 |
| Width | min(400, 100vw - 32) |
| Container | `surface-container-low`, corner 16, level 1 |
| Header | Min 72, padding 12 12 16 24; headline-small; subtitle body-medium; close icon button |
| Body | Segmented list (4.12) of label / value rows, padding 0 16 16, scrolls |
| Actions | Top divider, padding 16 24 24, gap 8: primary action first, then a `danger-text` or text secondary |
| Motion | Slides in from the edge on the default spatial spring; out on the default effects spring |

Actions that open a dialog close the sheet first and open the dialog after its exit.

### 4.26 Sign-in card

| Part | Value |
|---|---|
| Card | `surface-container-low`, corner 28 (16 under 600), padding 40 32 32 (32 20 24), max width 448 |
| Heading | Centred, 24 below: headline-large "Sign in" (28 / 36 under 600), body-large subtitle |
| Fields | Filled text fields with leading icons, 16 apart; password with reveal |
| Button | Medium filled, full width, 24 above, "Continue"; busy shows a loading indicator |
| Form | `method="post"` and `novalidate` |

Validation as 4.24. A rejected sign-in shows its message under the password field; a network failure shows a snackbar.

## 5. Composition

### 5.1 List screen

| Order | Element |
|---:|---|
| 1 | Navigation rail (4.15) at the leading edge |
| 2 | Small top app bar (4.14) with title, subtitle, global icon buttons and one filled action |
| 3 | KPI cards (4.13) |
| 4 | Search bar (4.9) and dropdown filter chips (4.10), with "Clear filters" when active |
| 5 | Data table (4.16) with its floating toolbar (4.17) and footer (4.18); empty state (4.19) when there are no rows |

| Task | Component |
|---|---|
| Create a record | FAB or the app-bar filled button → dialog with fields |
| Several creation types | FAB menu |
| Read a record | Side sheet |
| Change a status in place | Menu from a status chip or a connected group |
| Narrow a list | Search bar and filter chips |
| Act on many rows | Checkboxes → vibrant floating toolbar |
| Confirm a destructive action | Dialog with a danger confirm |
| Confirm a result | Snackbar, with Undo when reversible |
| Explain an unavailable action | `aria-disabled` icon button with a tooltip |
| Show a short wait | Loading indicator |

### 5.2 Status to tone

| Record | Status | Tone | Mark |
|---|---|---|---|
| Job | Open | success | dot |
| Job | On hold | warning | dot |
| Job | Closed | neutral | dot |
| Job | Published | teal, pill | check |
| Candidate | Profile ready | violet | user-check |
| Candidate / schedule | Scheduled | primary | clock |
| Candidate / schedule | Completed | success | check-circle |
| Schedule | Cancelled | error | x-circle |
| Metric | Invites sent | teal | send |
| Report | With recording | rose | video |

A status keeps its tone everywhere: status label, KPI shape, menu dot.

## 6. States and layering

### 6.1 State matrix

| State | Shown by |
|---|---|
| Hover | 8% state layer; filled and tonal buttons gain level 1; FAB gains level 4 |
| Focus | 10% state layer plus a 3 px `secondary` outline |
| Pressed | 10% layer, ripple, corner morph (buttons, icon buttons, chips, sort headers), growth in standard groups, larger switch thumb |
| Selected | Shape morph and colour change (toggle buttons, connected groups); secondary-container (chips, rows, rail, current page); tertiary-container (menu items) |
| Open | `aria-expanded="true"`: chip corner 12 and chevron flip; split trailing circle; FAB menu close mark |
| Disabled | Content 38%, container 10%; icon buttons via `aria-disabled` with tooltip |
| Busy | Loading indicator replaces the label; `aria-disabled`, `aria-busy` |
| Error | `error` outline or indicator, label and support text |

### 6.2 Layers

| Layer | z-index | Mechanism |
|---|---:|---|
| Showcase top bar | 50 | Sticky |
| Menus and popovers | 80 | Fixed, appended to `<body>` |
| Tooltip | 100 | Top layer |
| Snackbar host | 120 | Top layer; moved inside an open modal |
| Dialog, side sheet | top layer | `showModal()` with `::backdrop` |

Rules: one menu at a time; tooltips and snackbars may show above modals, nothing else does; a sheet closes before a dialog opens; Escape closes the innermost layer and focus returns to its trigger.

## 7. Accessibility

### 7.1 Semantics and keyboard

| Concern | Implementation |
|---|---|
| Controls | Native buttons, inputs, selects, `<dialog>`, `<table>` |
| Icon-only controls | `aria-label` with a matching tooltip |
| Toggles | `aria-pressed`; connected groups `role="radiogroup"` / `radio` with `aria-checked`; switches `role="switch"` |
| Current page | `aria-current="page"` (rail, pager) |
| Sorting | `aria-sort` |
| Disclosure | `aria-haspopup`, `aria-expanded` |
| Fields | Real `<label>`s, `aria-invalid`, `aria-describedby` to supporting text, polite live errors |
| Progress | `role="progressbar"` with label and value |
| Live messages | Snackbar host `aria-live="polite"`, snackbar `role="status"` |
| Decorative graphics | Icons, shapes, avatars `aria-hidden` |
| Floating toolbar | Buttons removed from the tab order while hidden |

| Key | Action |
|---|---|
| Tab / Shift-Tab | Move between controls; closes an open menu |
| `/` | Focus the search bar |
| Arrows, Home, End | Move within a menu |
| Enter / Space | Activate |
| Escape | Close the menu, FAB menu, dialog or sheet; focus returns to the trigger |

### 7.2 Measured contrast (default seed)

| Pair | Light | Dark |
|---|---:|---:|
| Every accent and extended role on its on-role, and container on on-container | 6.4:1 or better | 7.2:1 or better |
| `on-surface-variant` on `surface` | 8.86:1 | 10.95:1 |
| `outline` on `surface` | 4.27:1 | 5.86:1 |
| `outline-variant` on `surface` | 1.61:1 | 1.99:1 |

Because roles sit at fixed tones, every text pair clears WCAG AA for any seed. `outline-variant` is decorative (dividers, chip outlines); controls that must be found by their border use `outline` (3:1 or better). Contrast was calculated from the role values, not audited with assistive technology.

### 7.3 Motion and input

Reduced motion removes springs, ripples and morphs. Touch devices never show tooltips or the `/` hint. Touch targets are at least 40 px (checkboxes and switches through their 40 px targets).

## 8. Content and voice

| Element | Convention | Examples |
|---|---|---|
| Case | Sentence case | "Add job", "Rows per page" |
| Buttons | Verb plus object | "Create schedule", "Export CSV" |
| Dialog dismiss | The safe outcome | "Keep schedule" |
| Destructive headline | A question | "Cancel this schedule?" |
| Field errors | Imperative, how to fix, period | "Enter a job title.", "Enter an email like name@example.com." |
| Optional fields | "(optional)" in the label; required is unmarked | "Location (optional)" |
| Snackbars | Short result; action names the reversal | "Schedule created." + "Undo" |
| Empty states | What is missing, then what to do | "No candidates match these filters" |
| Disabled reasons | Short state phrase in the tooltip | "Already published" |
| Dates and ranges | "21 Sep 2026", "1:03 PM", en dash ranges | "41–50 of 236" |
| Product name | Placeholder only | "Product name" |

## 9. Window size classes

Breakpoints follow Material's window size classes.

| Class | Width | Changes |
|---|---|---|
| Compact | under 600 | KPI gap 8 and smaller numbers; sign-in card padding 32 20 24, corner 16, smaller headline; dialog padding 20; snackbar full width |
| Medium | 600–839 | Table rows become cards; pager shows "Page n of m"; app-bar button collapses to its icon; email truncates at 200 |
| Expanded | 840–1199 | KPI grid two columns; the showcase hides its section list |
| Large and up | 1200+ | Full layout; KPI grid four columns |
| `hover: none` | | Tooltips and the `/` hint hidden |
| Reduced motion | | 2.6 |
| Safe areas | | Snackbar offset includes `env(safe-area-inset-bottom)` |

## 10. Migration from version 1.0

| Version 1.0 | Version 2.0 (M3 Expressive) |
|---|---|
| Fixed hex tokens (`--brand`, `--surface`, `--text-2` …) | Generated colour roles from a seed (2.1) |
| Tones `--ok`, `--warn`, `--info` … with `-soft` pairs | Extended roles with container pairs; info → primary, ok → success, warn → warning, danger → error (2.2) |
| Geist, 14 px base, custom role sizes | Material type scale in the brand and plain faces (2.3) |
| Radius 6–24 and 999 | M3E corner scale 0–48 and full, plus the shape library (2.4) |
| Shadows raise / pop | Elevation levels 0–5, tonal containers first (2.5) |
| `--ease` and `--spring` cubic-béziers with fixed durations | Expressive spring tokens as `linear()` curves (2.6) |
| Hover backgrounds `--hover`, `--press` | State layers and ripple (2.7) |
| Button 40 / 34, pill only | Five sizes, round or square, corner morph, toggles (4.1) |
| Icon button 34, radius 10 | Five sizes, three widths, four styles, toggle (4.2) |
| Segmented filters, "Clear filters" ghost button | Connected button group; text button (4.3) |
| — | Split button, FAB and FAB menu, switch, floating toolbar, loading indicator, wavy progress (new) |
| Search field 40 | Search bar 56 (4.9) |
| Filter chip 40, brand-soft active | Chip 32, secondary-container selected with check (4.10) |
| Badge (status pill) and tag | Status label from tone containers; tags fold into it (4.11) |
| Status select | Dropdown filter chip or connected group opening a menu (4.10, 4.21) |
| Avatar 38 rounded square | Avatar 40 circle, optional library shape (4.12) |
| KPI card, bordered | KPI card on surface-container with a shaped icon (4.13) |
| Page header | Top app bar small / medium (4.14) |
| Sidebar navigation items | Navigation rail, collapsed and expanded (4.15) |
| Panel and data table, brand-soft selection | Outlined table container, secondary-container selection (4.16) |
| Bulk bar inside the panel | Vibrant floating toolbar (4.17) |
| Pager with brand-soft current page | Pager with a tonal square current page (4.18) |
| Empty state with a 52 tile | Empty state with a 96 clover shape (4.19) |
| Menu, radius 16 | Expressive menu with rounded items and tertiary selection (4.21) |
| Tooltip, inverse, radius 8 | Plain tooltip, radius 4; rich tooltip added (4.22) |
| Toast: inverse pill, tone icons, 2.8 s | Snackbar: inverse, radius 4, action and close, 4–6 s, no tone icons (4.23) |
| Dialog, radius 24 | Dialog, radius 28, optional icon, text dismiss (4.24) |
| Details sheet, full height | Detached side sheet with a segmented list (4.25) |
| Form card | Sign-in card on surface-container-low, filled fields, medium button (4.26) |

Section numbers changed for several components (for example, the toast was 4.20 and the snackbar is 4.23). Update code comments that cite version 1.0 numbers.

## 11. Verification and acceptance criteria

### 11.1 Checks performed

`components.html` was exercised in Chromium (Playwright, headless) at 1440 × 900 and 390 × 844 (mobile, touch), and with reduced motion. Full-page screenshots in both themes and with another seed were inspected.

| Check | Observed result |
|---|---|
| In-page colour generator against the static CSS roles, light and dark | All sys and ext roles identical |
| Seed picker | Orange seed regenerates roles (primary becomes `#A83800`) |
| Spring tokens | Button transitions compute to 0.348 s with the `linear()` curve |
| Sorting | Name A–Z; empty role sorts last |
| Selection | Two rows selected; vibrant toolbar shows "2 selected" |
| Connected group | Selecting "On hold" checks only that item |
| Menu | Opens focused on the selected item; arrow and Enter select; chip shows "Open" and turns selected |
| Date popover | "Last 7 days" sets the chip to a date range |
| Dialog validation | Both errors at once, focus on the first; error clears on fix; valid submit closes and shows a snackbar |
| Snackbar over a dialog | Host moves into the dialog; its Undo action works; host returns to `<body>` on close |
| Schedule from a row | Dialog opens with the candidate; submit marks the row Scheduled |
| Side sheet | Opens; its action closes it |
| FAB menu | Opens; Escape closes |
| Rail | The collapsed rail expands to 240 |
| Sign-in | Empty submit shows errors and focuses email; valid submit shows the busy loading indicator |
| Tooltip | Shows above the control on hover |
| Pager | Page 5 of 24 shows `1 … 4 5 6 … 24` and "41–50 of 236" |
| `/` shortcut | Focuses the search bar |
| Horizontal overflow | None at 1440 or 390 |
| JavaScript errors | None |

These checks are not a cross-browser, physical-device or assistive-technology audit. `linear()` needs Chrome 113, Safari 17.2 or Firefox 112 or later; older browsers fall back to linear timing.

### 11.2 Acceptance criteria

- Every colour is a role; changing the seed or theme recolours every component.
- Roles sit at the tones in 2.1 and 2.2, so text pairs clear 4.5:1.
- Depth uses surface containers first; only floating components cast shadows.
- Buttons and icon buttons offer the five sizes, morph corners on press and shape on selection.
- Spatial changes use spatial springs; colour and opacity use effects springs.
- State layers appear at 8 / 10 / 10 / 16%; disabled content is 38%.
- Library shapes decorate and emphasise; they never contain text.
- One filled action per view, one menu, one snackbar.
- Snackbars stay usable above modals.
- Keyboard, ARIA and live-region behaviour match section 7.
- Window-size behaviour matches section 9; reduced motion removes motion.
- No external requests; no product name.

## 12. Guidance for future changes

Treat the ten rules in 1.3 as the identity of the system. A new component should be explainable by them: its colours by roles, its depth by containers, its corners by the scale, its motion by the spring tokens.

To rebrand, change the seed. To match Google's Material Theme Builder exactly, export its roles for your seed and replace the static values in section 2.1 (and the generator's defaults).

Add status colours as extended roles with all four members in both themes. Do not use raw hex in components.

Use the expressive spring scheme for primary interactions and the standard scheme for dense, repeated or utilitarian motion. Keep spatial and effects springs separate.

Keep section numbers stable and append new components at the end of section 4. Update this document whenever a token, size, state, behaviour or copy rule changes; section 13 is extracted from `components.html` between the `@components:start` and `@components:end` markers.

## 13. Complete implementation

### 13.1 Files

| File | Content |
|---|---|
| `components.html` | The reference page: component stylesheet, icon sprite, all components in both themes, the seed-based colour generator and reference behaviour |
| `DESIGN.md` | This specification |

### 13.2 Behaviour reference

| Function | Responsibility | Section |
|---|---|---|
| `tone`, `scheme`, `applySeed` | Tone search, role generation, live seed switching | 2.1 |
| `syncTheme`, `toggleTheme` | Theme attribute and toggle | 2.1 |
| ripple handler | Ripple from the pointer on `.sl` elements | 2.7 |
| `showTip`, `hideTip` | Tooltip placement and triggers | 4.22 |
| `snackbar`, `snackHost`, `homeSnackHost` | Snackbar: one at a time, actions, modal handling | 4.23 |
| `place`, `showFloating`, `closeFloating`, `openMenu`, `openDatePop` | Menus and popovers | 4.21 |
| `openDialog`, `field`, `closeModal`, `prepModal`, `setContent` | Dialogs, fields, validation | 4.24, 4.8 |
| `openSheet`, `sheetHtml` | Side sheet | 4.25 |
| `railHtml`, `rail-toggle` | Navigation rail | 4.15 |
| `cmp`, `renderTable`, `syncSelection` | Sorting, selection, floating toolbar | 4.16, 4.17 |
| `pageList`, `renderPager` | Pager | 4.18 |
| `renderWavy` | Wavy progress | 4.20 |
| `setError`, `RULES`, `setBusy` | Field errors and busy buttons | 4.8, 4.1 |
| `tint`, `initials` | Avatar colour and letters | 4.12 |

### 13.3 Component stylesheet

The complete component layer, verbatim from `components.html`. The `.sc-*` showcase layout is not part of it.

```css

```
