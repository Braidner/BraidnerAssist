import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./mission-control-test.db";
process.env.MEDIA_ROOT = "/media";
process.env.QBITTORRENT_SAVE_ROOT = "/data";
process.env.MEDIA_TV = "tv";
process.env.MEDIA_MOVIES = "movies";

test("episode repair maps qB save paths into the media namespace", async () => {
  const { qbitSavePathToMediaRel } = await import("../src/integrations/mediaRepair.js");

  assert.equal(
    qbitSavePathToMediaRel("/data/tv/Котёнок по имени Гав (1976) [tmdbid-99955] [tvdbid-178061]"),
    "tv/Котёнок по имени Гав (1976) [tmdbid-99955] [tvdbid-178061]",
  );
  assert.throws(() => qbitSavePathToMediaRel("/tmp/tv/Other"), /QBITTORRENT_SAVE_ROOT/);
});

test("episode repair builds Jellyfin-friendly target names", async () => {
  const { episodeTargetName } = await import("../src/integrations/mediaRepair.js");

  assert.equal(
    episodeTargetName("Котёнок по имени Гав", 1, 5, "MKV"),
    "Котёнок по имени Гав - S01E05.mkv",
  );
  assert.equal(
    episodeTargetName("Bad / Title: Test", 12, 3, "mp4"),
    "Bad Title Test - S12E03.mp4",
  );
});

test("episode repair warns about multi-episode or collection files", async () => {
  const { looksLikeMultiEpisodeFile } = await import("../src/integrations/mediaRepair.js");

  assert.equal(looksLikeMultiEpisodeFile("Show.S01E01-E05.mkv"), true);
  assert.equal(looksLikeMultiEpisodeFile("Котенок по имени Гав (1976-1982) (AI).mkv"), true);
  assert.equal(looksLikeMultiEpisodeFile("Show - S01E03.mkv"), false);
});
