# Season breakdown in broad release pickers

**Date:** 2026-07-16
**Status:** Approved, ready for implementation plan

## Problem

The broad release pickers (series detail "показать раздачи" and the `/media`
add-drawer) return releases for a whole series mixed together — season 1 packs,
full-series packs, and individual later seasons all in one flat list. There is no
way to focus on a single season. The only existing control is a crude
`<input type="number">` on the `/media` drawer that feeds `seasonNumber`, plus a
free-text filter box (typing "s7" there triggered the year-block bug fixed
earlier, because free-text search passes no structured `seasonNumber`).

We want a proper, flat-design **season select** next to the "Релизы" heading that:
1. Re-runs the season-specific search when a season is chosen (so it actually
   surfaces that season's releases, not just filters what a generic query
   returned).
2. Labels each release card with an inferred season, using TMDB season air-dates.

## Scope

- **In scope:** the two *broad* pickers only —
  - series detail broad picker (`MediaSeriesPage.tsx`, the "показать раздачи" panel)
  - the `/media` add-drawer picker (`MediaPage.tsx`)
- **Out of scope / untouched:** movie pickers; the already-scoped per-season
  `ReleasePicker` cards on the series page (they are locked to one season).

## Design

### Backend

1. **`backend/src/integrations/tmdb.ts` — `tmdbTvSeasonSummaries(tmdbId)`**
   Returns `Array<{ seasonNumber: number; airYear: number | null; episodeCount: number; name: string }>`,
   read from the existing `/tv/{id}` response `seasons[]` (single cheap call,
   same one `tmdbTvSeasons` already uses). `airYear` = year parsed from each
   season's `air_date`. Exclude specials (season 0) — keep `seasonNumber >= 1`.
   Sorted ascending by season number.

2. **New route `GET /api/media/seasons?type=series&id=<tmdbId>`**
   (in the media API router). Resolves the title, returns the summaries from
   `tmdbTvSeasonSummaries`. Graceful:
   - `type=movie` → `[]`
   - TMDB not configured / lookup fails → `[]` (never throws; the select just
     stays empty and hidden).

3. **`backend/src/integrations/nativeMedia.ts` — `nativeReleaseSearch`**
   After fetching TMDB details, build a `Map<number, number>` of
   `airYear → seasonNumber` from the season summaries. Attach a new field to each
   returned release:
   ```ts
   inferredSeason = parsed.season ?? yearIndex.get(primaryDeclaredYear) ?? null
   ```
   where `parsed.season` and `parsed.declaredYears` come from
   `parseReleaseTitle` (already computed for the match). `primaryDeclaredYear` is
   `parsed.declaredYears[0]`. Additive field — existing consumers unaffected.
   If two seasons share a premiere year, the later season wins is NOT expected
   for normal shows; if it occurs, keep the first (lowest) season for that year
   to stay deterministic.

### Frontend

4. **`frontend/src/lib/api.ts`**
   - Add `export interface SeasonSummary { seasonNumber: number; airYear: number | null; episodeCount: number; name: string }`.
   - Add `getReleaseSeasons(type: "movie" | "series", id: number): Promise<SeasonSummary[]>`
     hitting `/api/media/seasons` (returns `[]` on any error).
   - Add `inferredSeason?: number | null` to `ReleaseOption`.

5. **`frontend/src/pages/media/shared/mediaRails.tsx` — `MediaRail`**
   Add optional prop `headerActions?: ReactNode`, rendered right-aligned in the
   header row (after the count / at the end of `discSecHead`). No behavior change
   when omitted.

6. **`frontend/src/pages/media/shared/mediaShared.tsx` — `ReleasePicker`**
   - New prop `showSeasonSelect?: boolean`.
   - When `showSeasonSelect && params.type === "series"`:
     - On mount (and when `params.id` changes) fetch `getReleaseSeasons` into
       local state.
     - Own local `season: number | undefined` state (default `undefined` =
       "Все сезоны").
     - Render a flat-styled `<select>` in `MediaRail`'s `headerActions`, options:
       `Все сезоны` + one per summary labelled `Сезон {n} · {airYear}`
       (omit ` · год` when `airYear` is null).
     - Feed the effective season (`season ?? params.seasonNumber`) into the
       existing search `useEffect` dependency + `searchReleaseOptions` call, so
       changing the select re-queries.
   - When `showSeasonSelect` is false/undefined: behaves exactly as today.
   - `TorrentCard` gains a small season badge (e.g. `S07`) rendered from
     `release.inferredSeason` when present.

7. **`frontend/src/pages/media/MediaPage.tsx`**
   Remove the crude `pickSeason` number `<input>` and its state; pass
   `showSeasonSelect` to the series `ReleasePicker` (the picker now owns season
   state). Movie branch unchanged.

8. **`frontend/src/pages/media/MediaSeriesPage.tsx`**
   Pass `showSeasonSelect` to the broad picker (currently at ~line 632). The
   per-season pickers (locked `seasonNumber`) are not given the prop.

### Flat-design select

Add a `media.select` class next to `media.input` (in the media style tokens):
dark surface (`--surface`/`--raise`), single hairline border (`--hair`), accent
focus ring, custom chevron (inline SVG background or a positioned icon), no
native OS chrome (`appearance: none`). Matches the "Cinematic Cockpit" flat
system — depth via tonal surface + hairline, not shadow.

## Data flow

```
select change → ReleasePicker.season state
  → searchReleaseOptions({ type, id, seasonNumber: season }) [re-query]
  → backend nativeReleaseSearch: season-specific Jackett query
     + season-aware year match + inferredSeason per release
  → cards render, each with S0N badge from inferredSeason
```

Season options come from a separate `getReleaseSeasons` call (stable, independent
of the changing release results), fetched once per title.

## Error handling

- Seasons endpoint failure / empty → select is hidden (no options); picker works
  as the plain broad list.
- `inferredSeason` null → no badge on that card.
- Movie type → no select, no seasons fetch.

## Testing

- **Backend unit test** (`test/…`) for `inferredSeason` inference logic:
  - release title containing `S07` → `7` (title season wins).
  - release with only year `2023`, given summaries where season 7 premiered 2023
    → `7` (year→season via air-date).
  - release with a year not matching any season premiere → `null`.
- **Preview verification:** in the running app, open a series broad picker,
  confirm: select lists real seasons with air years; choosing one re-queries and
  narrows results; cards show season badges; flat styling correct in dark + light
  themes.
