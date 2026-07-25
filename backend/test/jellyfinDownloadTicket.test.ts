import assert from "node:assert/strict";
import test from "node:test";
import {
  createJellyfinDownloadTicket,
  resolveJellyfinDownloadTicket,
} from "../src/api/jellyfinDownload.js";

test("Jellyfin download ticket resolves its item and expires", () => {
  const now = Date.parse("2026-07-25T12:00:00.000Z");
  const itemId = "0123456789abcdef0123456789abcdef";
  const ticket = createJellyfinDownloadTicket(itemId, now);

  assert.match(ticket, /^[a-f0-9]{48}$/);
  assert.equal(resolveJellyfinDownloadTicket(ticket, now + 1_000), itemId);
  assert.equal(resolveJellyfinDownloadTicket(ticket, now + 16 * 60_000), null);
});

test("Jellyfin download ticket rejects unsafe item ids", () => {
  assert.throws(() => createJellyfinDownloadTicket("../../etc/passwd"), /invalid Jellyfin item id/);
});
