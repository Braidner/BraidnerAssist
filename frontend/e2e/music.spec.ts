import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { expect, test, type Page } from "@playwright/test";

const albums = [
  { id: 'album-one', title: 'First Press', artist: 'Signal Group', genres: ['Jazz'], year: 2021, coverId: null,
    tracks: ['Inlet', 'Mosaic'].map((title, i) => ({ id: 'sg-' + i, title, artist: 'Signal Group', number: i + 1,
      disc: 1, duration: 40, codec: 'flac', bitDepth: 16, sampleRate: 8000 })) },
  { id: 'album-two', title: 'Second Press', artist: 'Wave Group', genres: ['Ambient'], year: 2024, coverId: null,
    tracks: [{ id: 'wg-1', title: 'Polar', artist: 'Wave Group', number: 1, disc: 1, duration: 40, codec: 'flac', bitDepth: 16, sampleRate: 8000 }] },
];

// A self-generated, 40-second mono FLAC. Tests use the browser's native decoder.
const audioFile = readFileSync(new URL('./fixtures/music-silence.flac', import.meta.url));

async function setup(page: Page, role: 'admin' | 'media', library = albums) {
  const state = { query: '', grabs: 0, plays: [] as string[], likes: [] as string[],
    playlists: [] as { name: string; tracks: { title: string; artist: string }[] }[] };
  await page.addInitScript(() => localStorage.setItem('mc-auth-token', 'music-test-token'));
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (path === '/api/auth/me') return json({ id: 'music-account', username: 'listener', role });
    if (path === '/api/music/library') return json({ configured: true, linked: true, albums: library });
    if (path === '/api/music/taste') return json({ likes: state.likes, playlists: state.playlists });
    if (path.startsWith('/api/music/taste/likes/')) {
      const id = path.split('/').pop()!;
      state.likes = req.method() === 'PUT' ? [...state.likes, id] : state.likes.filter(t => t !== id);
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/music/taste/playlists') {
      state.playlists = req.postDataJSON().playlists;
      return json({ likes: state.likes, playlists: state.playlists });
    }
    if (path === '/api/music/releases') {
      state.query = url.searchParams.get('q') ?? '';
      return json({ configured: true, qbConfigured: true, releases: [{ id: 'release-one',
        title: (state.query || 'New record') + ' FLAC', quality: 'FLAC', indexer: 'Music index', seeders: 4, size: 12345678 }] });
    }
    if (path === '/api/music/releases/release-one/grab') { state.grabs++; return json({ ok: true, id: 'release-one', added: true }); }
    if (path === '/api/music/downloads') return json({ configured: true, downloads: state.grabs
      ? [{ id: 'release-one', title: 'Transfer', progress: 24.5, status: 'downloading' }] : [] });
    if (path.startsWith('/api/music/tracks/')) {
      const id = path.split('/')[4];
      state.plays.push(id);
      return json({ url: '/api/music/stream/ticket-' + id });
    }
    if (path.startsWith('/api/music/stream/')) {
      const range = req.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Number(range[2]) : audioFile.length - 1;
      return route.fulfill({ status: range ? 206 : 200, headers: {
        'Content-Type': 'audio/flac', 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + audioFile.length } : {}),
      }, body: audioFile.subarray(start, end + 1) });
    }
    if (path === '/api/docker/containers') return json({ configured: false, containers: [] });
    if (path === '/api/tasks') return json([]);
    if (path === '/api/media/quota') return json({ configured: false, periods: [], blockingPeriod: null });
    if (path === '/api/hermes/status') return json({ status: 'idle' });
    if (path.startsWith('/api/hermes/')) return json([]);
    return json({ configured: false });
  });
  return state;
}

test('album filtering, playback and full-library shuffle survive route changes', async ({ page }) => {
  const state = await setup(page, 'admin');
  await page.goto('/music');
  await page.getByRole('button', { name: /^Ambient/ }).click();
  await expect(page.getByRole('button', { name: /^Second Press/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^First Press/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Слушать вперемешку' }).click();
  await expect(page).toHaveURL(/\/music\/session$/);
  await expect(page.getByText('1 из 3')).toBeVisible();
  await expect.poll(() => page.locator('audio').evaluate(e => !(e as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole('button', { name: 'Следующий трек' }).click();
  await expect(page.getByText('2 из 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeEnabled();
  await page.getByRole('button', { name: 'Мне нравится' }).click();
  await expect(page.getByRole('button', { name: 'В избранном' })).toBeVisible();
  await page.getByRole('tab', { name: 'Discovery' }).click();
  await expect(page.locator('aside[aria-label="Текущий сеанс"]')).toBeVisible();
  await page.getByRole('link', { name: 'Hermes' }).click();
  await expect(page).toHaveURL(/\/hermes$/);
  await expect.poll(() => page.locator('audio').evaluate(e => !(e as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole('link', { name: 'Музыка' }).click();
  await page.getByRole('tab', { name: 'Сеанс' }).click();
  await expect(page.getByText('2 из 3')).toBeVisible();
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('9');
  await expect.poll(() => page.locator('audio').evaluate(e => (e as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(9);
  await page.getByRole('button', { name: 'Следующий трек' }).click();
  await expect(page.getByRole('button', { name: 'Следующий трек' })).toBeDisabled();
  expect(new Set(state.plays).size).toBe(3);
  expect(state.likes).toHaveLength(1);
});

test('mobile Discovery finds and downloads releases with an empty Jellyfin library', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, 'media', []);
  await page.goto('/music');
  await expect(page.getByRole('heading', { name: 'Ваша фонотека' })).toBeVisible();
  await page.getByRole('tab', { name: 'Discovery' }).click();
  await expect(page.getByText('New record FLAC')).toBeVisible();
  await page.getByRole('searchbox').fill('Vinyl');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByText('Vinyl FLAC', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скачать', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Загрузка Transfer' })).toHaveAttribute('value', '24.5');
  expect(state.grabs).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Сеанс' }).click();
  await expect(page.getByRole('heading', { name: 'Сеанс прослушивания' })).toBeVisible();
});

test('playlist preview, local matches and searching for a missing track', async ({ page }) => {
  const state = await setup(page, 'media');
  await page.goto('/music/discovery');
  const lists = [{ name: 'Weekend', tracks: [{ artist: 'Signal Group', title: 'Inlet' }, { artist: 'Far Guest', title: 'Bridge' }] }];
  await page.getByLabel('Файлы плейлистов').setInputFiles({ name: 'playlists.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lists)) });
  const preview = page.getByRole('dialog', { name: 'Предпросмотр импорта' });
  await expect(preview.getByText('2 трека · в фонотеке 1')).toBeVisible();
  expect(state.playlists).toHaveLength(0);
  await preview.getByRole('button', { name: 'Сохранить плейлисты' }).click();
  await page.getByRole('button', { name: /Weekend/ }).click();
  const detail = page.getByRole('dialog', { name: 'Weekend' });
  await expect(detail.getByText(/В фонотеке 1 из 2/)).toBeVisible();
  await detail.getByRole('button', { name: 'Найти FLAC' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('Far Guest Bridge');
  await expect(page.getByText('Far Guest Bridge FLAC', { exact: true })).toBeVisible();
});

test('reads a ZIP of playlist CSV files and saves their order and quoted titles', async ({ page }) => {
  const state = await setup(page, 'media');
  await page.goto('/music/discovery');
  const archive = zipSync({
    'Music/playlists/Saturday.csv': strToU8('\uFEFFartist;title\r\nSignal Group;Inlet\r\nFar Guest;"Bridge; reprise"\r\n'),
    'Music/playlists/Sunday.csv': strToU8('artist,title\n"Other, Artist","Song ""Two"""\n'),
  });
  await page.getByLabel('Файлы плейлистов').setInputFiles({
    name: 'yandex-music.zip', mimeType: 'application/zip', buffer: Buffer.from(archive),
  });
  const preview = page.getByRole('dialog', { name: 'Предпросмотр импорта' });
  await expect(preview.getByText(/2 плейлиста · 3 трека/)).toBeVisible();
  await preview.getByRole('button', { name: 'Сохранить плейлисты' }).click();
  await expect(page.getByRole('button', { name: /Sunday/ })).toBeVisible();
  expect(state.playlists).toEqual([
    { name: 'Saturday', tracks: [{ artist: 'Signal Group', title: 'Inlet' }, { artist: 'Far Guest', title: 'Bridge; reprise' }] },
    { name: 'Sunday', tracks: [{ artist: 'Other, Artist', title: 'Song "Two"' }] },
  ]);
});

test('keeps a 10,000-track playlist in order with a bounded number of queue rows', async ({ page }) => {
  const state = await setup(page, 'media');
  state.playlists = [{ name: 'Long Playlist', tracks: Array.from({ length: 10_000 }, (_, i) => ({
    artist: 'Signal Group', title: i % 2 ? 'Mosaic' : 'Inlet',
  })) }];
  await page.goto('/music');
  await page.getByRole('button', { name: /Long Playlist/ }).click();
  const list = page.getByRole('dialog', { name: 'Long Playlist' });
  await expect(list.getByText('В фонотеке 10000 из 10000. Порядок треков сохранён.')).toBeVisible();
  expect(await list.locator('.mu-row').count()).toBe(60);
  await list.getByRole('button', { name: 'Слушать плейлист' }).click();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await expect(page.getByText('1 из 10000', { exact: true })).toBeVisible();
  expect(await page.locator('.mu-rows .mu-row').count()).toBe(60);
  expect(await page.locator('.mu-rows svg').count()).toBe(0);
  await page.getByRole('button', { name: 'Следующая страница очереди' }).click();
  await page.getByRole('button', { name: /^62 Mosaic/ }).click();
  await expect(page.getByText('62 из 10000', { exact: true })).toBeVisible();
  expect(state.plays).toEqual(['sg-0', 'sg-1']);
});

test('native FLAC advances to the next album track on ended and stops at the last track', async ({ page }) => {
  const state = await setup(page, 'media');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/music');
  await page.getByRole('button', { name: 'Слушать альбом' }).click();
  const audio = page.locator('audio');
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeEnabled();
  // WebKit rounds FLAC duration to the end of its final encoded block.
  await expect.poll(() => audio.evaluate(e => Math.floor((e as HTMLAudioElement).duration))).toBe(40);
  await audio.evaluate(e => { (e as HTMLAudioElement).currentTime = 39.8; });
  await expect(page.getByRole('heading', { name: 'Mosaic' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeEnabled();
  await audio.evaluate(e => { (e as HTMLAudioElement).currentTime = 39.8; });
  await expect.poll(() => audio.evaluate(e => (e as HTMLAudioElement).ended)).toBe(true);
  await expect(page.getByRole('button', { name: 'Воспроизвести' })).toBeVisible();
  expect(state.plays).toEqual(['sg-0', 'sg-1']);
});
