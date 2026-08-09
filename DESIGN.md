---
name: Pultra
description: A dark, red-glow instrument cockpit for a self-hosted personal life dashboard — dense control chrome married to a full-bleed media theatre.
colors:
  accent-red: "#e53333"
  accent-ink: "#1a0505"
  page: "#09090d"
  surface: "#0e1018"
  raise: "#121622"
  surface-2: "#171b28"
  ink: "#dce4f0"
  ink-soft: "#8896aa"
  muted: "#4e5c72"
  faint: "#1e2434"
  hair: "#ffffff0b"
  warn: "#e3a93f"
  bad: "#e06b8a"
  info: "#6f9ce8"
typography:
  hero:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "5.25rem"
    fontWeight: 800
    lineHeight: "1"
    letterSpacing: "normal"
  cinematic:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2.875rem, 6vw, 4.25rem)"
    fontWeight: 700
    lineHeight: "1.02"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "normal"
  body:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "normal"
  label:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "0.65625rem"
    fontWeight: 500
    lineHeight: "1.2"
    letterSpacing: "0.16em"
  data:
    fontFamily: "Syne, system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1.3"
    letterSpacing: "0.05em"
    fontFeature: "'tnum' 1"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  card: "19px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.accent-ink}"
  button-outline:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-ghost:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-destructive:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.bad}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  badge-accent:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.accent-red}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Pultra

## 1. Overview

**Creative North Star: "The Cinematic Cockpit"**

Pultra is two surfaces sharing one shell. The first is a tight instrument cluster — tasks, homelab services, agent logs, system gauges — where information density is the whole point and nothing moves that doesn't have to. The second is a full-bleed media theatre — hero backdrops, 68–84px titles, auto-hiding chrome, HLS playing straight into the hero background. The single red accent (`#e53333`) is the wire that runs between them: it marks the live thing on the console and the play button in the theatre, and almost nothing else.

The room is dark by default and stays dark. Surfaces are near-black and separated by tonal steps (`#09090d` → `#0e1018` → `#121622` → `#171b28`) and hairline borders (white at 4.5% opacity), never by drop shadows. This is a **flat** system — the CLAUDE.md still refers to an older "neomorphism" pass, but that soft-shadow language has been fully replaced; depth here is layering and light, not embossing. The one place real shadow appears is the media grid on hover, where a card lifts and casts a deep cinematic drop shadow. Everything is built for one operator reading many instruments at once: a dense fixed-rem type ramp (down to 8px), monospaced tabular figures, uppercase tracked labels, and a red glow that means "attention" wherever it lands.

What this system rejects: soft embossed neumorphism, pastel SaaS gradients, glassmorphism as a default surface, and decorative motion. Chrome is quiet so the data and the poster art can be loud.

**Key Characteristics:**
- Dark-first, near-black tonal layering; hairline borders instead of shadows.
- Syne carries the console (display, UI, labels, tabular figures); Oswald is the cinematic display face for the media theatre only.
- One red accent, used as a live-status signal — never as decoration.
- Extreme density on the console side; full-bleed cinema on the media side.
- Fixed rem type scale for UI; fluid only where the media hero is genuinely cinematic.

## 2. Colors

A near-black substrate, a cool-slate ink, and a single hot red that does all the signalling. Warm amber, pink-red, and cornflower blue appear only as semantic status colors.

### Primary
- **Signal Red** (`#e53333`): The one accent. Primary action buttons, current selection, focus rings, live-status dots, the media play button, and — deliberately — the "OK/success" state. It ships with three glow shadows (`--accent-glow-sm/glow/glow-lg`, red at 34/52/58%) that are the system's only expressive shadow. On text it becomes a soft text-shadow halo, never a fill.
- **Accent Ink** (`#1a0505`): The near-black oxblood that sits *on* Signal Red (button labels, badge text on solid red). Chosen over pure white so solid-red controls read as warm and dense, not neon.

### Neutral (Dark — default)
- **Console Black** (`#09090d`): The page. The darkest layer; the room the instruments sit in.
- **Panel Slate** (`#0e1018`) / **Raise Slate** (`#121622`): The two working surfaces. Panels and cards sit on Raise Slate; the app frame sits on Panel Slate. The gap between them is the depth cue.
- **Hover Slate** (`#171b28`): The next step up — hovered rows, secondary buttons, selected surfaces.
- **Ink** (`#dce4f0`): Primary text. Cool near-white, ~13:1 on Console Black.
- **Ink Soft** (`#8896aa`): Secondary text, quiet button labels, icon strokes.
- **Muted** (`#4e5c72`): Uppercase tracked labels and counts *only*. Too low-contrast for body copy on purpose — its dimness is what makes the labels recede.
- **Faint** (`#1e2434`): Filled gauge tracks, inert chips, the dimmest structural fills.
- **Hairline** (`rgba(255,255,255,0.045)`): The universal border. One value does nearly every division in the UI.

### Light theme (secondary)
The light theme is a **cool slate**, not white — page `#e4e8f0`, surfaces `#e9edf4`/`#eaeef5`, ink `#313847`, hairline `rgba(80,90,110,0.12)`. It preserves the console mood in daylight rather than flipping to a bright paper UI. Signal Red is shared across both themes unchanged.

### Semantic status
- **Warn Amber** (`#e3a93f` dark / `#cf8a1f` light): warnings, degraded services.
- **Bad Pink-Red** (`#e06b8a` dark / `#d2587a` light): errors, destructive actions, offline.
- **Info Blue** (`#6f9ce8` dark / `#4a7dd4` light): informational / neutral highlights.
- **OK = Signal Red.** On the console, "ok/success" reuses the accent (`--ok: var(--accent)`); the console itself carries no green.

### The media pipeline palette (canonical)
The **media** register is the product's design lead, and it carries a richer, deliberate multi-hue **pipeline-status** palette — one hue per stage of a title's journey, so state is glanceable at a distance (Sonarr/Radarr-style):
- **watchlist → sky** (`sky-400`), **release_selected → amber**, **downloading → red accent** (the live stage), **awaiting_jellyfin → violet**, **in_library / watched → emerald**. Ratings use a single **gold**.

This is not console drift — it is media's own vocabulary, and it wins inside the media theatre. Red still means the *active/live* stage; the other hues mark settled or pending states that are not competing for "live."

### Named Rules
**The One Wire Rule (console).** On the console, Signal Red is a signal, not decoration. It marks the single live or primary thing in a view — one action, one selection, one alert — and its glow is reserved for exactly those. If two red things compete for "the live one," one of them is wrong. (Media relaxes this to its pipeline palette above.)

**The No-Console-Green Rule.** The console shell carries no green — status there is red (live/ok), amber (warn), pink-red (bad), blue (info). Green belongs to the media pipeline (`in_library`/`watched` → emerald) and stays there; do not import a celebration-green into console success states.

## 3. Typography

**UI / Body / Mono Font:** Syne (variable, weights 400–800), with `system-ui, -apple-system, sans-serif` fallback.
**Cinematic Display Font:** Oswald (weights 600–700), with `var(--font)` (Syne) fallback — loaded via the `index.html` Google Fonts link.

**Character:** Syne carries the whole console — display, UI, labels, and (as the "mono" role, same face with `font-feature-settings: "tnum" 1`) tabular figures; there is no separate monospace face in production. The one deliberate second face is **Oswald**, a condensed grotesque used *only* for the cinematic media register: the library/detail hero titles (`text-hero`/`text-cinematic`), the discover section labels, and the giant watermark rank numerals. Its condensed weight is what makes the media theatre read as cinema rather than console. Fixed rem sizing throughout the console; fluid only for the media hero.

### Hierarchy
- **Hero** (800, 5.25rem / 84px, line-height 1): The landing / overview hero headline. The system's loudest voice; used once per view at most.
- **Cinematic** (700, clamp 46→68px, letter-spacing −0.01em): Media detail hero title over a full-bleed backdrop. The one intentionally fluid role (`--text-cinematic` / `--text-cinematic-mob`).
- **Title** (600, 1.125rem / 18px): Page and section headings, drawer titles.
- **Body** (400, 0.8125rem / 13px, line-height ~1.5): Default reading size. Prose caps at 65–75ch; dense tables and tiles run tighter.
- **Label** (500, 0.65625rem / 10.5px, tracking 0.16em, UPPERCASE): Panel titles, section eyebrows, metadata keys. Always `--muted`, always mono-featured.
- **Data** (500, 0.6875rem / 11px, tabular figures): Counts, sizes, ETAs, seeds, gauges — anything numeric that must align in a column.

The full ramp is a 14-step dense scale from `--text-micro` (8px) to `--text-hero` (84px); the six roles above are the load-bearing ones.

### Named Rules
**The Tabular Rule.** Every number that lives in a column or updates in place (speeds, counts, timers, sizes) uses the mono role (`tnum` on). Figures must not reflow horizontally as their value changes.

**The Tracked-Label Rule.** Structural labels are uppercase, `tracking-5` (0.16em), and `--muted`. That combination — small, spaced, dim — is how a label signals "I am chrome, not content." Never set body copy this way; never set a label in sentence case.

## 4. Elevation

This system is **flat**. Surfaces do not cast shadows to convey rank — depth is a four-step tonal ladder (Console Black → Panel Slate → Raise Slate → Hover Slate) plus a single hairline border (white 4.5%). A panel reads as "above" the page because it is one tonal step lighter and outlined by a hairline, not because it floats.

Two exceptions, both deliberate:
1. **The accent glow.** Signal Red controls carry a red-tinted box-shadow (`--accent-glow-sm/glow/glow-lg`). This is a *glow*, not an elevation shadow — it says "live," not "raised."
2. **The media lift.** Library cards, on hover, translate up ~6px, scale to 1.06, and cast a deep cinematic drop shadow (`0 24px 66px rgba(0,0,0,0.78)`) over a slow 950ms expo curve. This is the only place a true black drop shadow is correct — it's the theatre, not the console.

### Named Rules
**The Flat-Console Rule.** On the console (everything that isn't the media theatre), depth is tonal + hairline only. If you reach for a black `box-shadow` to separate two panels, the tonal step is wrong — fix the surface color, not the shadow.

**The Glow-Means-Live Rule.** A red glow is never ambient decoration. It appears on exactly the elements that are live or primary. A resting, non-primary surface never glows.

## 5. Components

### Buttons
Two button systems coexist; both are flat, hairline-bordered, and h-8/h-9.
- **Shape:** `rounded-lg` (10px) for the shadcn button set; `rounded-xl` (~14px) for the legacy `ui.button` helper. Prefer the shadcn `<Button>` for new work.
- **Primary / default:** solid Signal Red on Accent Ink text, with `--accent-glow-sm` at rest deepening to `--accent-glow` on hover (`bg-primary shadow-[var(--accent-glow-sm)] hover:shadow-[var(--accent-glow)]`). The only filled, glowing control.
- **Outline / Secondary / Ghost:** transparent or Panel-Slate fill, hairline border, Ink-Soft text; hover steps the surface to Hover Slate and the text to Ink. These are the workhorses — most controls are not primary.
- **Destructive:** tinted, not solid — `bg-destructive/10 text-destructive`, hover to `/20`. Danger is signalled by pink-red text on a faint pink wash, not a loud fill.
- **States:** every variant carries default / hover / `focus-visible` (3px `ring-ring/50` = red ring) / `active` (translate-y-px press) / `disabled` (opacity-50). Buttons have a built-in async loading state (spinner + optional loading label) driven by returning a promise from `onClick`.

### Inputs / Fields
- **Style:** h-8, `rounded-lg`, hairline border, transparent-to-Surface fill, 13px Ink text, Ink Soft placeholder. Muted stays reserved for structural labels; placeholder copy must remain readable in both themes.
- **Focus:** border shifts to red (`focus-visible:border-ring`) with a 3px red ring (`ring-ring/50`) — the same focus signature as buttons.
- **Error:** `aria-invalid` paints a destructive border + destructive ring. **Disabled:** dimmed fill, `cursor-not-allowed`, opacity-50.

### Cards / Panels
- **Corner style:** `rounded-card` (19px) — noticeably softer than the 10px control radius, so panels read as containers and controls as controls.
- **Background:** Raise Slate (`#121622`) on the page.
- **Border:** a single hairline (`border-hair`); no shadow.
- **Internal padding:** 24px desktop, 18px × 20px on mobile (`max-mob`).
- **Head:** an uppercase tracked mono label (`ui.panelTitle`) with an optional 15px icon, plus a right-aligned action/count slot.

### Badges / Chips
- **Style:** full-pill, mono, 10.5px. Semantic variants (default / accent / warn / bad / ok / outline) all follow one formula: **text in the hue, a 10% wash behind it, a 25–30% border in the same hue.** This tinted-triplet is the house style for every status token.

### Navigation
- **Chrome:** a full-width `TopBar` pinned on top (logo doubles as the burger, no hover flourish) above a `Sidebar`. Desktop sidebar is a 76px icon rail that expands to labels on burger; mobile collapses to a full-screen menu with body-scroll lock.
- **Command palette:** Cmd/Ctrl-K opens `cmdk`-powered navigation + Hermes commands + actions. A first-class affordance, not an afterthought.

### Signature: The Cinematic Hero
The media detail pages (`/media/series|movie/:id`) render a full-bleed backdrop with the Cinematic title (68px) and a play/pause/seek/mute/stop/fullscreen control bar. HLS video plays *into the hero background*; the poster, meta, and controls are a single "player chrome" that slides away together after idle and returns on mouse/touch. This is the theatre half of the cockpit — the one place the flat, dense console rules give way to cinema.

## 6. Do's and Don'ts

### Do:
- **Do** keep the app dark-first. Console Black (`#09090d`) is the page; surfaces climb the tonal ladder from there.
- **Do** convey panel depth with a tonal step + a single hairline border (`border-hair`), never a drop shadow.
- **Do** reserve Signal Red (`#e53333`) and its glow for the one live or primary element in a view — the One Wire Rule.
- **Do** set numeric/columnar values in the mono role with tabular figures (`tnum`), so they don't reflow.
- **Do** set structural labels UPPERCASE, `tracking-5` (0.16em), `--muted` — the Tracked-Label signature.
- **Do** give every interactive component its full state set (default / hover / focus-visible red ring / active / disabled / loading).
- **Do** honor `prefers-reduced-motion` — the media hover and skeleton shimmer already collapse to near-instant; new motion must too.

### Don't:
- **Don't** reintroduce neumorphism. No soft dual embossed shadows on surfaces — the flat pass replaced that on purpose, whatever CLAUDE.md's older text says.
- **Don't** use a black `box-shadow` to separate console panels. If two panels don't read as distinct, fix the surface tone, not the shadow. (The media-card hover lift is the *only* sanctioned black drop shadow.)
- **Don't** import media's greens into the console. Console success stays red (`--ok: var(--accent)`); emerald belongs to the media pipeline (`in_library`/`watched`) and stays there.
- **Don't** decorate with the red accent or its glow. A resting, non-primary surface never glows — the Glow-Means-Live Rule.
- **Don't** set body copy in `--muted` — it's tuned to recede as a label and fails contrast as reading text. Use `--ink` / `--ink-soft`.
- **Don't** flip the light theme to white paper. It is a cool slate (`#e4e8f0`) that keeps the console mood in daylight.
- **Don't** introduce a *third* type family or a real monospace face. Syne for the console, Oswald for the media cinematic display, `tnum` for figures — that's the whole system.
- **Don't** use glassmorphism as a default surface. Backdrop-blur is reserved for the modal/drawer overlay scrim, not for content cards.
