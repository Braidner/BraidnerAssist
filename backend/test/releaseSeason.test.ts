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
