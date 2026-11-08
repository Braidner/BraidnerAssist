import { useMemo, useRef, useState } from "react";
import { ArrowRight, FileUp, Heart, ListMusic, Play, Search } from "lucide-react";
import { getMusicTaste, importMusicPlaylists, readMusicPlaylists } from "../../lib/musicTaste";
import { MusicDialog, type StartQueue } from "./MusicShelf";
import { count, errorText, tracksCount, type QueueEntry } from "./musicApi";

export type Taste = Awaited<ReturnType<typeof getMusicTaste>>;
export type Playlist = Taste['playlists'][number];
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
export const trackKey = (artist: string, title: string) => JSON.stringify([normalize(artist), normalize(title)]);
export const normalizeName = normalize;
export function useTrackMatches(entries: QueueEntry[]) {
  return useMemo(() => {
    const matches = new Map<string, QueueEntry>();
    for (const entry of entries) {
      const key = trackKey(entry.track.artist || entry.album.artist, entry.track.title);
      if (!matches.has(key)) matches.set(key, entry);
    }
    return matches;
  }, [entries]);
}

export function MusicPlaylists({ taste, matches, onImport, search, start, compact = false, openImports }: {
  taste: Taste; matches: Map<string, QueueEntry>; onImport: (taste: Taste) => void;
  search: (q: string) => void; start: StartQueue; compact?: boolean; openImports?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Playlist[]>([]);
  const [activeList, setActiveList] = useState<Playlist | null>(null);
  const [limit, setLimit] = useState(60);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const matched = (p: Playlist) => p.tracks.map(t => matches.get(trackKey(t.artist, t.title)));
  const listEntries = useMemo(() => activeList ? matched(activeList) : [], [activeList, matches]);
  const listQueue = useMemo(() => listEntries.filter((e): e is QueueEntry => !!e), [listEntries]);
  const fileChange = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setError(''); setNotice('');
    try { setPreview(await readMusicPlaylists(files)); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      onImport(await importMusicPlaylists(preview));
      setNotice('Импортировано: ' + count(preview.length, 'плейлист', 'плейлиста', 'плейлистов') + '.');
      setPreview([]);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  return <section id="music-playlists"><div className="mu-heading"><h2>Мои плейлисты</h2>
    {compact ? <button className="mu-text" onClick={openImports}>Импорт из Яндекса <ArrowRight /></button>
      : <button className="mu-button" disabled={busy} onClick={() => input.current?.click()}><FileUp />{busy ? 'Обработка…' : 'Выбрать файл'}</button>}</div>
    {!compact && <><p className="mu-note">Выберите ZIP-архив Яндекс Музыки или файлы плейлистов в формате JSON, CSV или TXT.</p>
      <input type="file" hidden multiple ref={input} accept=".zip,.json,.csv,.txt" aria-label="Файлы плейлистов" onChange={e => {
        const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; void fileChange(files);
      }} /></>}
    {notice && <p className="mu-note" role="status">{notice}</p>}
    {error && !preview.length && <p className="mu-issue" role="alert">{error}</p>}
    {taste.playlists.length ? <div className="mu-playlists">{taste.playlists.map(p => <button key={p.name} className="mu-playlist" onClick={() => { setActiveList(p); setLimit(60); }}>
      {normalize(p.name) === 'мне нравится' ? <Heart /> : <ListMusic />}<span className="mu-name"><strong>{p.name}</strong><small>{tracksCount(p.tracks.length)}</small></span><ArrowRight />
    </button>)}</div> : <p className="mu-note">{compact ? 'Импортируйте плейлист, чтобы слушать знакомые треки в своём порядке.' : 'Сохранённые списки появятся здесь после импорта.'}</p>}
    {!!preview.length && <MusicDialog title="Предпросмотр импорта" onClose={() => { if (!busy) { setPreview([]); setError(''); } }}>
      <p className="mu-note">{count(preview.length, 'плейлист', 'плейлиста', 'плейлистов')} · {tracksCount(preview.reduce((n,p) => n + p.tracks.length, 0))}. Списки с тем же названием обновятся.</p>
      <div className="mu-rows">{preview.map(p => <div className="mu-row" key={p.name}><ListMusic /><span className="mu-name"><strong>{p.name}</strong>
        <small>{tracksCount(p.tracks.length)} · в фонотеке {matched(p).filter(Boolean).length}</small></span></div>)}</div>
      {error && <p className="mu-issue" role="alert">{error}</p>}
      <button className="mu-primary" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : 'Сохранить плейлисты'}</button>
    </MusicDialog>}
    {activeList && <MusicDialog title={activeList.name} onClose={() => setActiveList(null)}>
      <p className="mu-note">В фонотеке {listQueue.length} из {activeList.tracks.length}. Порядок треков сохранён.</p>
      {!!listQueue.length && <button className="mu-primary" onClick={() => { start(listQueue, activeList.name); setActiveList(null); }}><Play />Слушать плейлист</button>}
      <div className="mu-rows">{activeList.tracks.slice(0, limit).map((t, i) => <div className="mu-row" key={i}>
        <span className="mu-number">{i + 1}</span><span className="mu-name"><strong>{t.title}</strong><small>{t.artist}</small></span>
        {listEntries[i] ? <small>В фонотеке</small> : <button className="mu-text" onClick={() => { setActiveList(null); search(t.artist + ' ' + t.title); }}><Search />Найти FLAC</button>}
      </div>)}</div>
      {limit < activeList.tracks.length && <button className="mu-button" onClick={() => setLimit(limit + 60)}>Показать ещё</button>}
    </MusicDialog>}
  </section>;
}
