import { test } from "node:test";
import assert from "node:assert/strict";
import type { MediaPreferenceItem } from "../src/integrations/mediaPreferences.js";

process.env.DATABASE_URL ??= "file:./mission-control-test.db";

test("release matching blocks a movie with an explicit wrong year", async () => {
  const { buildReleaseMatch, applyReleaseMatch } = await import("../src/integrations/nativeMedia.js");
  const release = {
    guid: "wrong-year",
    title: "Inside Out (2015).720p.mkv",
    size: 1,
    seeders: 10,
    indexer: "mock",
    url: "magnet:?xt=urn:btih:wrong",
    score: 50,
  };
  const match = buildReleaseMatch({
    kind: "movie",
    title: { year: 2024 },
    item: release,
    allowedYears: [2024],
  });
  const scored = applyReleaseMatch(release, match);
  assert.equal(match.yearStatus, "mismatch");
  assert.equal(match.block, true);
  assert.ok((scored.score ?? 0) < 0);
});

test("release matching allows a movie without an explicit year with medium confidence", async () => {
  const { buildReleaseMatch } = await import("../src/integrations/nativeMedia.js");
  const match = buildReleaseMatch({
    kind: "movie",
    title: { year: 2024 },
    item: {
      guid: "no-year",
      title: "Inside Out 2 1080p WEB-DL.mkv",
      size: 1,
      seeders: 10,
      indexer: "mock",
      url: "magnet:?xt=urn:btih:no-year",
    },
    allowedYears: [2024],
  });
  assert.equal(match.yearStatus, "unknown");
  assert.equal(match.block, false);
  assert.equal(match.confidence, "medium");
});

test("release matching accepts a series season year and rejects unrelated years", async () => {
  const { buildReleaseMatch } = await import("../src/integrations/nativeMedia.js");
  const ok = buildReleaseMatch({
    kind: "series",
    title: { year: 2022 },
    item: {
      guid: "series-ok",
      title: "House.of.the.Dragon.S02.2024.1080p.WEB-DL",
      size: 1,
      seeders: 10,
      indexer: "mock",
      url: "magnet:?xt=urn:btih:series-ok",
    },
    seasonNumber: 2,
    allowedYears: [2022, 2024],
  });
  const bad = buildReleaseMatch({
    kind: "series",
    title: { year: 2022 },
    item: {
      guid: "series-bad",
      title: "House.of.the.Dragon.S01.2020.1080p.WEB-DL",
      size: 1,
      seeders: 10,
      indexer: "mock",
      url: "magnet:?xt=urn:btih:series-bad",
    },
    seasonNumber: 2,
    allowedYears: [2022, 2024],
  });
  assert.equal(ok.yearStatus, "match");
  assert.equal(ok.seasonStatus, "match");
  assert.equal(ok.block, false);
  assert.equal(bad.yearStatus, "mismatch");
  assert.equal(bad.seasonStatus, "mismatch");
  assert.equal(bad.block, true);
});

test("effective preferences let app user rows override global rows", async () => {
  const { effectiveMediaPreferences } = await import("../src/integrations/mediaPreferences.js");
  const base = new Date("2026-07-01T00:00:00Z");
  const rows: MediaPreferenceItem[] = [
    {
      id: "global-hidden",
      appUserId: "global",
      kind: "movie",
      tmdbId: 1,
      tvdbId: null,
      status: "hidden",
      title: "Title",
      poster: null,
      backdrop: null,
      year: 2024,
      overview: "",
      rating: null,
      createdAt: base,
      updatedAt: base,
    },
    {
      id: "user-watch",
      appUserId: "user-1",
      kind: "movie",
      tmdbId: 1,
      tvdbId: null,
      status: "watchlist",
      title: "Title",
      poster: null,
      backdrop: null,
      year: 2024,
      overview: "",
      rating: null,
      createdAt: base,
      updatedAt: new Date("2026-07-02T00:00:00Z"),
    },
  ];
  const effective = effectiveMediaPreferences(rows, "user-1");
  assert.equal(effective.length, 1);
  assert.equal(effective[0].status, "watchlist");
  assert.equal(effectiveMediaPreferences(rows, "user-1", "hidden").length, 0);
});
