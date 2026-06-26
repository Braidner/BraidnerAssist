---
name: react-tailwind-v4
description: >-
  Expert guidance for building and styling React components, pages, and UIs with
  Tailwind CSS v4. Use this skill whenever the user asks to build, style, or refactor
  any React/Next.js UI with Tailwind — even if they don't say "v4" or "Tailwind"
  explicitly. Triggers include: creating buttons/cards/forms/layouts/navbars with
  utility classes, setting up Tailwind (`@theme`, `@import "tailwindcss"`), choosing an
  `oklch()` color palette or theming/dark mode, writing or using a `cn()` class-merge
  helper (`clsx` + `tailwind-merge`), making a layout responsive/mobile-first, or
  migrating a `tailwind.config.js` from v3 to v4. Prefer this skill over ad-hoc CSS
  whenever utility-first React styling is involved.
---

# React & Tailwind CSS v4 Specialist

Generate React UIs that are idiomatic for **Tailwind CSS v4** and modern React. Default to
v4 conventions unless the user explicitly says they're on v3.

## 1. Tailwind v4 architecture

- **CSS-first configuration.** Configure design tokens with the `@theme` directive inside the
  main CSS file, not `tailwind.config.js`. v4 reads theme tokens from CSS, which keeps tokens
  and styles co-located and removes a build-time JS dependency. Only generate a
  `tailwind.config.js` when the user explicitly targets v3.
- **Import once.** Start the stylesheet with `@import "tailwindcss";` — v4 replaces the old
  `@tailwind base/components/utilities` triple.
- **`oklch()` color model.** Define colors in `oklch()`. Its perceptual uniformity gives more
  predictable text contrast across shades and makes programmatic theming (lightness ramps,
  dark mode) reliable.
- **Utility-first layout.** Reach for exact layout utilities (`flex`, `grid`, `inline-flex`,
  gap/spacing/sizing scales) instead of writing loose custom CSS. Custom CSS is a fallback for
  things utilities genuinely can't express, not a default.

See `references/tailwind-v4.md` for concrete `@theme` token examples, theming/dark-mode setup,
and v3→v4 migration notes.

## 2. React UI patterns

- **Typed, modular components.** Write small, composable, fully typed components (explicit prop
  interfaces; `React.FC` or a plain typed function — match the surrounding codebase). Keep an
  eye on the server/client split: don't add `"use client"`, event handlers, or browser-only
  hooks to a component that can stay a server component.
- **Always merge classes with `cn()`.** Use a `cn(...)` helper wrapping `clsx` (conditional
  classes) and `tailwind-merge` (dedupe conflicting Tailwind utilities so a caller's
  `className` can override defaults). Without `tailwind-merge`, `px-2` and a passed `px-4`
  both land in the class list and specificity becomes a coin flip.
- **Mobile-first responsive.** Author base styles for small screens, then layer `sm:`/`md:`/
  `lg:`/`xl:` for larger ones. Bare utilities are the mobile case by design.

See `references/component-patterns.md` for the canonical `cn()` helper and example components.

## 3. Code-generation rules

- **No redundant wrappers.** Don't add wrapper `<div>`s or custom classes when a native,
  semantic element plus utilities already expresses the intent. Less markup is easier to read
  and restyle.
- **Accessible by default.** Produce semantic, accessible markup: real `<button>`/`<nav>`/
  `<main>`/`<label>` elements, associated form labels, ARIA attributes only where semantics
  fall short, visible focus states, and adequate contrast (easy to verify in `oklch`).
- **Match the codebase.** Mirror existing import style, component conventions, and token names
  rather than imposing a new convention.
