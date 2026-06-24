// Парсер сезона/серии из имени файла торрента (Media v2). Покрывает обычные
// scene/p2p-имена: S01E05, S01E05E06, S01E05-E07, 1x05, "Season 1"/"Сезон 1" +
// номер серии. Для фильмов (один файл) вернёт {season:null, episodes:[]}.
//
// Возвращаем массив episodes (мульти-серии в одном файле — S01E01E02 и т.п.).

export interface ParsedEpisode {
  season: number | null;
  episodes: number[]; // пусто → серия не распознана (или это фильм)
}

const VIDEO_RE = /\.(mkv|mp4|avi|m4v|mov|ts|webm|wmv|flv|mpg|mpeg)$/i;
export function isVideoFile(path: string): boolean {
  return VIDEO_RE.test(path);
}

// Диапазон серий E01-E05 → [1,2,3,4,5]; список E01E02 ловится отдельно.
function range(a: number, b: number): number[] {
  if (b < a || b - a > 50) return [a]; // защита от мусора
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function parseEpisode(rawPath: string): ParsedEpisode {
  const path = rawPath.replace(/\\/g, "/");
  const name = path.slice(path.lastIndexOf("/") + 1);
  // Для сезона учитываем и папку (часто "Season 03/" / "Сезон 3/").
  const full = path;

  let season: number | null = null;
  let episodes: number[] = [];

  // 1) SxxEyy (+ многосерийные: S01E01E02, S01E01-E03, S01E01-02)
  const sxxe = name.match(/\bS(\d{1,2})[._\s-]?E(\d{1,3})((?:[._\s-]?E\d{1,3})|(?:-E?\d{1,3}))?/i);
  if (sxxe) {
    season = Number(sxxe[1]);
    const first = Number(sxxe[2]);
    episodes = [first];
    const tail = sxxe[3];
    if (tail) {
      const nums = tail.match(/\d{1,3}/g)?.map(Number) ?? [];
      if (/-/.test(tail) && nums.length === 1) episodes = range(first, nums[0]);
      else episodes = [first, ...nums];
    }
    return { season, episodes: dedupe(episodes) };
  }

  // 2) NxNN (1x05, 1x05-06)
  const nx = name.match(/\b(\d{1,2})x(\d{1,3})(?:-(\d{1,3}))?\b/i);
  if (nx) {
    season = Number(nx[1]);
    const first = Number(nx[2]);
    episodes = nx[3] ? range(first, Number(nx[3])) : [first];
    return { season, episodes: dedupe(episodes) };
  }

  // 3) Сезон из папки/имени ("Season 3", "Сезон 3", "S03") + отдельная серия.
  const seasonWord = full.match(/(?:season|сезон|сезона)[._\s-]*(\d{1,2})/i) || name.match(/\bS(\d{1,2})\b/i);
  if (seasonWord) season = Number(seasonWord[1]);

  // Серия: "E05", "Ep.05", "Episode 5", "Серия 5", "- 05 -".
  const epWord = name.match(/\b(?:e|ep|episode|серия|серии)[._\s-]*(\d{1,3})\b/i);
  if (epWord) {
    episodes = [Number(epWord[1])];
  } else if (season != null) {
    // В сезонном паке файл может называться просто "05.mkv"/"Show - 05.mkv".
    // Берём первое 1-3-значное число, НЕ являющееся качеством/годом.
    const cleaned = name
      .replace(VIDEO_RE, "")
      .replace(/\b(?:480|576|720|1080|1440|2160)p?\b/gi, "")
      .replace(/\b(?:19|20)\d{2}\b/g, "")
      .replace(/\bx?26[45]\b/gi, "")
      .replace(/\b10bit\b/gi, "");
    const loose = cleaned.match(/\b(\d{1,3})\b/);
    if (loose) episodes = [Number(loose[1])];
  }

  return { season, episodes: dedupe(episodes) };
}

function dedupe(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b);
}
