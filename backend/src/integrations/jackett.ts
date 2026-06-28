import { config } from "../config.js";
import type { SearchResult } from "./media.js";
import { getQualityProfile, scoreRelease } from "./releaseScore.js";

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
    const magnet = torznabAttr(it, "magneturl");
    const size = Number(torznabAttr(it, "size") ?? attr(it, "enclosure", "length") ?? tag(it, "size") ?? 0);
    const seeders = Number(torznabAttr(it, "seeders") ?? torznabAttr(it, "seed") ?? 0);
    const category = torznabAttr(it, "category") ?? tag(it, "category");
    return {
      guid,
      title,
      size: Number.isFinite(size) ? size : 0,
      seeders: Number.isFinite(seeders) ? seeders : 0,
      indexer: torznabAttr(it, "jackettindexer") ?? indexer,
      url: magnet ?? enclosureUrl ?? link,
      category,
    };
  });
}

export async function jackettSearch(
  query: string,
  opts: { kind?: "movie" | "series" | "manual"; profileName?: string | null } = {},
): Promise<SearchResult[]> {
  const cfg = config.media.jackett;
  if (!cfg.configured || !query.trim()) return [];
  const profile = await getQualityProfile(opts.profileName);
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 4 && !/^\d+$/.test(t));
  const batches = await Promise.allSettled(indexerIds().map((idx) => searchIndexer(idx, query, opts)));
  const releases = batches.flatMap((b) => (b.status === "fulfilled" ? b.value : []));
  const dedup = new Map<string, SearchResult>();
  for (const r of releases) {
    if (tokens.length && !tokens.every((t) => r.title.toLowerCase().includes(t))) continue;
    const key = (r.url ?? r.guid ?? r.title).toLowerCase();
    if (!dedup.has(key)) dedup.set(key, r);
  }
  return [...dedup.values()]
    .map((r) => ({ ...r, ...scoreRelease({ ...r, query, kind: opts.kind === "manual" ? undefined : opts.kind, profile }) }))
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
