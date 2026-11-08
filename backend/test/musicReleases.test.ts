import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

const folder = mkdtempSync(path.join(tmpdir(), "pultra-music-downloads-"));
Object.assign(process.env, {
  DATABASE_URL: 'file:' + path.join(folder, "test.db"),
  JACKETT_URL: "http://jackett.test", JACKETT_API_KEY: "tracker-secret",
  QBITTORRENT_URL: "http://qb.test", QBITTORRENT_USER: "test", QBITTORRENT_PASSWORD: "test",
  JELLYFIN_URL: "http://jf.test", JELLYFIN_API_KEY: "test",
  JWT_SECRET: "test", ENV_FILE_PATH: path.join(folder, ".env"),
  MEDIA_ROOT: path.join(folder, "media"), QBITTORRENT_SAVE_ROOT: "/data", MEDIA_MUSIC: "music",
});
const hash = "a".repeat(40);
const info = "d6:lengthi12e4:name9:song.flac12:piece lengthi16e6:pieces20:aaaaaaaaaaaaaaaaaaaae";
const fileHash = createHash("sha1").update(info).digest("hex");
const rows = [
  ["Album [FLAC]", "3040", "magnet:?xt=urn:btih:" + hash],
  ["Other album FLAC", "3000", "http://jackett.test/dl/music/?jackett_apikey=tracker-secret"],
  ["Redirect FLAC", "3040", "http://jackett.test/dl/redirect/"],
  ["Unsafe FLAC", "3040", "http://untrusted.test/music.torrent"],
  ["Internal FLAC", "3040", "http://jackett.test/UI/Dashboard"],
  ["Movie FLAC", "2000", "magnet:?xt=urn:btih:" + "b".repeat(40)],
  ["MP3 album", "3010", "magnet:?xt=urn:btih:" + "c".repeat(40)],
  ["Album lossless", "3040", "magnet:?xt=urn:btih:" + "d".repeat(40)],
];
const xml = "<rss><channel>" + rows.map(([title, category, source]) =>
  '<item><title>' + title + '</title><enclosure url="' + source + '" length="540"/>' +
  '<jackettindexer id="test-source">Real Source</jackettindexer><torznab:attr name="category" value="' + category + '"/>' +
  (title.startsWith('Other') ? '' : '<torznab:attr name="seeders" value="9"/>') + '<pubDate>Mon, 09 Nov 2026 12:00:00 GMT</pubDate></item>'
).join("") + "</channel></rss>";
const qbRows = new Map<string, { hash: string; progress: number; category: string; state: string; save_path: string }>();
let adds = 0, scans = 0;
const actions: string[] = [];
let scanFails = false;
let movieStarted: (() => void) | undefined;
const nativeFetch = globalThis.fetch;
let server: Server, base: string;
let prisma: typeof import("../src/db/client.js").prisma;
const token = (uid: string) => jwt.sign({ sub: uid, uid }, "test");
const api = (url: string, user = "listener", method = "GET") =>
  nativeFetch(base + url, { method, headers: user ? { Authorization: "Bearer " + token(user) } : {} });
before(async () => {
  for (const name of readdirSync("prisma/migrations", { withFileTypes: true }).filter(f => f.isDirectory()).map(f => f.name).sort()) {
    execFileSync("sqlite3", [path.join(folder, "test.db")], {
      input: readFileSync(path.join("prisma/migrations", name, "migration.sql")),
    });
  }
  ({ prisma } = await import("../src/db/client.js"));
  for (const [id, role] of [["listener", "media"], ["owner", "admin"], ["race", "media"]]) {
    await prisma.appUser.create({ data: { id, username: id, passwordHash: "hash", role, downloadLimitDaily: 1 } });
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/results/torznab")) {
      assert(url.searchParams.get("cat")?.includes("3040"));
      assert(!url.searchParams.get("cat")?.includes("2000"));
      return new Response(url.searchParams.get("q") === "race" ? xml.replace(hash, "f".repeat(40)) : xml);
    }
    if (url.pathname.startsWith("/dl/redirect")) return new Response(null, { status: 302, headers: { Location: "http://untrusted.test/grab" } });
    if (url.pathname.startsWith("/dl/music")) return new Response('d4:info' + info + 'e');
    if (url.pathname.endsWith("/auth/login")) return new Response("Ok.", { headers: { "Set-Cookie": "SID=test" } });
    if (url.pathname.endsWith("/torrents/info")) {
      return Response.json([...qbRows.values()].filter(row =>
        (!url.searchParams.has("hashes") || url.searchParams.get("hashes")?.split("|").includes(row.hash)) &&
        (!url.searchParams.has("category") || url.searchParams.get("category") === row.category)));
    }
    if (/\/torrents\/(stop|start|delete)$/.test(url.pathname)) {
      actions.push((init!.body as URLSearchParams).get("hashes")!);
      return new Response("Ok.");
    }
    if (url.pathname.endsWith("/torrents/add")) {
      const form = init?.body as FormData | URLSearchParams;
      if (!form.has("category")) {
        movieStarted?.();
        await new Promise(resolve => setTimeout(resolve, 50));
        return Response.json({ added_torrent_ids: ["e".repeat(40)] });
      }
      assert.equal(form.get("savepath"), "/data/music");
      assert.equal(form.get("autoTMM"), "false");
      assert.equal(form.get("category"), "mc-music");
      const h = form.has("torrents") ? fileHash : hash;
      ++adds;
      qbRows.set(h, { hash: h, progress: 0.999, category: "mc-music", state: "downloading", save_path: "/data/music" });
      return new Response("Ok.");
    }
    if (url.pathname === "/Library/Refresh") {
      ++scans;
      return new Response(null, { status: scanFails ? 503 : 204 });
    }
    throw new Error("Unexpected upstream " + url.origin + url.pathname);
  };
  const { apiRouter } = await import("../src/api/index.js");
  const { jwtAuth } = await import("../src/middleware/jwtAuth.js");
  const app = express().use(express.json()).use("/api", jwtAuth, apiRouter);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api";
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>(resolve => server?.close(() => resolve()) ?? resolve());
  await prisma?.$disconnect();
  rmSync(folder, { recursive: true, force: true });
});
test("Torznab searches return only advertised FLAC with user-scoped handles and no source URLs", async () => {
  assert.equal((await api("/music/releases", "")).status, 401);
  assert.equal((await api("/musical")).status, 403);
  const result = await api("/music/releases?q=album");
  assert.equal(result.status, 200);
  const response = await result.json();
  assert.equal(response.configured, true);
  assert.equal(response.qbConfigured, true);
  assert.deepEqual(response.releases.map((r: { title: string }) => r.title).sort(), ["Album [FLAC]", "Other album FLAC", "Redirect FLAC"]);
  assert(!/magnet:|tracker-secret|https?:|Hi-Res/i.test(JSON.stringify(response)));
  assert(response.releases.every((r: { quality: string }) => r.quality === "FLAC"));
  assert(response.releases.every((r: { indexer: string }) => r.indexer === "Real Source"));
  assert.equal(response.releases.find((r: {title: string}) => r.title.startsWith("Other")).seeders, null);
  const ref = response.releases[0].id;
  assert.equal((await api("/music/releases/" + ref + "/grab", "owner", "POST")).status, 410);
  const recent = await (await api("/music/releases", "owner")).json();
  assert.equal(recent.releases.length, 3);
});
test("music grabs reserve quota once, isolate downloads, guard redirects and scan after exact completion", async () => {
  const { releases } = await (await api("/music/releases")).json();
  const ref = (name: string) => releases.find((r: {title: string}) => r.title.startsWith(name)).id;
  const grab = (id: string, who = "listener") => api("/music/releases/" + id + "/grab", who, "POST");
  assert.equal((await grab(ref("Redirect"))).status, 502);
  const requests = await Promise.all([grab(ref("Album")), grab(ref("Album"))]);
  assert.deepEqual(requests.map(r => r.status), [200, 200]);
  assert.equal(adds, 1);
  assert.equal((await grab(ref("Other"))).status, 429);
  assert.equal(adds, 1);
  assert.equal(await prisma.userDownload.count({ where: { appUserId: "listener" } }), 1);
  const own = await (await api("/music/downloads")).json();
  assert.equal(own.downloads.length, 1);
  assert.equal(own.downloads[0].progress, 99);
  assert.deepEqual((await (await api("/music/downloads", "owner")).json()).downloads, []);
  const { reconcileMusicDownloads } = await import("../src/integrations/musicReleases.js");
  await reconcileMusicDownloads();
  assert.equal(scans, 0);
  qbRows.get(hash)!.progress = 1;
  assert.equal((await (await api("/music/downloads")).json()).downloads[0].status, "scan-pending");
  scanFails = true;
  await reconcileMusicDownloads().catch(() => {});
  scanFails = false;
  await reconcileMusicDownloads();
  await reconcileMusicDownloads();
  assert.equal(scans, 2);
  assert.equal((await (await api("/music/downloads")).json()).downloads[0].status, "scan-requested");
  const ownerReleases = (await (await api("/music/releases", "owner")).json()).releases;
  const other = ownerReleases.find((r: {title: string}) => r.title.startsWith("Other"));
  assert.equal((await grab(other.id, "owner")).status, 200);
  assert.equal(adds, 2);
  assert.equal(await prisma.userDownload.count({ where: { appUserId: "owner", infohash: fileHash } }), 1);
});

test("simultaneous movie and music requests cannot spend the same remaining quota slot", async () => {
  const recent = await (await api("/music/releases?q=race", "race")).json();
  const music = recent.releases.find((r: {title: string}) => r.title.startsWith("Album"));
  const started = new Promise<void>(resolve => { movieStarted = resolve; });
  const movie = nativeFetch(base + "/media/torrent", {
    method: "POST", headers: { Authorization: "Bearer " + token("race"), "Content-Type": "application/json" },
    body: JSON.stringify({ url: "magnet:?xt=urn:btih:" + "e".repeat(40) }),
  });
  await started;
  const grab = await api("/music/releases/" + music.id + "/grab", "race", "POST");
  assert.equal((await movie).status, 200);
  assert.equal(grab.status, 429);
  assert.equal(await prisma.userDownload.count({ where: { appUserId: "race" } }), 1);
});

const jsonPost = (url: string, data: object, who = "listener") => nativeFetch(base + url, {
  method: "POST", headers: { Authorization: "Bearer " + token(who), "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

test("legacy media queue hides music and cannot control another account's music torrent", async () => {
  const queued = "5".repeat(40), relabeled = "6".repeat(40), externalMusic = "7".repeat(40), movie = "8".repeat(40);
  for (const [h, category] of [[queued, "mc-music"], [relabeled, ""], [externalMusic, "mc-music"], [movie, "mc-library"]]) {
    qbRows.set(h, { hash: h, progress: 0.5, category, state: "downloading", save_path: "/data" });
  }
  for (const h of [queued, relabeled]) {
    await prisma.musicDownload.create({ data: { appUserId: "owner", infohash: h, title: "Private recording" } });
  }
  const { downloads } = await (await api("/media")).json();
  const visible = downloads.map((d: {hash: string}) => d.hash);
  assert(visible.includes(movie));
  assert(![queued, relabeled, externalMusic].some(h => visible.includes(h)));
  for (const h of [queued, relabeled, externalMusic]) {
    for (const action of ["pause", "resume", "delete"]) {
      assert.equal((await jsonPost("/media/torrent/" + h + "/" + action, { deleteFiles: true })).status, 404);
    }
  }
  for (const h of ["all", movie + "%7C" + queued]) {
    assert.equal((await jsonPost("/media/torrent/" + h + "/delete", {deleteFiles: true})).status, 400);
  }
  assert.deepEqual(actions, []);
  assert.equal((await jsonPost("/media/torrent/" + movie + "/pause", {})).status, 200);
  assert.deepEqual(actions, [movie]);
});

test("the shared video file manager cannot enumerate, change or alias the music directory", async () => {
  const root = process.env.MEDIA_ROOT!;
  mkdirSync(path.join(root, "music"), {recursive:true});
  mkdirSync(path.join(root, "movies"), {recursive:true});
  writeFileSync(path.join(root, "music", "private.flac"), "flac");
  symlinkSync("music", path.join(root, "alias"));
  assert.deepEqual((await (await api("/media/files")).json()).entries.map((e: {name:string}) => e.name), ["movies"]);
  for (const pathname of ["music", "movies/../music", "alias"]) {
    assert.equal((await api("/media/files?path=" + encodeURIComponent(pathname))).status, 400);
  }
  for (const [action, body] of [
    ["mkdir", {path:"music",name:"bad"}], ["move",{src:"movies",dest:"music"}], ["rename",{path:"movies", name:"music"}],
    ["rename",{path:"music",name:"other"}], ["delete",{path:"alias/private.flac"}], ["delete",{path:"music"}],
  ] as const) {
    assert.equal((await jsonPost("/media/files/" + action, body)).status, 400);
  }
  assert.equal(readFileSync(path.join(root, "music", "private.flac"), "utf8"), "flac");
  assert.equal((await jsonPost("/media/files/mkdir", {path:"movies", name:"new"})).status, 200);
});

test("raw torrent requests cannot borrow a music hash as a quota exemption for another URL", async () => {
  const uid = "raw-quota";
  await prisma.appUser.create({ data: { id: uid, username: uid, passwordHash: "x", downloadLimitTotal: 1 } });
  const paid = "9".repeat(40);
  await prisma.userDownload.create({ data: { appUserId: uid, infohash: paid } });
  const foreignUrl = base + "/no-torrent?xt=urn:btih:" + paid;
  assert.equal((await jsonPost("/media/torrent", {url: foreignUrl}, uid)).status, 429);
  const batch = "magnet:?xt=urn:btih:" + paid + "&dn=first\nmagnet:?xt=urn:btih:" + "b".repeat(40);
  assert.equal((await jsonPost("/media/torrent", {url: batch}, uid)).status, 400);
});
