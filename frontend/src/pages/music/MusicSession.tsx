import { memo, useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Disc3, Heart, ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Artwork } from "./MusicArtwork";
import { useMusicPlayback } from "./MusicPlayback";
import { clock, quality, type QueueEntry } from "./musicApi";

function Transport() {
  const p = useMusicPlayback();
  return <div className="mu-transport">
    <button className="mu-round" aria-label="Предыдущий трек" disabled={p.index < 1} onClick={() => p.select(p.index - 1)}><SkipBack /></button>
    <button className="mu-round mu-play" aria-label={p.playing ? 'Пауза' : 'Воспроизвести'} disabled={p.loading} onClick={p.toggle}>{p.playing ? <Pause /> : <Play />}</button>
    <button className="mu-round" aria-label="Следующий трек" disabled={p.index >= p.entries.length - 1} onClick={() => p.select(p.index + 1)}><SkipForward /></button>
  </div>;
}

function Seek() {
  const { position, duration, seek, loading } = useMusicPlayback();
  const max = duration || 0;
  return <div className="mu-seek"><input type="range" min={0} max={max || 1} step=".1" value={Math.min(position, max)}
    style={{ '--mu-progress': (max ? Math.min(position / max, 1) * 100 : 0) + '%' } as CSSProperties}
    disabled={loading || !max} aria-label="Позиция воспроизведения" aria-valuetext={clock(position) + ' из ' + clock(max)} onChange={e => seek(e.target.valueAsNumber)} />
    <small>{clock(position)} / {clock(max)}</small></div>;
}

export function MusicMiniPlayer({ openSession }: { openSession: () => void }) {
  const { entries, index, error } = useMusicPlayback();
  const entry = entries[index];
  if (!entry) return null;
  return <aside className="mu-mini" aria-label="Текущий сеанс"><button className="mu-mini-link" onClick={openSession}>
    <Artwork album={entry.album} /><span className="mu-name"><strong>{entry.track.title}</strong><small>{entry.track.artist || entry.album.artist}</small></span>
    <ArrowRight /></button><Transport /><Seek />{error && <p role="alert" className="mu-issue">{error}</p>}</aside>;
}

const QueueList = memo(function QueueList({ entries, index, name, select }: { entries: QueueEntry[]; index: number; name: string; select: (index: number) => void }) {
  const size = 60;
  const currentPage = Math.floor(index / size);
  const [page, setPage] = useState(currentPage);
  useEffect(() => setPage(currentPage), [entries, currentPage]);
  const offset = Math.min(page, Math.floor((entries.length - 1) / size)) * size;
  const end = Math.min(offset + size, entries.length);
  return <section><div className="mu-heading"><h2>Плейлист сеанса</h2><small>{index + 1} из {entries.length}</small></div>
    <p className="mu-note">{name}</p><div className="mu-rows">{entries.slice(offset, end).map(({ album, track }, n) => {
      const i = offset + n;
      return <button className="mu-row" key={i}
      aria-current={index === i || undefined} onClick={() => select(i)}>
      <span className="mu-number">{String(i + 1).padStart(2, '0')}</span><Artwork album={album} />
      <span className="mu-name"><strong>{track.title}</strong><small>{track.artist || album.artist} · {album.title}</small></span><span className="mu-time">{clock(track.duration)}</span>
    </button>})}</div>{entries.length > size && <div className="mu-pages">
      <button className="mu-button" aria-label="Предыдущая страница очереди" disabled={offset === 0} onClick={() => setPage(page - 1)}><ArrowLeft /></button>
      <small>{offset + 1}–{end} из {entries.length}</small>
      <button className="mu-button" aria-label="Следующая страница очереди" disabled={end >= entries.length} onClick={() => setPage(page + 1)}><ArrowRight /></button>
    </div>}
  </section>;
});

export function MusicSession({ likes, onLike, likeBusy, canLike, openShelf }: { likes: string[]; onLike: (id: string, liked: boolean) => void; likeBusy: boolean; canLike: boolean; openShelf: () => void }) {
  const p = useMusicPlayback();
  const entry = p.entries[p.index];
  if (!entry) return <section className="mu-empty"><Disc3 aria-hidden="true" /><h1>Сеанс прослушивания</h1>
    <p>Выберите альбом на витрине или перемешайте всю фонотеку. Здесь появятся плеер и очередь треков.</p>
    <button className="mu-primary" onClick={openShelf}>Открыть витрину <ArrowRight /></button></section>;
  const { track, album } = entry;
  const liked = likes.includes(track.id);
  return <>
    <section className="mu-station"><Artwork album={album} eager /><div>
      <p className="mu-artist-name">{track.artist || album.artist}</p><h1>{track.title}</h1>
      <p className="mu-meta">{[album.title, album.year].filter(Boolean).join(' · ')}</p>
      {quality(track) && <p className="mu-file"><Disc3 />{quality(track)}</p>}
      <Seek /><Transport />
      <div className="mu-actions"><button className="mu-button" onClick={openShelf}><ListMusic />Сменить альбом</button>
        <button className="mu-button" disabled={likeBusy || !canLike} aria-pressed={liked} onClick={() => onLike(track.id, !liked)}><Heart className={liked ? 'mu-liked' : ''} />{liked ? 'В избранном' : 'Мне нравится'}</button></div>
      {p.loading && <p className="mu-note" role="status">Открываем исходный файл…</p>}
      {p.error && <p className="mu-issue" role="alert">{p.error}</p>}
    </div></section>
    <QueueList entries={p.entries} index={p.index} name={p.name} select={p.select}/>
  </>;
}
