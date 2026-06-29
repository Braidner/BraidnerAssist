import { config } from "../config.js";
import type { SearchResult } from "./media.js";
import { getQualityProfile, scoreRelease, type ReleaseQualityProfile } from "./releaseScore.js";
import { getReleaseDetails } from "./releaseDetails.js";

export interface JackettIndexerHealth {
  id: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  resultCount: number;
  lastError: string | null;
  checkedAt: string | null;
}

let healthCache: { at: number; data: JackettIndexerHealth[] } | null = null;

const MOVIE_CATS = "2000,2010,2020,2030,2040,2045,2050,2060,2070,2080";
const SERIES_CATS = "5000,5010,5020,5030,5040,5045,5050,5060,5070,5080";
const BROAD_CATS = `${MOVIE_CATS},${SERIES_CATS}`;

const decodeXml = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1].trim()) : null;
};

const attr = (xml: string, tagName: string, attrName: string): string | null => {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(m[1]) : null;
};

const torznabAttr = (xml: string, name: string): string | null => {
  const re = new RegExp(`<torznab:attr\\b[^>]*\\bname=["']${name}["'][^>]*\\bvalue=["']([^"']*)["'][^>]*/?>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(m[1]) : null;
};

const first = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const num = (...values: Array<string | null | undefined>): number | null => {
  const value = first(...values);
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const cleanDescription = (value: string | null): string | null => {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
};

const safeHttpUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

async function enrichDetails(releases: SearchResult[]): Promise<SearchResult[]> {
  return Promise.all(releases.map(async (release) => {
    const details = await getReleaseDetails(release.detailUrl).catch(() => null);
    if (!details) return release;
    return {
      ...release,
      details,
      posterRemote: details.posterRemote ?? release.posterRemote,
      description: details.summary ?? release.description,
      seeders: details.stats?.seeders ?? release.seeders,
      leechers: details.stats?.leechers ?? release.leechers,
      grabs: details.stats?.completed ?? release.grabs,
    };
  }));
}

function itemBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
}

function indexerIds(): string[] {
  const raw = config.media.jackett.indexers || "all";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function categoryFor(kind?: "movie" | "series" | "manual"): string {
  if (kind === "movie") return MOVIE_CATS;
  if (kind === "series") return SERIES_CATS;
  return BROAD_CATS;
}

async function searchIndexer(indexer: string, query: string, opts: { kind?: "movie" | "series" | "manual" }): Promise<SearchResult[]> {
  const cfg = config.media.jackett;
  if (!cfg.configured) return [];
  const url = new URL(`${cfg.url}/api/v2.0/indexers/${encodeURIComponent(indexer)}/results/torznab/api`);
  url.searchParams.set("apikey", cfg.apiKey!);
  url.searchParams.set("t", "search");
  url.searchParams.set("q", query);
  url.searchParams.set("cat", categoryFor(opts.kind));
  const res = await fetch(url, { signal: AbortSignal.timeout(18_000) });
  if (!res.ok) throw new Error(`Jackett ${indexer} ${res.status}`);
  const xml = await res.text();
  return itemBlocks(xml).map((it, i) => {
    const title = tag(it, "title") ?? "—";
    const guid = tag(it, "guid") ?? `${indexer}-${i}-${title}`;
    const enclosureUrl = attr(it, "enclosure", "url");
    const link = tag(it, "link");
    const comments = tag(it, "comments");
    const magnet = torznabAttr(it, "magneturl");
    const size = num(torznabAttr(it, "size"), attr(it, "enclosure", "length"), tag(it, "size")) ?? 0;
    const seeders = num(torznabAttr(it, "seeders"), torznabAttr(it, "seed")) ?? 0;
    const leechers = num(torznabAttr(it, "leechers"), torznabAttr(it, "leeches"), torznabAttr(it, "leech"));
    const peers = num(torznabAttr(it, "peers"));
    const grabs = num(torznabAttr(it, "grabs"), torznabAttr(it, "downloads"));
    const category = first(torznabAttr(it, "category"), tag(it, "category"));
    const trackerName = first(torznabAttr(it, "jackettindexer"), torznabAttr(it, "tracker"), torznabAttr(it, "site"), indexer) ?? indexer;
    const posterRemote = safeHttpUrl(first(
      torznabAttr(it, "poster"),
      torznabAttr(it, "cover"),
      torznabAttr(it, "banner"),
      torznabAttr(it, "image"),
      attr(it, "media:thumbnail", "url"),
      attr(it, "media:content", "url"),
      tag(it, "image"),
    ));
    const published = first(tag(it, "pubDate"), tag(it, "published"), tag(it, "dc:date"));
    const publishDate = published ? new Date(published) : null;
    return {
      guid,
      indexerId: indexer,
      title,
      size,
      seeders,
      leechers,
      peers,
      grabs,
      indexer: trackerName,
      trackerName,
      trackerId: indexer,
      url: magnet ?? enclosureUrl ?? link,
      detailUrl: safeHttpUrl(first(comments, link)),
      publishDate: publishDate && Number.isFinite(publishDate.getTime()) ? publishDate.toISOString() : published,
      description: cleanDescription(tag(it, "description")),
      posterRemote,
      imdb: first(torznabAttr(it, "imdb"), tag(it, "imdb")),
      tmdb: first(torznabAttr(it, "tmdb"), tag(it, "tmdb")),
      infoHash: first(torznabAttr(it, "infohash"), torznabAttr(it, "info_hash")),
      category,
    };
  });
}

export async function jackettSearch(
  query: string,
  opts: { kind?: "movie" | "series" | "manual"; profileName?: string | null; profile?: ReleaseQualityProfile } = {},
): Promise<SearchResult[]> {
  const cfg = config.media.jackett;
  if (!cfg.configured || !query.trim()) return [];
  const profile = opts.profile ?? await getQualityProfile(opts.profileName);
  const batches = await Promise.allSettled(indexerIds().map((idx) => searchIndexer(idx, query, opts)));
  if (batches.length > 0 && batches.every((b) => b.status === "rejected")) {
    const first = batches[0];
    throw new Error(first.status === "rejected" ? String(first.reason) : "Jackett search failed");
  }
  const releases = batches.flatMap((b) => (b.status === "fulfilled" ? b.value : []));
  const dedup = new Map<string, SearchResult>();
  for (const r of releases) {
    const key = (r.url ?? r.guid ?? r.title).toLowerCase();
    if (!dedup.has(key)) dedup.set(key, { ...r, query });
  }
  const scored = [...dedup.values()]
    .map((r) => {
      const scored = scoreRelease({ ...r, query, kind: opts.kind === "manual" ? undefined : opts.kind, profile });
      return {
        ...r,
        ...scored,
        voice: scored.parsed.voice,
        voiceLabel: scored.parsed.voiceLabel,
        releaseGroup: scored.parsed.releaseGroup,
        studioHint: scored.parsed.studioHint,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.seeders ?? 0) - (a.seeders ?? 0))
    .slice(0, 50);
  return enrichDetails(scored);
}

export async function jackettSearchMany(
  queries: string[],
  opts: { kind?: "movie" | "series" | "manual"; profileName?: string | null; profile?: ReleaseQualityProfile } = {},
): Promise<SearchResult[]> {
  const seenQueries = new Set<string>();
  const dedup = new Map<string, SearchResult>();
  const uniqueQueries: string[] = [];
  for (const query of queries.map((q) => q.trim()).filter(Boolean)) {
    const queryKey = query.toLowerCase();
    if (seenQueries.has(queryKey)) continue;
    seenQueries.add(queryKey);
    uniqueQueries.push(query);
  }
  const batches = await Promise.allSettled(uniqueQueries.map((query) => jackettSearch(query, opts)));
  if (batches.length > 0 && batches.every((b) => b.status === "rejected")) {
    const first = batches[0];
    throw new Error(first.status === "rejected" ? String(first.reason) : "Jackett search failed");
  }
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    const results = batch.value;
    for (const r of results) {
      const key = (r.url ?? r.guid ?? r.title).toLowerCase();
      const prev = dedup.get(key);
      if (!prev || (r.score ?? 0) > (prev.score ?? 0)) dedup.set(key, r);
    }
  }
  return [...dedup.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.seeders ?? 0) - (a.seeders ?? 0))
    .slice(0, 50);
}

export async function jackettHealth(force = false): Promise<JackettIndexerHealth[]> {
  const cfg = config.media.jackett;
  if (!cfg.configured) return [{ id: "all", configured: false, ok: false, latencyMs: null, resultCount: 0, lastError: "Jackett not configured", checkedAt: null }];
  if (!force && healthCache && Date.now() - healthCache.at < config.poll.jackettHealth) return healthCache.data;
  const checkedAt = new Date().toISOString();
  const data = await Promise.all(indexerIds().map(async (id) => {
    const started = Date.now();
    try {
      const results = await searchIndexer(id, "test", { kind: "manual" });
      return { id, configured: true, ok: true, latencyMs: Date.now() - started, resultCount: results.length, lastError: null, checkedAt };
    } catch (e) {
      return { id, configured: true, ok: false, latencyMs: Date.now() - started, resultCount: 0, lastError: String(e), checkedAt };
    }
  }));
  healthCache = { at: Date.now(), data };
  return data;
}
