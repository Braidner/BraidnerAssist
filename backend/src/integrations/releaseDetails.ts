import { TextDecoder } from "node:util";
import { prisma } from "../db/client.js";

export interface ReleaseDetails {
  provider: string;
  rawUrl: string;
  title?: string | null;
  posterRemote?: string | null;
  summary?: string | null;
  technical?: {
    quality?: string | null;
    video?: string | null;
    audio?: string | null;
    translation?: string | null;
    voiceCodes?: string[];
    voiceLabels?: string[];
    duration?: string | null;
    size?: string | null;
    uploadedAt?: string | null;
    updatedAt?: string | null;
    fileCount?: number | null;
  };
  ratings?: {
    imdb?: string | null;
    kinopoisk?: string | null;
    tracker?: string | null;
  };
  stats?: {
    seeders?: number | null;
    leechers?: number | null;
    completed?: number | null;
    comments?: number | null;
  };
}

const OK_TTL = 7 * 24 * 60 * 60 * 1000;
const ERROR_TTL = 6 * 60 * 60 * 1000;
const WIN1251 = new TextDecoder("windows-1251");

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function clean(value?: string | null): string | null {
  const text = decodeHtml(String(value ?? ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function numberFrom(value?: string | null): number | null {
  const m = String(value ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

function attr(html: string, tagPattern: string, attrName: string): string | null {
  const m = html.match(new RegExp(`<${tagPattern}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, "i"));
  return m ? decodeHtml(m[1]) : null;
}

function meta(html: string, property: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!new RegExp(`\\b(?:property|name)=["']${property}["']`, "i").test(tag)) continue;
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) return decodeHtml(content);
  }
  return null;
}

function absoluteUrl(base: string, value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.startsWith("//") ? `https:${value}` : value, base).toString();
  } catch {
    return null;
  }
}

function voiceData(...values: Array<string | null | undefined>): { voiceCodes: string[]; voiceLabels: string[] } {
  const text = values.filter(Boolean).join(" ");
  const codes = new Set<string>();
  const labels = new Map<string, string>([
    ["ПМ", "Проф. многоголосый"],
    ["ПО", "Проф. одноголосый"],
    ["ЛМ", "Люб. многоголосый"],
    ["ЛО", "Люб. одноголосый"],
  ]);
  for (const code of labels.keys()) {
    if (new RegExp(`(?:^|[^А-ЯA-Z])${code}(?:$|[^А-ЯA-Z])`, "iu").test(text)) codes.add(code);
  }
  if (/профессиональн\w+\s+многоголос/i.test(text)) codes.add("ПМ");
  if (/профессиональн\w+\s+одноголос/i.test(text)) codes.add("ПО");
  if (/любительск\w+\s+многоголос/i.test(text)) codes.add("ЛМ");
  if (/любительск\w+\s+одноголос/i.test(text)) codes.add("ЛО");
  return {
    voiceCodes: [...codes],
    voiceLabels: [...codes].map((code) => labels.get(code) ?? code),
  };
}

function normalizedDetailUrl(value?: string | null): { provider: "kinozal"; url: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "kinozal.tv") return null;
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return null;
    return { provider: "kinozal", url: `https://kinozal.tv/details.php?id=${id}` };
  } catch {
    return null;
  }
}

function liValue(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const items = html.match(/<li\b[\s\S]*?<\/li>/gi) ?? [];
  const item = items.find((it) => new RegExp(escaped, "i").test(clean(it) ?? ""));
  return clean(item?.match(/<span[^>]*class=["'][^"']*floatright[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
}

function bValue(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<b>\\s*${escaped}:\\s*</b>\\s*([\\s\\S]*?)(?:<br\\s*\\/?>|</h2>|</div>)`, "i");
  return clean(html.match(re)?.[1]);
}

export function parseKinozalDetails(html: string, rawUrl: string): ReleaseDetails {
  const poster = absoluteUrl(rawUrl, meta(html, "og:image") ?? attr(html, "img[^>]*class=[\"']p200[\"']", "src"));
  const about = html.match(/<b>\s*О фильме:\s*<\/b>\s*([\s\S]*?)<\/p>/i)?.[1];
  const trackerRating = html.match(/itemprop=["']ratingValue["'][^>]*>([^<]+)</i)?.[1];
  const title = clean(meta(html, "og:title") ?? html.match(/<h1[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
  const translation = bValue(html, "Перевод");
  const voices = voiceData(title, translation);
  return {
    provider: "kinozal",
    rawUrl,
    title,
    posterRemote: poster,
    summary: clean(about ?? meta(html, "description")),
    technical: {
      quality: bValue(html, "Качество"),
      video: bValue(html, "Видео"),
      audio: bValue(html, "Аудио"),
      translation,
      voiceCodes: voices.voiceCodes,
      voiceLabels: voices.voiceLabels,
      duration: bValue(html, "Продолжительность"),
      size: bValue(html, "Размер") ?? liValue(html, "Вес"),
      uploadedAt: liValue(html, "Залит"),
      updatedAt: liValue(html, "Обновлен"),
      fileCount: numberFrom(html.match(/Список файлов<span[^>]*>([^<]+)</i)?.[1]),
    },
    ratings: {
      imdb: liValue(html, "IMDb"),
      kinopoisk: liValue(html, "Кинопоиск"),
      tracker: clean(trackerRating),
    },
    stats: {
      seeders: numberFrom(html.match(/Раздают<span[^>]*>([^<]+)</i)?.[1]),
      leechers: numberFrom(html.match(/Скачивают<span[^>]*>([^<]+)</i)?.[1]),
      completed: numberFrom(html.match(/Скачали<span[^>]*>([^<]+)</i)?.[1]),
      comments: numberFrom(html.match(/Комментариев<span[^>]*>([^<]+)</i)?.[1]),
    },
  };
}

async function fetchKinozal(url: string): Promise<ReleaseDetails> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Kinozal ${res.status}`);
  const html = WIN1251.decode(await res.arrayBuffer());
  return parseKinozalDetails(html, url);
}

export async function getReleaseDetails(detailUrl?: string | null): Promise<ReleaseDetails | null> {
  const normalized = normalizedDetailUrl(detailUrl);
  if (!normalized) return null;
  const now = new Date();
  const cached = await prisma.mediaReleaseDetailCache.findUnique({ where: { url: normalized.url } });
  if (cached && cached.expiresAt > now) {
    if (cached.lastError) return null;
    try {
      const parsed = JSON.parse(cached.payload) as ReleaseDetails;
      if (parsed.posterRemote && (parsed.technical?.voiceCodes || parsed.technical?.voiceLabels)) return parsed;
    } catch {
      return null;
    }
  }

  try {
    const details = await fetchKinozal(normalized.url);
    await prisma.mediaReleaseDetailCache.upsert({
      where: { url: normalized.url },
      create: {
        provider: normalized.provider,
        url: normalized.url,
        payload: JSON.stringify(details),
        fetchedAt: now,
        expiresAt: new Date(Date.now() + OK_TTL),
      },
      update: {
        provider: normalized.provider,
        payload: JSON.stringify(details),
        lastError: null,
        fetchedAt: now,
        expiresAt: new Date(Date.now() + OK_TTL),
      },
    });
    return details;
  } catch (e) {
    await prisma.mediaReleaseDetailCache.upsert({
      where: { url: normalized.url },
      create: {
        provider: normalized.provider,
        url: normalized.url,
        payload: "{}",
        lastError: String(e),
        fetchedAt: now,
        expiresAt: new Date(Date.now() + ERROR_TTL),
      },
      update: {
        lastError: String(e),
        fetchedAt: now,
        expiresAt: new Date(Date.now() + ERROR_TTL),
      },
    }).catch(() => null);
    return null;
  }
}
