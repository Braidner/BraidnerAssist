import { parseReleaseTitle, type ParsedRelease } from "./releaseParse.js";

export interface ReleaseQualityProfile {
  name: string;
  kind: "movie" | "series" | "both";
  minResolution: number;
  maxResolution: number;
  preferHdr: boolean;
  allowHdr: boolean;
  allowHevc: boolean;
  allowAv1: boolean;
  preferredLanguages: string[];
  bannedWords: string[];
  maxMovieSizeGb: number | null;
  maxEpisodeSizeGb: number | null;
}

export interface ScoredRelease {
  score: number;
  scoreReasons: string[];
  warnings: string[];
  parsed: ParsedRelease;
}

const GB = 1024 * 1024 * 1024;

const DEFAULTS: ReleaseQualityProfile[] = [
  { name: "1080p balanced", kind: "both", minResolution: 720, maxResolution: 1080, preferHdr: false, allowHdr: true, allowHevc: true, allowAv1: true, preferredLanguages: ["ru", "en"], bannedWords: ["camrip", "ts", "telesync"], maxMovieSizeGb: 18, maxEpisodeSizeGb: 5 },
  { name: "2160p HDR", kind: "movie", minResolution: 1080, maxResolution: 2160, preferHdr: true, allowHdr: true, allowHevc: true, allowAv1: true, preferredLanguages: ["ru", "en"], bannedWords: ["camrip", "ts", "telesync"], maxMovieSizeGb: 60, maxEpisodeSizeGb: 12 },
  { name: "small file", kind: "both", minResolution: 720, maxResolution: 1080, preferHdr: false, allowHdr: true, allowHevc: true, allowAv1: true, preferredLanguages: ["ru", "en"], bannedWords: ["remux", "camrip", "ts"], maxMovieSizeGb: 8, maxEpisodeSizeGb: 2 },
  { name: "RU-first", kind: "both", minResolution: 720, maxResolution: 1080, preferHdr: false, allowHdr: true, allowHevc: true, allowAv1: true, preferredLanguages: ["ru", "en"], bannedWords: ["camrip", "ts"], maxMovieSizeGb: 20, maxEpisodeSizeGb: 5 },
  { name: "original audio", kind: "both", minResolution: 720, maxResolution: 1080, preferHdr: false, allowHdr: true, allowHevc: true, allowAv1: true, preferredLanguages: ["en", "ru"], bannedWords: ["dubbed", "camrip", "ts"], maxMovieSizeGb: 20, maxEpisodeSizeGb: 5 },
];

export async function getQualityProfile(name?: string | null): Promise<ReleaseQualityProfile> {
  return DEFAULTS.find((profile) => profile.name === name) ?? DEFAULTS[0];
}

export function scoreRelease(input: {
  title: string;
  size: number;
  seeders: number | null;
  indexer?: string | null;
  query?: string;
  kind?: "movie" | "series";
  category?: string | null;
  profile: ReleaseQualityProfile;
}): ScoredRelease {
  const parsed = parseReleaseTitle(input.title, input.profile.bannedWords);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (parsed.bannedHits.length) {
    score -= 200;
    warnings.push(`banned: ${parsed.bannedHits.join(", ")}`);
  }
  if (parsed.resolution) {
    if (parsed.resolution >= input.profile.minResolution && parsed.resolution <= input.profile.maxResolution) {
      score += 45;
      reasons.push(`${parsed.resolution}p fits profile`);
    } else if (parsed.resolution > input.profile.maxResolution) {
      score -= 10;
      warnings.push(`${parsed.resolution}p above profile`);
    } else {
      score -= 35;
      warnings.push(`${parsed.resolution}p below profile`);
    }
  }
  if (parsed.hdr) {
    if (!input.profile.allowHdr) {
      score -= 40;
      warnings.push(`${parsed.hdr} not allowed`);
    } else if (input.profile.preferHdr) {
      score += 20;
      reasons.push(parsed.hdr);
    }
  }
  if (parsed.codec === "HEVC" && !input.profile.allowHevc) score -= 30;
  if (parsed.codec === "AV1" && !input.profile.allowAv1) score -= 30;
  if (parsed.codec) {
    score += 8;
    reasons.push(parsed.codec);
  }
  if (parsed.source) {
    score += parsed.source === "WEB-DL" || parsed.source === "BluRay" ? 16 : 8;
    reasons.push(parsed.source);
  }

  const preferred = input.profile.preferredLanguages;
  const langHit = preferred.find((l) => parsed.languages.includes(l));
  if (langHit) {
    score += langHit === preferred[0] ? 28 : 16;
    reasons.push(`${langHit.toUpperCase()} audio`);
  } else if (preferred.length) {
    warnings.push("preferred language not detected");
  }

  const seeders = input.seeders ?? 0;
  score += Math.min(30, Math.floor(Math.log10(seeders + 1) * 12));
  if (seeders <= 0) warnings.push("no seeders reported");

  const maxGb = input.kind === "series" ? input.profile.maxEpisodeSizeGb : input.profile.maxMovieSizeGb;
  if (maxGb && input.size > maxGb * GB) {
    score -= 25;
    warnings.push(`size above ${maxGb} GB`);
  } else if (input.size > 0) {
    score += 6;
  }

  const tokens = (input.query ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 4 && !/^\d+$/.test(t));
  const lower = input.title.toLowerCase();
  const matched = tokens.filter((t) => lower.includes(t)).length;
  if (tokens.length && matched < tokens.length) {
    score -= (tokens.length - matched) * 18;
    warnings.push("partial title match");
  } else if (tokens.length) {
    score += 18;
    reasons.push("title match");
  }

  return { score, scoreReasons: reasons, warnings, parsed };
}
