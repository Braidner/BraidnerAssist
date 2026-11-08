import { createHash } from "node:crypto";
import { config } from "../config.js";

type ResolvedMusicTorrent = { infohash: string; magnet: string } | { infohash: string; bytes: Buffer };
const invalid = () => new Error("Некорректный источник музыкальной раздачи");
const MAX_BYTES = 8 * 1024 * 1024;

function magnetHash(url: URL): string | null {
  const topics = url.searchParams.getAll("xt");
  const v1 = topics.find(t => /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(t))?.slice(9);
  if (v1?.length === 40) return v1.toLowerCase();
  if (v1) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const bits = [...v1.toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
    return Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2))).toString("hex");
  }
  // qBittorrent uses the truncated SHA-256 as the torrent ID for v2-only torrents.
  return topics.find(t => /^urn:btmh:1220[a-f0-9]{64}$/i.test(t))?.slice(13, 53).toLowerCase() ?? null;
}

export function musicTorrentSource(value: string | null, relativeTo = config.media.jackett.url): URL | null {
  if (!value || !relativeTo || value.length > 16_384 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value, relativeTo);
    if (url.protocol === "magnet:") {
      if (url.pathname || url.host || !magnetHash(url)) return null;
      // Keep tracker and display-name fields, drop secondary HTTP download sources.
      for (const key of new Set(url.searchParams.keys())) {
        if (!["xt", "dn", "tr"].includes(key)) url.searchParams.delete(key);
      }
      return url;
    }
    const jackett = new URL(config.media.jackett.url!);
    const prefix = jackett.pathname.replace(/\/$/, "") + "/dl/";
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== jackett.origin ||
        url.username || url.password || !url.pathname.startsWith(prefix) ||
        !/^[\w-]+\/?$/.test(url.pathname.slice(prefix.length))) return null;
    return url;
  } catch {
    return null;
  }
}

// Hash the original bencoded info dictionary. Binary names and piece data must
// survive byte-for-byte, including the file tree in BitTorrent v2.
function torrentFileHash(bytes: Buffer): string {
  let cursor = 0, infoStart = -1, infoEnd = -1, v2 = false, pieces = false;
  const readString = (): Buffer => {
    const start = cursor;
    while (bytes[cursor] >= 48 && bytes[cursor] <= 57 && cursor - start <= 8) cursor++;
    if (cursor === start || bytes[cursor] !== 58) throw invalid();
    const length = Number(bytes.toString("ascii", start, cursor));
    const end = ++cursor + length;
    if (end > bytes.length) throw invalid();
    const result = bytes.subarray(cursor, end);
    cursor = end;
    return result;
  };
  function readValue(depth: number): void {
    if (depth > 64 || cursor >= bytes.length) throw invalid();
    const start = cursor;
    const type = bytes[cursor];
    if (type === 100 || type === 108) { // dictionary or list
      cursor++;
      while (bytes[cursor] !== 101) {
        const key = type === 100 ? readString() : null;
        const valueStart = cursor;
        const isInfo = depth === 0 && key?.equals(Buffer.from("info"));
        if (isInfo) {
          if (infoStart >= 0 || bytes[cursor] !== 100) throw invalid();
          infoStart = cursor;
        }
        readValue(depth + 1);
        if (isInfo) infoEnd = cursor;
        if (start === infoStart && key) {
          if (key.equals(Buffer.from("pieces"))) pieces = true;
          if (key.equals(Buffer.from("meta version"))) v2 = bytes.toString("ascii", valueStart, cursor) === "i2e";
        }
      }
      cursor++;
    } else if (type === 105) { // integer
      const end = bytes.indexOf(101, cursor + 1);
      if (end < 0 || end - cursor > 22 || !/^-?\d+$/.test(bytes.toString("ascii", cursor + 1, end))) throw invalid();
      cursor = end + 1;
    } else {
      readString();
    }
  }
  readValue(0);
  if (cursor !== bytes.length || infoEnd <= infoStart || (!v2 && !pieces)) throw invalid();
  return createHash(v2 && !pieces ? "sha256" : "sha1").update(bytes.subarray(infoStart, infoEnd)).digest("hex").slice(0, 40);
}

export async function resolveMusicTorrent(source: string, depth = 0): Promise<ResolvedMusicTorrent> {
  const url = musicTorrentSource(source);
  if (!url || depth > 3) throw invalid();
  if (url.protocol === "magnet:") return { magnet: url.href, infohash: magnetHash(url)! };
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    const target = musicTorrentSource(response.headers.get("location"), url.href);
    if (!target) throw invalid();
    return resolveMusicTorrent(target.href, depth + 1);
  }
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw invalid();
  }
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw invalid();
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks, length);
  if (bytes.subarray(0, 7).toString() === "magnet:") {
    return resolveMusicTorrent(bytes.toString().trim(), depth + 1);
  }
  return { infohash: torrentFileHash(bytes), bytes };
}
