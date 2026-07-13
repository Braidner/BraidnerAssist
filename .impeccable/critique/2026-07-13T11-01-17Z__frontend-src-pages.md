---
target: frontend/src/pages
total_score: 26
p0_count: 1
p1_count: 1
timestamp: 2026-07-13T11-01-17Z
slug: frontend-src-pages
---
# Critique: frontend/src/pages/

Method: dual-agent (A: design-review · B: detector+evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | /system flashes "не задан" placeholders on first paint (state inits configured:false before fetch) |
| 2 | Match System / Real World | 3 | Mixed RU/EN in one surface |
| 3 | User Control & Freedom | 3 | Native confirm()/alert(); no undo |
| 4 | Consistency & Standards | 1 | 2–4 button systems; "watched" emerald vs red; Oswald never loads; Badge ok = red so success looks like alarm |
| 5 | Error Prevention | 3 | Confirm dialogs exist; optimistic toggles can silently desync |
| 6 | Recognition over Recall | 3 | Icons+labels throughout |
| 7 | Flexibility & Efficiency | 3 | Cmd-K, adaptive polling, esc; no visible shortcut hints |
| 8 | Aesthetic & Minimalist | 3 | Hero excellent; SystemPage right column trends to monitoring-wall; rainbow rail palette |
| 9 | Error Recovery | 2 | --bad (pink) vs --ok (red) near-indistinguishable; red "applied" success banner reads as failure |
| 10 | Help & Documentation | 2 | Placeholder env pattern great; empty states thin |
| Total | | 26/40 | Acceptable — competent but inconsistent |

## Anti-Patterns Verdict
Not AI slop — the shell reads as a genuine cinematic cockpit; the media detail hero is a real peak. The failure is DRIFT: the media subsystem grew its own mini-design-system (Oswald font, emerald green, gold, six-hue rainbow) inside a one-accent identity.

Deterministic scan (detect.mjs, 23 files, exit 2): 9 findings, all advisory, all TRUE POSITIVES (no Tailwind/shadcn false positives). Two families, concentrated in frontend/src/pages/media/shared/: 6× arbitrary font-size (text-[9/12/34/52/28px]) bypassing the ramp in mediaStyles.ts/mediaShared.tsx (imported by 7–11 files); 3× off-token hex (#ffd978 gold, #15141b gradient stop, #000 video bg). Confirms A's read that drift is localized to media. Detector rules don't cover font-family, so phantom Oswald is A's catch.

Visual overlays: none. Browser skipped — :3000 answers (200) but backend :3001 down (000); JWT-auth-gated SPA renders nothing past login. Live render not forced.

## What's Working
1. Placeholder component = "resilient by module" made visual (names the exact missing env var, never errors).
2. Token architecture disciplined at source (styles.css): tonal ladder, semantic ramp, both themes. Violations are misuse, not a bad system.
3. Hero player technically extraordinary (trickplay scrub, PiP, fullscreen fallback, synchronized auto-hide chrome).

## Priority Issues
[P0] Consistency collapse — unify button/badge vocabulary. 2–4 button systems; SettingsPage + MediaPage mix shadcn <Button> and ui.button in same file; Docker Рестарт (ui.button.sm SystemPage.tsx:153) vs Settings Сохранить (shadcn SettingsPage.tsx:157) = same action rendered differently. Badge ok/bg-ok = red so success looks like alarm. Fix: pick shadcn <Button>, retire ui.button/iconButton/pill, migrate SystemPage + overview panels. Command: audit → distill.

[P1] Cinematic hero font is a ghost. font-[Oswald,var(--font)] in 5 places (mediaDetail.tsx:722, mediaStyles.ts:76,151,158,164); Oswald never loaded (only Syne, styles.css:112). Hero renders differently desktop vs phone. Fix: load Oswald or replace with Syne. Command: typeset.

[P2] Color semantics — success/live/error all in red-pink band + off-token colors. --ok=--accent (red), --bad=#e06b8a (pink); emerald greens (mediaStatus.tsx:11) vs No-Green rule; gold ratings; rainbow array (mediaRails.tsx:314); "watched" emerald in one file, red in another. Fix: reserve red for live/primary; add one calm positive token; deepen --bad; tokenize emerald/gold/rainbow. Command: colorize.

[P2] Accessibility — low-contrast body text + keyboard-dead toggles. --muted #4e5c72 on --page #09090d ≈ 2.9:1 used for 8–12px readable content. Custom toggles (HAssistantPanel.tsx:35 role=switch, TasksPanel.tsx:106 role=checkbox) are spans with click handlers, no keyboard focus/Space/Enter. Fix: bump muted-as-body to ink-soft; real <button role=switch> with keydown. Command: audit.

[P3] First-paint flash + inconsistent loading + native dialogs. /system + HA show not-configured before first fetch; loading = skeletons(media)/text(settings)/flash(system). confirm()/alert() (TasksPanel.tsx:147, SystemPage.tsx:244,251) break register. Fix: distinguish loading from configured:false; adopt MediaDetailPageSkeleton app-wide; shadcn dialog + toasts. Command: harden → polish.

## Persona Red Flags
Alex (power user): red "success" banner reads as failed write (SettingsPage.tsx:170); /system first-paint flash reads as dropped integration.
Sam (accessibility): ~2.9:1 muted body text; keyboard-dead toggles (can't operate HA/tasks without mouse); icon-only buttons on inconsistent aria-label.
Owner on mobile: hero-font non-determinism worst here; dense SystemPage + horizontal StatStrip turn glanceable into scrollable at 375px; red success/error ambiguity worst at arm's length.
Hermes (AI co-equal): in_progress and done both map to red LED (HermesLogPanel.tsx:21) — the co-equal operator's activity is the least color-legible thing on the board.

## Minor Observations
- Three "missing episode" reds: #e06666 (styles.css:293), #ff8a8a (mediaSeriesPage.tsx:712), --bad.
- Overview panels dual-render flat vs Card (TasksPanel 297 lines); branches already diverge.
- --mono defined as Syne; "mono" naming will confuse contributors.

## Questions
1. DESIGN.md says single-font Syne but code reaches for Oswald 5×. Spec aspirational or code stale? One is lying.
2. No-Green rule forces success to be red — serving the user or dogma producing alarm-colored confirmations?
3. Media grew a second font, green, gold, rainbow. Same product as the cockpit shell, or a Jellyfin-clone in its chrome?
