# Tailwind CSS v4 reference

Table of contents:
1. [Install & import](#1-install--import)
2. [`@theme` tokens](#2-theme-tokens)
3. [oklch color palette](#3-oklch-color-palette)
4. [Dark mode & theming](#4-dark-mode--theming)
5. [v3 → v4 migration](#5-v3--v4-migration)

## 1. Install & import

```bash
npm install tailwindcss @tailwindcss/postcss   # PostCSS setup
# or, for Vite:
npm install tailwindcss @tailwindcss/vite
```

PostCSS (`postcss.config.mjs`):

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

Vite (`vite.config.ts`): add the `@tailwindcss/vite` plugin to `plugins`.

Main stylesheet — a single import, no `@tailwind` directives:

```css
@import "tailwindcss";
```

## 2. `@theme` tokens

Tokens live in CSS. Each `--<namespace>-<name>` variable becomes a utility (e.g.
`--color-brand-500` → `bg-brand-500`, `text-brand-500`; `--radius-card` → `rounded-card`).

```css
@import "tailwindcss";

@theme {
  --font-sans: "Outfit", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Inconsolata", ui-monospace, monospace;

  --color-brand-50:  oklch(0.97 0.02 152);
  --color-brand-500: oklch(0.72 0.15 152);
  --color-brand-700: oklch(0.55 0.14 152);

  --radius-card: 1.25rem;
  --spacing-gutter: 1.5rem;
}
```

## 3. oklch color palette

`oklch(L C H)` — Lightness `0..1`, Chroma (saturation), Hue `0..360`. Build a shade ramp by
holding hue/chroma and stepping lightness, which keeps perceived contrast even:

```css
@theme {
  --color-accent-100: oklch(0.95 0.03 165);
  --color-accent-300: oklch(0.85 0.09 165);
  --color-accent-500: oklch(0.72 0.15 165);
  --color-accent-700: oklch(0.55 0.14 165);
  --color-accent-900: oklch(0.38 0.10 165);
}
```

Use accent shades for text-on-surface pairs and verify contrast (the lightness channel makes
WCAG ratios predictable).

## 4. Dark mode & theming

Override token variables under a selector/media query; utilities resolve to the active value.

```css
@import "tailwindcss";

/* class-based dark mode: <html class="dark"> */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --color-bg: oklch(0.99 0 0);
  --color-fg: oklch(0.20 0.01 250);
}
.dark {
  --color-bg: oklch(0.18 0.01 250);
  --color-fg: oklch(0.95 0.01 250);
}
```

Then `bg-bg text-fg` follow the theme automatically. Toggle by adding/removing `dark` on the
root element.

## 5. v3 → v4 migration

- Replace `@tailwind base; @tailwind components; @tailwind utilities;` with `@import "tailwindcss";`.
- Move `theme.extend` values from `tailwind.config.js` into `@theme { ... }` as CSS variables
  (`colors.brand.500` → `--color-brand-500`, `borderRadius.card` → `--radius-card`).
- Swap the PostCSS plugin: `tailwindcss` + `autoprefixer` → `@tailwindcss/postcss`
  (vendor-prefixing and import handling are built in).
- `tailwindcss-cli` users: `npx @tailwindcss/cli -i in.css -o out.css`.
- Keep a JS config only for plugins not yet expressible in CSS; load it with
  `@config "./tailwind.config.js";` if needed.
- Run the official codemod for a first pass: `npx @tailwindcss/upgrade`.
