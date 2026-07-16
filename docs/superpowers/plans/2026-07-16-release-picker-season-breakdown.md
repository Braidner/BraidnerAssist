# Season Breakdown in Broad Release Pickers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat-design season select next to the "Релизы" heading in the two broad release pickers (series detail + `/media` add-drawer); picking a season re-runs the season-specific search, and each release card shows an inferred-season badge derived from TMDB air-dates.

**Architecture:** Backend attaches an additive `inferredSeason` field to each release (from the parsed title season, else a year→season index built from TMDB season air-dates) and exposes a small `GET /media/seasons` route for the select options. Frontend `ReleasePicker` gains an opt-in season select that drives the existing `seasonNumber` search param and renders per-card season badges.

**Tech Stack:** Node.js + Express + TypeScript (backend), React + TypeScript + Vite + Tailwind v4 (frontend), `tsx --test` for backend unit tests.

## Global Constraints

- Backend port 3001, frontend 3000 — never a shared `PORT`.
- All media integrations optional: TMDB not configured → routes return graceful empty payloads (`[]`), never throw, never break the widget.
- Flat "Cinematic Cockpit" design: depth via tonal surfaces + a single hairline border (`--hair`) + accent focus, never shadows. Dark theme default, must also work in light. Theme lives on the `.mc` wrapper.
- UI copy is Russian (matches existing media UI).
- Backend tests run with `tsx --test`; test files live in `backend/test/*.test.ts`. There is no frontend test runner — frontend tasks are verified via `npm run build` (tsc) + browser preview.
- Series `id` passed to release endpoints is the **TMDB tv id** (already resolved by callers). `resolveTmdbId` handles tmdb-or-tvdb input defensively.

---

### Task 1: Backend — TMDB season summaries

**Files:**
- Modify: `backend/src/integrations/tmdb.ts` (add `SeasonSummary` type, `mapSeasonSummaries`, `tmdbTvSeasonSummaries` near `tmdbTvSeasons` at ~L273)
- Test: `backend/test/releaseSeason.test.ts` (new)

**Interfaces:**
- Produces:
  - `interface SeasonSummary { seasonNumber: number; airYear: number | null; episodeCount: number; name: string }`
  - `mapSeasonSummaries(rawSeasons: unknown): SeasonSummary[]` — pure mapper over the `/tv/{id}` `seasons[]` array.
  - `tmdbTvSeasonSummaries(tmdbId: number): Promise<SeasonSummary[]>` — network wrapper.

- [ ] **Step 1: Write the failing test**

Create `backend/test/releaseSeason.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("mapSeasonSummaries keeps real seasons, parses air year, sorts ascending, drops specials", async () => {
  const { mapSeasonSummaries } = await import("../src/integrations/tmdb.js");
  const raw = [
    { season_number: 0, air_date: "2013-01-01", episode_count: 3, name: "Specials" },
    { season_number: 7, air_date: "2023-10-15", episode_count: 10, name: "Season 7" },
    { season_number: 1, air_date: "2013-12-02", episode_count: 11, name: "Season 1" },
    { season_number: 8, air_date: null, episode_count: 10, name: "Season 8" },
  ];
  const out = mapSeasonSummaries(raw);
  assert.deepEqual(
    out,
    [
      { seasonNumber: 1, airYear: 2013, episodeCount: 11, name: "Season 1" },
      { seasonNumber: 7, airYear: 2023, episodeCount: 10, name: "Season 7" },
      { seasonNumber: 8, airYear: null, episodeCount: 10, name: "Season 8" },
    ],
  );
});

test("mapSeasonSummaries tolerates non-array input", async () => {
  const { mapSeasonSummaries } = await import("../src/integrations/tmdb.js");
  assert.deepEqual(mapSeasonSummaries(undefined), []);
  assert.deepEqual(mapSeasonSummaries(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx --test test/releaseSeason.test.ts`
Expected: FAIL — `mapSeasonSummaries` is not exported.

- [ ] **Step 3: Implement the mapper and wrapper**

In `backend/src/integrations/tmdb.ts`, add after `tmdbTvSeasons` (~L280):

```ts
export interface SeasonSummary {
  seasonNumber: number;
  airYear: number | null;
  episodeCount: number;
  name: string;
}

// Pure mapper over the /tv/{id} `seasons[]` array. Keeps real seasons (>=1),
// parses the premiere year from air_date, sorts ascending. Kept separate from
// the network call so it can be unit-tested.
export function mapSeasonSummaries(rawSeasons: unknown): SeasonSummary[] {
  const seasons = Array.isArray(rawSeasons) ? rawSeasons : [];
  return seasons
    .map((s: any) => {
      const seasonNumber = Number(s?.season_number);
      const yearNum = typeof s?.air_date === "string" ? Number(s.air_date.slice(0, 4)) : NaN;
      const epCount = Number(s?.episode_count);
      return {
        seasonNumber,
        airYear: Number.isFinite(yearNum) ? yearNum : null,
        episodeCount: Number.isFinite(epCount) ? epCount : 0,
        name: String(s?.name ?? `Season ${seasonNumber}`),
      };
    })
    .filter((s) => Number.isFinite(s.seasonNumber) && s.seasonNumber >= 1)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

export async function tmdbTvSeasonSummaries(tmdbId: number): Promise<SeasonSummary[]> {
  const data = await tmdbGet(`/tv/${tmdbId}`);
  return mapSeasonSummaries(data?.seasons);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx tsx --test test/releaseSeason.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/integrations/tmdb.ts backend/test/releaseSeason.test.ts
git commit -m "feat(media): TMDB season summaries mapper + fetch"
```

---

### Task 2: Backend — inferredSeason inference + seasons route

**Files:**
- Modify: `backend/src/integrations/media.ts:212` (add `inferredSeason` to `SearchResult`)
- Modify: `backend/src/integrations/nativeMedia.ts` (import summaries fn; add `buildSeasonYearIndex`, `inferReleaseSeason`, `nativeSeasonSummaries`; attach `inferredSeason` in `nativeReleaseSearch` ~L385)
- Modify: `backend/src/api/index.ts` (import `nativeSeasonSummaries`; add `GET /media/seasons` route near L698)
- Test: `backend/test/releaseSeason.test.ts` (extend)

**Interfaces:**
- Consumes: `SeasonSummary` from Task 1.
- Produces:
  - `buildSeasonYearIndex(summaries: SeasonSummary[]): Map<number, number>` — airYear → lowest seasonNumber for that year.
  - `inferReleaseSeason(parsed: { season?: number | null; declaredYears?: number[] } | undefined, yearIndex: Map<number, number>): number | null`
  - `nativeSeasonSummaries(id: number): Promise<SeasonSummary[]>`
  - `SearchResult.inferredSeason?: number | null`

- [ ] **Step 1: Write the failing test**

Append to `backend/test/releaseSeason.test.ts`:

```ts
import type { SeasonSummary } from "../src/integrations/tmdb.js";

test("buildSeasonYearIndex maps air year to the lowest season for that year", async () => {
  const { buildSeasonYearIndex } = await import("../src/integrations/nativeMedia.js");
  const summaries: SeasonSummary[] = [
    { seasonNumber: 1, airYear: 2013, episodeCount: 11, name: "S1" },
    { seasonNumber: 6, airYear: 2022, episodeCount: 10, name: "S6" },
    { seasonNumber: 7, airYear: 2023, episodeCount: 10, name: "S7" },
    { seasonNumber: 8, airYear: 2023, episodeCount: 10, name: "S8" }, // shares 2023
    { seasonNumber: 9, airYear: null, episodeCount: 10, name: "S9" },
  ];
  const index = buildSeasonYearIndex(summaries);
  assert.equal(index.get(2013), 1);
  assert.equal(index.get(2022), 6);
  assert.equal(index.get(2023), 7); // lowest season wins for a shared year
  assert.equal(index.has(2099), false);
});

test("inferReleaseSeason prefers the parsed title season, else maps year, else null", async () => {
  const { buildSeasonYearIndex, inferReleaseSeason } = await import("../src/integrations/nativeMedia.js");
  const index = buildSeasonYearIndex([
    { seasonNumber: 7, airYear: 2023, episodeCount: 10, name: "S7" },
  ]);
  // Title declares S07 → title wins even if year would map elsewhere.
  assert.equal(inferReleaseSeason({ season: 7, declaredYears: [2013] }, index), 7);
  // No title season, year 2023 maps to season 7.
  assert.equal(inferReleaseSeason({ season: null, declaredYears: [2023] }, index), 7);
  // Year not in index → null.
  assert.equal(inferReleaseSeason({ season: null, declaredYears: [2013] }, index), null);
  // No data → null.
  assert.equal(inferReleaseSeason(undefined, index), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx --test test/releaseSeason.test.ts`
Expected: FAIL — `buildSeasonYearIndex` / `inferReleaseSeason` not exported.

- [ ] **Step 3: Add the field to `SearchResult`**

In `backend/src/integrations/media.ts`, inside `interface SearchResult` (after `parsed?: unknown;` at L212):

```ts
  parsed?: unknown;
  inferredSeason?: number | null;
```

- [ ] **Step 4: Implement inference helpers + summaries resolver**

In `backend/src/integrations/nativeMedia.ts`, add `tmdbTvSeasonSummaries` and the `SeasonSummary` type to the existing `from "./tmdb.js"` import block (~L26). Then add these exported helpers (place them near `allowedReleaseYears`, ~L202):

```ts
// airYear → seasonNumber. Iterated ascending (summaries are sorted), so the
// FIRST (lowest) season for a shared premiere year wins — deterministic.
export function buildSeasonYearIndex(summaries: SeasonSummary[]): Map<number, number> {
  const index = new Map<number, number>();
  for (const s of summaries) {
    if (s.airYear == null || index.has(s.airYear)) continue;
    index.set(s.airYear, s.seasonNumber);
  }
  return index;
}

// Best-effort season for a release: the season parsed from its title if present,
// otherwise mapped from its declared year via the TMDB air-date index.
export function inferReleaseSeason(
  parsed: { season?: number | null; declaredYears?: number[] } | undefined,
  yearIndex: Map<number, number>,
): number | null {
  if (parsed?.season != null) return parsed.season;
  const year = parsed?.declaredYears?.[0];
  if (year != null && yearIndex.has(year)) return yearIndex.get(year)!;
  return null;
}

export async function nativeSeasonSummaries(id: number): Promise<SeasonSummary[]> {
  const { tmdbId } = await resolveTmdbId("series", id);
  return tmdbTvSeasonSummaries(tmdbId);
}
```

- [ ] **Step 5: Attach `inferredSeason` in `nativeReleaseSearch`**

In `backend/src/integrations/nativeMedia.ts`, in `nativeReleaseSearch`, add the index build after `allowedYears` (~L385) and attach `inferredSeason` in the `.map`:

```ts
  const allowedYears = await allowedReleaseYears(kind, title, kind === "series" ? seasonNumber : undefined);
  const seasonYearIndex = buildSeasonYearIndex(
    kind === "series" ? await tmdbTvSeasonSummaries(title.tmdbId).catch(() => []) : [],
  );
  const annotated = releases
    .map((release) => {
      const matched = applyReleaseMatch(
        release,
        buildReleaseMatch({
          kind,
          title,
          item: release,
          seasonNumber: kind === "series" ? seasonNumber : undefined,
          allowedYears,
        }),
      );
      return {
        ...matched,
        inferredSeason: inferReleaseSeason(
          matched.parsed as { season?: number | null; declaredYears?: number[] } | undefined,
          seasonYearIndex,
        ),
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.seeders ?? 0) - (a.seeders ?? 0));
```

(This replaces the existing `const annotated = releases.map(...).sort(...)` block; the rest of the function — the `for (const release of annotated)` cache loop and `return annotated` — is unchanged.)

- [ ] **Step 6: Add the `GET /media/seasons` route**

In `backend/src/api/index.ts`, add `nativeSeasonSummaries` to the existing import from `nativeMedia` (near L37 where `nativeReleaseSearch` is imported). Then add this route after the `/media/release/search` handler (~L698):

```ts
// Список сезонов тайтла (номер + год выхода) для селекта в ReleasePicker.
// Graceful: не сериал / TMDB не настроен / ошибка → [].
apiRouter.get("/media/seasons", async (req, res) => {
  const kind = String(req.query?.type ?? "") === "series" ? "series" : "movie";
  const id = Number(req.query?.id);
  if (kind !== "series" || !Number.isFinite(id) || id <= 0 || !config.media.tmdb.configured) {
    return res.json([]);
  }
  try {
    res.json(await nativeSeasonSummaries(id));
  } catch (e) {
    logRouteError("tmdb", req, e, { kind, id });
    res.json([]);
  }
});
```

- [ ] **Step 7: Run tests + build**

Run: `cd backend && npx tsx --test 'test/**/*.test.ts' && npm run build`
Expected: all tests PASS (including the 4 in `releaseSeason.test.ts`); `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/integrations/media.ts backend/src/integrations/nativeMedia.ts backend/src/api/index.ts backend/test/releaseSeason.test.ts
git commit -m "feat(media): infer release season + GET /media/seasons route"
```

---

### Task 3: Frontend — api types, seasons getter, inferredSeason field

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `SeasonSummary` + `getReleaseSeasons` near `searchReleaseOptions` ~L1718; add `inferredSeason` to `ReleaseOption` ~L1698)

**Interfaces:**
- Consumes: backend `GET /media/seasons`, `ReleaseOption` shape.
- Produces:
  - `interface SeasonSummary { seasonNumber: number; airYear: number | null; episodeCount: number; name: string }`
  - `getReleaseSeasons(type: "movie" | "series", id: number): Promise<SeasonSummary[]>`
  - `ReleaseOption.inferredSeason?: number | null`

- [ ] **Step 1: Add `inferredSeason` to `ReleaseOption`**

In `frontend/src/lib/api.ts`, inside `interface ReleaseOption`, after the `parsed?: {...}` block closes (~L1698, before the final `}`):

```ts
  parsed?: {
    resolution?: number | null;
    codec?: string | null;
    source?: string | null;
    languages?: string[];
    voice?: "dub" | "mvo" | "dvo" | "avo" | "sub" | "original" | "unknown";
    voiceLabel?: string | null;
    releaseGroup?: string | null;
    studioHint?: string | null;
    hdr?: string | null;
    season?: number | null;
    episodes?: number[];
    episodeRange?: { from: number; to: number } | null;
    declaredYears?: number[];
  };
  inferredSeason?: number | null;
}
```

- [ ] **Step 2: Add `SeasonSummary` + `getReleaseSeasons`**

In `frontend/src/lib/api.ts`, immediately before `export async function searchReleaseOptions` (~L1718):

```ts
export interface SeasonSummary {
  seasonNumber: number;
  airYear: number | null;
  episodeCount: number;
  name: string;
}

// Список сезонов для селекта в ReleasePicker. Любая ошибка / не сериал → [].
export async function getReleaseSeasons(
  type: "movie" | "series",
  id: number,
): Promise<SeasonSummary[]> {
  if (type !== "series") return [];
  try {
    const res = await apiFetch(`/api/media/seasons?type=series&id=${id}`);
    if (!res.ok) return [];
    return (await res.json()) as SeasonSummary[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && npm run build`
Expected: `tsc` + vite build succeed (exit 0).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(media): api SeasonSummary + getReleaseSeasons + inferredSeason"
```

---

### Task 4: Frontend — MediaRail header slot + flat select style token

**Files:**
- Modify: `frontend/src/pages/media/shared/mediaRails.tsx` (add `headerActions` prop ~L97-175)
- Modify: `frontend/src/pages/media/shared/mediaStyles.ts` (add `select` token ~L10)

**Interfaces:**
- Produces:
  - `MediaRail` accepts optional `headerActions?: ReactNode`, rendered right-aligned in the header row.
  - `media.select` — flat-styled `<select>` class string.

- [ ] **Step 1: Add the flat select style token**

In `frontend/src/pages/media/shared/mediaStyles.ts`, after the `input:` line (L10):

```ts
  input: cn(ui.input, "min-w-0 flex-1"),
  select: cn(
    "h-9 cursor-pointer appearance-none rounded-[10px] border border-hair bg-surface py-1.5 pl-3 pr-8 text-body text-ink outline-none transition-colors",
    "focus:border-accent/60 focus:outline focus:outline-2 focus:outline-accent/20 focus:outline-offset-1",
    "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238a8a94%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat",
  ),
```

- [ ] **Step 2: Add the `headerActions` prop to `MediaRail`**

In `frontend/src/pages/media/shared/mediaRails.tsx`, add to the props destructure + type (L97-111):

```ts
export function MediaRail({
  title,
  count,
  countLabel,
  onTitleClick,
  headerActions,
  children,
  className,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  onTitleClick?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
```

Then render it in the header row. Replace the count line (L174) so the actions sit at the far right:

```tsx
        <div className={ms.discSecLine} />
        {renderedCount ? <span className={ms.discSecCount}>{renderedCount}</span> : null}
        {headerActions ? <div className="flex flex-none items-center gap-2">{headerActions}</div> : null}
```

(Confirm `ReactNode` is already imported at the top of the file — it is used by the existing `children: ReactNode`.)

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/media/shared/mediaRails.tsx frontend/src/pages/media/shared/mediaStyles.ts
git commit -m "feat(media): MediaRail headerActions slot + flat select token"
```

---

### Task 5: Frontend — ReleasePicker season select + per-card badge

**Files:**
- Modify: `frontend/src/pages/media/shared/mediaShared.tsx` (`ReleasePicker` props + state + select + search dep ~L753-1006; `TorrentCard` badge ~L637-720)

**Interfaces:**
- Consumes: `getReleaseSeasons`, `SeasonSummary`, `ReleaseOption.inferredSeason`, `media.select`, `MediaRail headerActions`.
- Produces: `ReleasePicker` accepts new prop `showSeasonSelect?: boolean`.

- [ ] **Step 1: Import the seasons getter + type**

In `frontend/src/pages/media/shared/mediaShared.tsx`, add `getReleaseSeasons` and `type SeasonSummary` to the existing import from `@/lib/api` (the same import that already brings in `searchReleaseOptions` / `ReleaseOption`).

- [ ] **Step 2: Add the prop, season state, and seasons fetch**

In `ReleasePicker` (L753), extend the signature:

```ts
export function ReleasePicker({
  params,
  onGrabbed,
  fallbackPosterSrc,
  downloads = [],
  showSeasonSelect = false,
}: {
  params: { type: "movie" | "series"; id: number; seasonNumber?: number };
  onGrabbed?: () => void;
  fallbackPosterSrc?: string | null;
  downloads?: DownloadItem[];
  showSeasonSelect?: boolean;
}) {
```

Add state near the other `useState` calls (after L769):

```ts
  const seasonSelectEnabled = showSeasonSelect && params.type === "series";
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [season, setSeason] = useState<number | undefined>(params.seasonNumber);
  const effectiveSeason = seasonSelectEnabled ? season : params.seasonNumber;
```

Fetch season options once per title:

```ts
  useEffect(() => {
    if (!seasonSelectEnabled) {
      setSeasons([]);
      return;
    }
    let alive = true;
    getReleaseSeasons("series", params.id).then((s) => {
      if (alive) setSeasons(s);
    });
    return () => {
      alive = false;
    };
  }, [seasonSelectEnabled, params.id]);
```

- [ ] **Step 3: Drive the search off `effectiveSeason`**

In the search `useEffect` (L777-795), change the `searchReleaseOptions` call and dep array to use `effectiveSeason` instead of `params.seasonNumber`:

```ts
    searchReleaseOptions({
      ...params,
      seasonNumber: effectiveSeason,
      query: debouncedReleaseQuery || undefined,
      limit: 50,
    }).then((r) => {
      if (!alive) return;
      setReleases(r.items);
      setError(r.error);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, effectiveSeason, debouncedReleaseQuery]);
```

Also update `grabOne` (L798-805) to grab with the selected season:

```ts
      seasonNumber: effectiveSeason,
```

(replacing `seasonNumber: params.seasonNumber` in the `grabRelease` call).

- [ ] **Step 4: Render the select in the MediaRail header**

In the `MediaRail` at L983, add `headerActions` when enabled:

```tsx
        <MediaRail
          title="Релизы"
          count={releases.length}
          countLabel={`${releases.length} раздач · по сидам`}
          headerActions={
            seasonSelectEnabled && seasons.length > 0 ? (
              <select
                className={media.select}
                value={season ?? ""}
                onChange={(e) => setSeason(e.target.value === "" ? undefined : Number(e.target.value))}
                aria-label="Сезон"
              >
                <option value="">Все сезоны</option>
                {seasons.map((s) => (
                  <option key={s.seasonNumber} value={s.seasonNumber}>
                    {s.airYear ? `Сезон ${s.seasonNumber} · ${s.airYear}` : `Сезон ${s.seasonNumber}`}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
```

- [ ] **Step 5: Add the inferred-season badge to `TorrentCard`**

In `TorrentCard` (~L637, near `const matchChips = releaseMatchChips(release);`), derive a label:

```ts
  const matchChips = releaseMatchChips(release);
  const blocked = Boolean(release.match?.block);
  const seasonBadge =
    release.inferredSeason != null ? `S${String(release.inferredSeason).padStart(2, "0")}` : null;
```

Render it in the top-left badge cluster, alongside the tracker/quality pills (inside the `<div className="absolute left-2 top-2 ...">` block at ~L670, after the `quality` pill):

```tsx
          {seasonBadge && (
            <span className="max-w-full truncate rounded-full bg-accent/85 px-2 py-1 font-mono text-2xs font-semibold leading-none text-accent-ink backdrop-blur-md">
              {seasonBadge}
            </span>
          )}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd frontend && npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/media/shared/mediaShared.tsx
git commit -m "feat(media): ReleasePicker season select + per-card season badge"
```

---

### Task 6: Frontend — wire the two broad pickers

**Files:**
- Modify: `frontend/src/pages/media/MediaPage.tsx` (remove `pickSeason` input/state ~L270-292; pass `showSeasonSelect`)
- Modify: `frontend/src/pages/media/MediaSeriesPage.tsx` (pass `showSeasonSelect` to broad picker ~L632)

**Interfaces:**
- Consumes: `ReleasePicker` `showSeasonSelect` prop from Task 5.

- [ ] **Step 1: Wire the `/media` drawer picker**

In `frontend/src/pages/media/MediaPage.tsx`, replace the `pickSeason` number-input block + the `ReleasePicker` params (L270-292) so the picker owns season selection:

```tsx
                        <ReleasePicker
                          params={
                            it.kind === "series"
                              ? { type: "series", id: it.id }
                              : { type: "movie", id: it.id }
                          }
                          showSeasonSelect={it.kind === "series"}
                          downloads={downloads}
                          onGrabbed={onGrabbed}
```

Then remove the now-unused `pickSeason` state declaration and the `<input type="number" ...>` season block (the JSX at L270-281 and its `setPickSeason`/`pickSeason` `useState`). Search the file for `pickSeason` and delete every reference.

- [ ] **Step 2: Wire the series-detail broad picker**

In `frontend/src/pages/media/MediaSeriesPage.tsx`, at the broad picker (L632), add the prop:

```tsx
          <ReleasePicker
            params={{ type: "series", id: tmdbId }}
            showSeasonSelect
            downloads={media.downloads}
            fallbackPosterSrc={posterSrc}
            onGrabbed={() => {
```

(The per-season `ReleasePicker` at ~L761 keeps its fixed `seasonNumber` and does **not** get `showSeasonSelect`.)

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && npm run build`
Expected: exit 0, no unused-variable errors for `pickSeason`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/media/MediaPage.tsx frontend/src/pages/media/MediaSeriesPage.tsx
git commit -m "feat(media): enable season select in broad release pickers"
```

---

### Task 7: Full verification in preview

**Files:** none (verification only)

- [ ] **Step 1: Backend suite + both builds**

Run:
```bash
cd backend && npx tsx --test 'test/**/*.test.ts' && npm run build
cd ../frontend && npm run build
```
Expected: all backend tests PASS; both builds exit 0.

- [ ] **Step 2: Drive the UI in the browser preview**

Start the dev servers (backend `name` + frontend `name` from `.claude/launch.json`, or add them) via `preview_start`, open `/media`, and follow the verification workflow:
- Open a series broad picker (series detail "показать раздачи", or the `/media` add-drawer for a series).
- Confirm the season `<select>` appears next to "Релизы" with "Все сезоны" + real seasons labelled `Сезон N · YYYY`.
- Choose a later season (e.g. Rick and Morty S7); confirm the list **re-queries** (loading → narrowed results) and that S7 releases appear un-blocked.
- Confirm each card shows an `S0N` season badge.
- `read_console_messages` — no errors; `read_network_requests` — `/api/media/seasons` returns 200, `/api/media/release/search` re-fires on season change.
- `resize_window` to check the select in light theme + narrow width.

If the preview backend has no `TMDB_API_KEY`, the select will be empty (graceful) — note that and verify the empty-state path (picker still lists releases, no select shown). Full data verification requires the deployed server with TMDB configured; call that out to the user rather than claiming it works.

- [ ] **Step 3: Screenshot proof**

`computer {action: "screenshot"}` of the season select + badged cards; share with the user.

- [ ] **Step 4: Update graphify**

```bash
cd /Users/braidner/Documents/BraidnerAssist && graphify update .
```

---

## Self-Review

**Spec coverage:**
- Backend `tmdbTvSeasonSummaries` → Task 1. ✅
- `GET /media/seasons` route (graceful) → Task 2 Step 6. ✅
- `inferredSeason` per release (parsed season ?? year→season) → Task 2. ✅
- api.ts `SeasonSummary` + `getReleaseSeasons` + `inferredSeason` field → Task 3. ✅
- `MediaRail` headerActions slot → Task 4. ✅
- `ReleasePicker` `showSeasonSelect`, season state, re-query, select in header, per-card badge → Task 5. ✅
- Flat `media.select` styling → Task 4 Step 1. ✅
- `MediaPage` remove `pickSeason` + wire; `MediaSeriesPage` broad picker wired; per-season & movie untouched → Task 6. ✅
- Tests for inference (S## wins / year→season / null) → Task 2 Step 1. ✅
- Preview verification (re-query, badges, flat styling, dark+light) → Task 7. ✅

**Placeholder scan:** No TBD/TODO; all code steps carry full code. ✅

**Type consistency:** `SeasonSummary` fields (`seasonNumber`, `airYear`, `episodeCount`, `name`) identical across `tmdb.ts` (Task 1), `nativeMedia.ts` consumption (Task 2), and `api.ts` (Task 3). `inferReleaseSeason`, `buildSeasonYearIndex`, `nativeSeasonSummaries`, `getReleaseSeasons`, `showSeasonSelect`, `effectiveSeason`, `inferredSeason` used consistently. `MediaRail` `headerActions` prop matches Task 4 definition and Task 5 usage. ✅
