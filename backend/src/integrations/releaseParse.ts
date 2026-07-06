export interface ParsedRelease {
  resolution: number | null;
  codec: string | null;
  source: string | null;
  group: string | null;
  releaseGroup: string | null;
  studioHint: string | null;
  languages: string[];
  voice: "dub" | "mvo" | "dvo" | "avo" | "sub" | "original" | "unknown";
  voiceLabel: string | null;
  hdr: string | null;
  season: number | null;
  episodes: number[];
  episodeRange: { from: number; to: number } | null;
  declaredYears: number[];
  bannedHits: string[];
}

const uniq = <T>(arr: T[]): T[] => [...new Set(arr)];

export function parseReleaseTitle(title: string, bannedWords: string[] = []): ParsedRelease {
  const raw = title ?? "";
  const lower = raw.toLowerCase();
  const resolution =
    /\b2160p\b/i.test(raw) ? 2160 :
    /\b1080p\b/i.test(raw) ? 1080 :
    /\b720p\b/i.test(raw) ? 720 :
    /\b576p\b/i.test(raw) ? 576 :
    /\b480p\b/i.test(raw) ? 480 :
    null;

  const codec =
    /\b(?:x265|h\.?265|hevc)\b/i.test(raw) ? "HEVC" :
    /\b(?:x264|h\.?264|avc)\b/i.test(raw) ? "H264" :
    /\bav1\b/i.test(raw) ? "AV1" :
    null;

  const source =
    /\bweb[- .]?dl\b/i.test(raw) ? "WEB-DL" :
    /\bwebrip\b/i.test(raw) ? "WEBRip" :
    /\bblu[- .]?ray|bdrip|bdremux\b/i.test(raw) ? "BluRay" :
    /\bhdtv\b/i.test(raw) ? "HDTV" :
    /\bdvdrip\b/i.test(raw) ? "DVDRip" :
    null;

  const hdr =
    /\bdolby[ .-]?vision|\bdv\b/i.test(raw) ? "DV" :
    /\bhdr10\+?\b/i.test(raw) ? "HDR10" :
    /\bhdr\b/i.test(raw) ? "HDR" :
    null;

  const languages = uniq([
    ...(/\b(?:rus|ru|russian|dub|mvo|dvo|avo|дубляж|дуб|профессиональный|многоголос|двухголос|авторский|авторская)\b/i.test(raw) ? ["ru"] : []),
    ...(/\b(?:eng|en|english|original)\b/i.test(raw) ? ["en"] : []),
    ...(/\b(?:ukr|ua|ukrainian)\b/i.test(raw) ? ["uk"] : []),
    ...(/\b(?:jpn|japanese)\b/i.test(raw) ? ["ja"] : []),
  ]);

  const voice =
    /\b(?:sub|subs|subtitles|субтитры|сабы)\b/i.test(raw) ? "sub" :
    /\b(?:original|оригинал|orig)\b/i.test(raw) ? "original" :
    /\b(?:avo|авторский|авторская|одноголос)\b/i.test(raw) ? "avo" :
    /\b(?:dvo|двухголос)\b/i.test(raw) ? "dvo" :
    /\b(?:mvo|многоголос|многоголосый|многоголосая)\b/i.test(raw) ? "mvo" :
    /\b(?:dub|dubbed|дубляж|дублированный|дублированная|проф(?:ессиональный)?\.?)\b/i.test(raw) ? "dub" :
    "unknown";
  const voiceLabel =
    voice === "dub" ? "Дубляж" :
    voice === "mvo" ? "Многоголосая" :
    voice === "dvo" ? "Двухголосая" :
    voice === "avo" ? "Авторская" :
    voice === "sub" ? "Субтитры" :
    voice === "original" ? "Оригинал" :
    null;

  const seasonMatch = raw.match(/\bS(\d{1,2})(?:[ ._-]?E(\d{1,3}))?/i) ?? raw.match(/\bseason[ ._-]?(\d{1,2})\b/i);
  const season = seasonMatch ? Number(seasonMatch[1]) : null;
  const rangeMatch = raw.match(/\bS\d{1,2}[ ._-]?E(\d{1,3})[ ._-]?(?:-|–|to|по)[ ._-]?E?(\d{1,3})\b/i);
  const episodeRange = rangeMatch
    ? { from: Number(rangeMatch[1]), to: Number(rangeMatch[2]) }
    : null;
  const episodes = episodeRange
    ? Array.from({ length: Math.max(0, episodeRange.to - episodeRange.from + 1) }, (_, i) => episodeRange.from + i)
    : seasonMatch?.[2] ? [Number(seasonMatch[2])] : [];
  const declaredYears = uniq(
    [...raw.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
      .map((match) => Number(match[1]))
      .filter((year) => Number.isFinite(year)),
  );

  const groupMatch = raw.match(/(?:\s[-–]\s*|\[)([A-Za-z0-9][A-Za-z0-9._-]{1,24})\]?\s*$/);
  const group = groupMatch?.[1] ?? null;
  const studioMatch = raw.match(/\b(?:lostfilm|newstudio|hdrezka|amediateka|кубик(?:и)?\s+в\s+кубе|jaskier|alexfilm|coldfilm)\b/i);
  const studioHint = studioMatch?.[0] ?? null;
  const bannedHits = bannedWords.filter((w) => w && lower.includes(w.toLowerCase()));

  return { resolution, codec, source, group, releaseGroup: group, studioHint, languages, voice, voiceLabel, hdr, season, episodes, episodeRange, declaredYears, bannedHits };
}
