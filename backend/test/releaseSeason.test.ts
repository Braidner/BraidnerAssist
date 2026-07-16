import { test } from "node:test";
import assert from "node:assert/strict";
import type { SeasonSummary } from "../src/integrations/tmdb.js";

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
