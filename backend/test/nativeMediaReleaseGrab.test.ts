import { test } from "node:test";
import assert from "node:assert/strict";
import type { CachedRelease } from "../src/integrations/nativeMedia.js";

process.env.DATABASE_URL ??= "file:./mission-control-test.db";

test("release cache is scoped by title tmdb id", async () => {
  const {
    cacheReleaseForTitle,
    cachedReleaseForTitle,
    clearReleaseCacheForTest,
    releaseCacheKey,
  } = await import("../src/integrations/nativeMedia.js");

  clearReleaseCacheForTest();

  const release: CachedRelease = {
    type: "movie",
    tmdbId: 150540,
    tvdbId: null,
    titleHint: "Inside Out",
    guid: "rutracker:5108126",
    indexerId: "rutracker",
    title: "Inside Out (2015).720p.Rus.AVO.mkv",
    size: 5_690_000_000,
    seeders: 12,
    indexer: "rutracker",
    url: "magnet:?xt=urn:btih:insideout2015",
  };

  cacheReleaseForTitle(release);

  assert.equal(
    releaseCacheKey("movie", 150540, release.guid, "rutracker"),
    "movie:150540:rutracker:rutracker:5108126",
  );
  assert.equal(cachedReleaseForTitle("movie", 150540, release.guid, "rutracker")?.tmdbId, 150540);
  assert.equal(cachedReleaseForTitle("movie", 1022789, release.guid, "rutracker"), null);
});

test("movie releases with an explicit different year are rejected", async () => {
  const { assertMovieReleaseMatchesTitle } = await import("../src/integrations/nativeMedia.js");

  assert.throws(
    () => assertMovieReleaseMatchesTitle(
      "movie",
      { title: "Inside Out 2", year: 2024 },
      {
        guid: "rutracker:5108126",
        title: "Inside Out (2015).720p.Rus.AVO.mkv",
        size: 5_690_000_000,
        seeders: 12,
        indexer: "rutracker",
        url: "magnet:?xt=urn:btih:insideout2015",
      },
    ),
    /2015.*2024|2024.*2015/,
  );

  assert.doesNotThrow(() => assertMovieReleaseMatchesTitle(
    "movie",
    { title: "Inside Out 2", year: 2024 },
    {
      guid: "rutracker:insideout2",
      title: "Inside Out 2 (2024).1080p.mkv",
      size: 7_000_000_000,
      seeders: 20,
      indexer: "rutracker",
      url: "magnet:?xt=urn:btih:insideout2024",
    },
  ));
});
