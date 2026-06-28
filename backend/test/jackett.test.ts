import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { ReleaseQualityProfile } from "../src/integrations/releaseScore.js";

process.env.DATABASE_URL ??= "file:./mission-control-test.db";
process.env.JACKETT_URL = "http://jackett.test";
process.env.JACKETT_API_KEY = "test-key";
process.env.JACKETT_INDEXERS = "all";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item>
      <title>The.Naked.Gun.2025.1080p.WEB-DL.RU.EN</title>
      <guid>release-1</guid>
      <enclosure url="magnet:?xt=urn:btih:abc" length="2147483648" />
      <torznab:attr name="seeders" value="42" />
      <torznab:attr name="size" value="2147483648" />
      <torznab:attr name="jackettindexer" value="mock-indexer" />
    </item>
  </channel>
</rss>`;

const requests: URL[] = [];
const profile: ReleaseQualityProfile = {
  name: "test",
  kind: "both",
  minResolution: 720,
  maxResolution: 1080,
  preferHdr: false,
  allowHdr: true,
  allowHevc: true,
  allowAv1: true,
  preferredLanguages: ["ru", "en"],
  bannedWords: ["camrip", "ts"],
  maxMovieSizeGb: 18,
  maxEpisodeSizeGb: 5,
};

before(() => {
  globalThis.fetch = async (input: string | URL | Request) => {
    requests.push(new URL(String(input)));
    return new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
  };
});

test("localized query keeps English Jackett result as a partial title match", async () => {
  const { jackettSearch } = await import("../src/integrations/jackett.js");

  const results = await jackettSearch("Голый пистолет", { kind: "movie", profile });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "The.Naked.Gun.2025.1080p.WEB-DL.RU.EN");
  assert.equal(results[0].query, "Голый пистолет");
  assert.ok(results[0].warnings?.includes("partial title match"));
});

test("fallback queries dedupe the same torrent and keep the best-scored query", async () => {
  const { jackettSearchMany } = await import("../src/integrations/jackett.js");

  const results = await jackettSearchMany(
    ["Голый пистолет", "The Naked Gun", "The Naked Gun 2025"],
    { kind: "movie", profile },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].url, "magnet:?xt=urn:btih:abc");
  assert.equal(results[0].query, "The Naked Gun");
  assert.ok(requests.some((url) => url.searchParams.get("q") === "Голый пистолет"));
  assert.ok(requests.some((url) => url.searchParams.get("q") === "The Naked Gun"));
});
