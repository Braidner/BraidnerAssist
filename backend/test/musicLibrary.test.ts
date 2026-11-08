import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";

const trackId = "a".repeat(32);
const secondTrackId = "b".repeat(32);
const albumId = "c".repeat(32);
const movieId = "d".repeat(32);
const hiddenId = "e".repeat(32);
const deniedId = "f".repeat(32);
const jfUser = "1".repeat(32);
const jfEmptyUser = "2".repeat(32);
const secret = "test-jwt-secret";
const linked = jwt.sign({ uid: "linked" }, secret);
const unlinked = jwt.sign({ uid: "unlinked" }, secret);
const admin = jwt.sign({ uid: "empty-admin" }, secret);
const tempDir = mkdtempSync(path.join(tmpdir(), "pultra-music-"));
let upstream: Server;
let server: Server;
let baseUrl: string;
let prisma: PrismaClient;
let jellyfinUrl: string;
let reloadConfig: () => unknown;
let unavailable = false;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function api(route: string, token?: string, method = "GET") {
  return fetch(baseUrl + route, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

before(async () => {
  const rows = [
    { Id: secondTrackId, Type: "Audio", Name: "Second side", ParentIndexNumber: 2, IndexNumber: 1 },
    { Id: trackId, Type: "Audio", Name: "First side", ParentIndexNumber: 1, IndexNumber: 2 },
    { Id: movieId, Type: "Movie", Name: "Outside music" },
    { Id: deniedId, Type: "Audio", Name: "Restricted", PlayAccess: "None" },
  ].map((row) => ({
    Album: "Waves", AlbumId: albumId, AlbumArtist: "Ensemble", Artists: ["Vocalist"], Genres: ["Jazz"],
    ProductionYear: 2021, RunTimeTicks: 125_000_000, DateCreated: "2026-02-03T00:00:00Z", AlbumPrimaryImageTag: "art",
    Path: "/private/path.flac", PlayAccess: "Full", MediaStreams: [{ Type: "Audio", Codec: "flac", BitDepth: 24, SampleRate: 96000 }], ...row,
  }));
  upstream = createServer((req, res) => {
    const url = new URL(req.url!, "http://test");
    if (unavailable) return res.writeHead(503).end("private upstream error");
    if (url.pathname === "/Items" && url.searchParams.get("UserId") === jfEmptyUser && req.headers["x-emby-token"] === "admin-user-token") {
      return res.end(JSON.stringify({ Items: [], TotalRecordCount: 0 }));
    }
    if (req.headers["x-emby-token"] !== "linked-user-token") return res.writeHead(403).end("private upstream error");
    if (url.pathname.startsWith("/Items/") && url.searchParams.get("UserId") === jfUser) {
      const item = rows.find((row) => row.Id === url.pathname.slice("/Items/".length));
      if (!item) return res.writeHead(404).end();
      return res.end(JSON.stringify(item));
    }
    if (url.pathname === "/Items" && url.searchParams.get("UserId") === jfUser && url.searchParams.get("IncludeItemTypes") === "Audio") {
      const id = url.searchParams.get("Ids");
      const offset = Number(url.searchParams.get("StartIndex"));
      // Emulate a server-imposed page limit smaller than Pultra's requested page size.
      // Jellyfin 10.11.11's batch lookup by Ids skips the user's library-root filter.
      const all = [...rows, { ...rows[0], Id: hiddenId }];
      const result = id ? all.filter((r) => r.Id === id) : rows.slice(offset, offset + 1);
      res.setHeader("content-type", "application/json");
      const data = result.map(({ PlayAccess, ...row }) => url.searchParams.get("Fields")?.split(",").includes("PlayAccess")
        ? { ...row, PlayAccess } : row);
      return res.end(JSON.stringify({ Items: data, TotalRecordCount: id ? result.length : rows.length }));
    }
    if (url.pathname === `/Audio/${trackId}/stream` && url.searchParams.get("static") === "true") {
      if (req.headers.range === "bytes=2-5") {
        return res.writeHead(206, { "content-type": "audio/flac", "content-range": "bytes 2-5/8", "content-length": 4, "accept-ranges": "bytes" }).end("2345");
      }
      if (req.headers.range) return res.writeHead(416, { "content-range": "bytes */8" }).end("private upstream error");
      return res.writeHead(200, { "content-type": "audio/flac", "content-length": 8 }).end("01234567");
    }
    return res.writeHead(404).end();
  });
  jellyfinUrl = await listen(upstream);
  process.env.JELLYFIN_URL = jellyfinUrl;
  process.env.JELLYFIN_API_KEY = "service-key";
  process.env.JWT_SECRET = secret;
  process.env.ENV_FILE_PATH = path.join(tempDir, "no-overrides");
  const db = path.join(tempDir, "test.db");
  process.env.DATABASE_URL = `file:${db}`;
  const migrations = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of readdirSync(migrations, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = readFileSync(new URL(`${entry.name}/migration.sql`, migrations));
    execFileSync("sqlite3", [db], { input: sql });
  }
  ({ prisma } = await import("../src/db/client.js"));
  for (const id of ["linked", "unlinked"]) {
    await prisma.appUser.create({ data: { id, username: id, passwordHash: "unused", role: id === "linked" ? "media" : "admin",
      ...(id === "linked" ? { jellyfinUserId: jfUser, jellyfinAccessToken: "linked-user-token" } : {}) } });
  }
  await prisma.appUser.create({ data: { id: "empty-admin", username: "empty-admin", passwordHash: "unused", role: "admin",
    jellyfinUserId: jfEmptyUser, jellyfinAccessToken: "admin-user-token" } });
  ({ reloadConfig } = await import("../src/config.js"));
  const { jwtAuth } = await import("../src/middleware/jwtAuth.js");
  const { musicLibraryRouter, musicStreamRouter } = await import("../src/api/musicLibrary.js");
  const app = express();
  app.use("/api/music/stream", musicStreamRouter);
  app.use("/api/music", jwtAuth, musicLibraryRouter);
  server = createServer(app);
  baseUrl = await listen(server);
});

after(async () => {
  for (const s of [server, upstream]) {
    if (!s) continue;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  await prisma?.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

test("the library groups all visible pages, orders discs, and returns only public metadata", async () => {
  const res = await api("/api/music/library", linked);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.configured, true);
  assert.equal(data.linked, true);
  assert.equal(data.albums.length, 1);
  const album = data.albums[0];
  assert.deepEqual({ ...album, tracks: album.tracks.map((t: { id: string }) => t.id) }, {
    id: albumId, title: "Waves", artist: "Ensemble", year: 2021, genres: ["Jazz"], coverId: albumId,
    addedAt: "2026-02-03T00:00:00Z", tracks: [trackId, secondTrackId],
  });
  assert.deepEqual(album.tracks[0], { id: trackId, title: "First side", artist: "Vocalist", disc: 1, number: 2,
    duration: 12.5, codec: "flac", bitDepth: 24, sampleRate: 96000 });
});

test("unlinked users get an empty library, and unauthenticated requests cannot mint tickets", async () => {
  const res = await api("/api/music/library", unlinked);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { configured: true, linked: false, albums: [] });
  assert.equal((await api(`/api/music/tracks/${trackId}/play`, unlinked, "POST")).status, 403);
  assert.equal((await api(`/api/music/tracks/${trackId}/play`, undefined, "POST")).status, 401);
});

test("a movie, a playback-restricted track and another user's track cannot receive a ticket", async () => {
  for (const id of [movieId, hiddenId, deniedId]) {
    const res = await api(`/api/music/tracks/${id}/play`, linked, "POST");
    assert.equal(res.status, 404);
    assert.equal((await res.json()).url, undefined);
  }
});

test("a linked admin with no visible songs has a linked empty library", async () => {
  const res = await api("/api/music/library", admin);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { configured: true, linked: true, albums: [] });
});

test("an upstream failure produces a local error without leaking its body", async (t) => {
  unavailable = true;
  t.after(() => { unavailable = false; });
  const res = await api("/api/music/library", linked);
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("private upstream"));
});

test("one opaque ticket plays the original track, supports seeking, and expires", async (t) => {
  const res = await api(`/api/music/tracks/${trackId}/play`, linked, "POST");
  assert.equal(res.status, 200);
  const { url } = await res.json();
  assert.match(url, /^\/api\/music\/stream\/[a-zA-Z0-9_-]+$/);
  assert.ok(!url.includes(trackId) && !url.includes("token"));
  assert.equal((await fetch(baseUrl + url, { method: "HEAD" })).headers.get("content-length"), "8");
  const audio = await fetch(baseUrl + url, { headers: { range: "bytes=2-5" } });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get("content-range"), "bytes 2-5/8");
  assert.equal(audio.headers.get("content-type"), "audio/flac");
  assert.match(audio.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(await audio.text(), "2345");
  const invalid = await fetch(baseUrl + url, { headers: { range: "bytes=9-" } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */8");
  assert.ok(!(await invalid.text()).includes("private"));
  const tomorrow = Date.now() + 86_400_000;
  t.mock.method(Date, "now", () => tomorrow);
  assert.equal((await fetch(baseUrl + url)).status, 404);
});

test("revoking the linked account invalidates an existing audio ticket", async (t) => {
  const res = await api(`/api/music/tracks/${trackId}/play`, linked, "POST");
  assert.equal(res.status, 200);
  const { url } = await res.json();
  await prisma.appUser.update({ where: { id: "linked" }, data: { active: false } });
  t.after(() => prisma.appUser.update({ where: { id: "linked" }, data: { active: true } }));
  assert.equal((await fetch(baseUrl + url)).status, 404);
});

test("the dashboard can open music without Jellyfin configuration", async (t) => {
  delete process.env.JELLYFIN_URL;
  reloadConfig();
  t.after(() => { process.env.JELLYFIN_URL = jellyfinUrl; reloadConfig(); });
  const res = await api("/api/music/library", linked);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { configured: false, linked: false, albums: [] });
});
