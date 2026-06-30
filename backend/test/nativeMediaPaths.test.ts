import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./mission-control-test.db";
process.env.MEDIA_ROOT = "/media";
process.env.QBITTORRENT_SAVE_ROOT = "/data";
process.env.MEDIA_TV = "tv";
process.env.MEDIA_MOVIES = "movies";

test("native media sends qBittorrent save paths in qB namespace", async () => {
  const { librarySavePath, titleSavePath } = await import("../src/integrations/nativeMedia.js");

  assert.equal(librarySavePath("series"), "/data/tv");
  assert.equal(librarySavePath("movie"), "/data/movies");
  assert.equal(
    titleSavePath(
      "series",
      { title: "Creature Commandos", year: 2024, tmdbId: 219543, tvdbId: 430518 },
      null,
    ),
    "/data/tv/Creature Commandos (2024) [tmdbid-219543] [tvdbid-430518]",
  );
});
