export interface ParsedRelease {
  resolution: number | null;
  codec: string | null;
  source: string | null;
  group: string | null;
  languages: string[];
  hdr: string | null;
  season: number | null;
  episodes: number[];
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
    ...(/\b(?:rus|ru|russian|дубляж|дуб|профессиональный|многоголос)\b/i.test(raw) ? ["ru"] : []),
    ...(/\b(?:eng|en|english|original)\b/i.test(raw) ? ["en"] : []),
    ...(/\b(?:ukr|ua|ukrainian)\b/i.test(raw) ? ["uk"] : []),
    ...(/\b(?:jpn|japanese)\b/i.test(raw) ? ["ja"] : []),
  ]);

  const seasonMatch = raw.match(/\bS(\d{1,2})(?:[ ._-]?E(\d{1,3}))?/i) ?? raw.match(/\bseason[ ._-]?(\d{1,2})\b/i);
  const season = seasonMatch ? Number(seasonMatch[1]) : null;
  const episodes = seasonMatch?.[2] ? [Number(seasonMatch[2])] : [];

  const groupMatch = raw.match(/[-–]\s*([A-Za-z0-9][A-Za-z0-9._-]{1,24})\s*$/);
  const group = groupMatch?.[1] ?? null;
  const bannedHits = bannedWords.filter((w) => w && lower.includes(w.toLowerCase()));

  return { resolution, codec, source, group, languages, hdr, season, episodes, bannedHits };
}
