import { apiFetch } from "../../lib/api";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  disc: number;
  number: number;
  duration: number;
  codec: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
}

export interface MusicAlbum {
  id: string;
  title: string;
  artist: string;
  genres: string[];
  year: number | null;
  coverId: string | null;
  addedAt?: string | null;
  tracks: MusicTrack[];
}

export interface MusicLibrary {
  configured: boolean;
  linked: boolean;
  albums: MusicAlbum[];
}

export interface MusicRelease {
  id: string;
  title: string;
  indexer: string;
  quality: string;
  size: number;
  seeders: number | null;
  publishedAt?: string | null;
}

export interface MusicDownload {
  id: string;
  title: string;
  progress: number;
  status: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch('/api/music' + path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : 'Ошибка запроса (' + response.status + ')');
  }
  return response.json();
}

export const getMusicLibrary = (signal?: AbortSignal) => request<MusicLibrary>("/library", { signal });
export const getMusicReleases = (q: string, signal?: AbortSignal) =>
  request<{ configured: boolean; releases: MusicRelease[]; qbConfigured?: boolean }>('/releases?q=' + encodeURIComponent(q), { signal });
export const grabMusicRelease = (id: string) => request<unknown>('/releases/' + encodeURIComponent(id) + '/grab', { method: 'POST' });
export const getMusicDownloads = (signal?: AbortSignal) =>
  request<{ configured: boolean; downloads: MusicDownload[] }>('/downloads', { signal });
export const getPlayUrl = (id: string, signal?: AbortSignal) =>
  request<{ url: string }>('/tracks/' + encodeURIComponent(id) + '/play', { method: 'POST', signal });

export interface QueueEntry { album: MusicAlbum; track: MusicTrack }
export const albumEntries = (album: MusicAlbum): QueueEntry[] => album.tracks.map(track => ({ album, track }));

export function shuffleEntries(entries: QueueEntry[]): QueueEntry[] {
  const shuffled = entries.slice();
  for (let i = shuffled.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds) || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function quality(track: MusicTrack) {
  return [track.codec?.toUpperCase(), track.bitDepth && track.bitDepth + ' бит',
    track.sampleRate && (track.sampleRate / 1000).toLocaleString('ru-RU') + ' кГц'].filter(Boolean).join(' · ');
}

const plural = new Intl.PluralRules('ru');
export function count(n: number, one: string, few: string, many: string) {
  const form = plural.select(n);
  return n.toLocaleString('ru') + ' ' + (form === 'one' ? one : form === 'few' ? few : many);
}
export const tracksCount = (n: number) => count(n, 'трек', 'трека', 'треков');
export const albumsCount = (n: number) => count(n, 'альбом', 'альбома', 'альбомов');
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
