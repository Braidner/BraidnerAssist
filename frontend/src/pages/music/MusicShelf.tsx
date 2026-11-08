import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, ArrowRight, AudioLines, ChartNoAxesColumnIncreasing, Disc3, ListFilter, Play, Shuffle, Waves, X } from "lucide-react";
import { Artwork } from "./MusicArtwork";
import { albumEntries, albumsCount, clock, quality, shuffleEntries, tracksCount, type MusicAlbum, type QueueEntry } from "./musicApi";

export type StartQueue = (entries: QueueEntry[], name: string, index?: number) => void;
export function AlbumGrid({ albums, onAlbum }: { albums: MusicAlbum[]; onAlbum: (album: MusicAlbum) => void }) {
  return <div className="mu-grid">{albums.map(album => <button className="mu-tile" key={album.id} onClick={() => onAlbum(album)}>
    <Artwork album={album} /><strong>{album.title}</strong><small>{[album.artist, album.year].filter(Boolean).join(' · ')}</small>
  </button>)}</div>;
}

export function MusicDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); };
  }, []);
  return <dialog ref={dialog} className="mu-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) {
      const bounds = e.currentTarget.getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
    } }}>
    <header className="mu-heading"><h2>{title}</h2><button aria-label="Закрыть" className="mu-round" onClick={onClose}><X /></button></header>{children}
  </dialog>;
}

export function AlbumDialog({ album, onClose, start }: { album: MusicAlbum; onClose: () => void; start: StartQueue }) {
  const play = (index: number) => { onClose(); start(albumEntries(album), album.title, index); };
  const multiDisc = album.tracks.some(t => t.disc > 1);
  return <MusicDialog title={album.title} onClose={onClose}>
    <div className="mu-album-intro"><Artwork album={album} /><div><strong>{album.artist}</strong>
      <p>{[album.year, ...album.genres].filter(Boolean).join(' · ')}</p>
      <button className="mu-primary" onClick={() => play(0)} disabled={!album.tracks.length}><Play />Слушать с начала</button></div></div>
    <div className="mu-rows">{album.tracks.map((track, i) => <button key={track.id} className="mu-row" onClick={() => play(i)}>
      <span className="mu-number">{multiDisc ? track.disc + '.' : ''}{track.number || i + 1}</span>
      <span className="mu-name"><strong>{track.title}</strong><small>{track.artist || album.artist}</small></span>
      <small className="mu-row-format">{quality(track)}</small><span className="mu-time">{clock(track.duration)}</span>
    </button>)}</div>
  </MusicDialog>;
}

const genreIcons = [Activity, Waves, ChartNoAxesColumnIncreasing, AudioLines, Disc3];
export function MusicShelf({ albums, onAlbum, start, playlists }: {
  albums: MusicAlbum[]; onAlbum: (album: MusicAlbum) => void; start: StartQueue; playlists: ReactNode;
}) {
  const [genre, setGenre] = useState('');
  const [artist, setArtist] = useState('');
  const [alphabetic, setAlphabetic] = useState(false);
  const [limit, setLimit] = useState(12);
  const rail = useRef<HTMLDivElement>(null);
  const [artistLimit, setArtistLimit] = useState(32);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const all = useMemo(() => albums.flatMap(albumEntries), [albums]);
  const genres = useMemo(() => {
    const totals = new Map<string, number>();
    albums.forEach(album => album.genres.forEach(g => totals.set(g, (totals.get(g) ?? 0) + 1)));
    return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [albums]);
  const inGenre = useMemo(() => genre ? albums.filter(a => a.genres.includes(genre)) : albums, [albums, genre]);
  const artists = useMemo(() => {
    const groups = new Map<string, MusicAlbum[]>();
    for (const album of inGenre) {
      const group = groups.get(album.artist);
      if (group) group.push(album); else groups.set(album.artist, [album]);
    }
    return [...groups].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [inGenre]);
  const filtered = useMemo(() => {
    const list = inGenre.filter(a => !artist || a.artist === artist);
    return alphabetic ? list.sort((a, b) => a.title.localeCompare(b.title, 'ru')) : list.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [inGenre, artist, alphabetic]);
  const updateRail = () => {
    const el = rail.current;
    if (!el) return;
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setEdges({ prev: el.scrollLeft > 3, next: remaining > 3 || artistLimit < artists.length });
    if (remaining < 200 && artistLimit < artists.length) setArtistLimit(n => n + 24);
  };
  useEffect(() => {
    updateRail();
    if (!rail.current) return;
    const observer = new ResizeObserver(updateRail);
    observer.observe(rail.current);
    return () => observer.disconnect();
  }, [artists, artistLimit]);
  const feature = albums[0];
  return <>
    <section className="mu-hero">
      <div className="mu-hero-copy"><p className="mu-artist-name">{feature.artist}</p><h1>{feature.title}</h1>
        <p className="mu-meta">{[feature.year, ...feature.genres.slice(0, 2), 'Альбом'].filter(Boolean).join(' / ')}</p>
        <div className="mu-actions"><button className="mu-primary" disabled={!all.length} onClick={() => start(shuffleEntries(all), 'Вся фонотека · вперемешку')}><Shuffle />Слушать вперемешку</button>
          <button className="mu-button" disabled={!feature.tracks.length} onClick={() => start(albumEntries(feature), feature.title)}><Play />Слушать альбом</button></div>
      </div>
      <button className="mu-sleeve" aria-label={'Открыть альбом ' + feature.title} onClick={() => onAlbum(feature)}><i aria-hidden="true" /><Artwork album={feature} eager /></button>
    </section>
    {genres.length > 0 && <section><div className="mu-heading"><h2>Жанры</h2><small>{tracksCount(all.length)} в коллекции</small></div>
      <div className="mu-genres">{genres.map(([g, n], i) => {
        const Icon = genreIcons[i % genreIcons.length];
        return <button key={g} aria-pressed={genre === g} onClick={() => { setGenre(genre === g ? '' : g); setArtist(''); setArtistLimit(32); rail.current?.scrollTo({left: 0}); setLimit(12); }}><Icon /><span>{g}</span><small>{n}</small></button>;
      })}</div></section>}
    <section><div className="mu-heading"><h2>Исполнители</h2><div className="mu-actions"><small>{artists.length}</small>
      {edges.prev && <button className="mu-round" aria-label="Предыдущие исполнители" onClick={() => rail.current?.scrollBy({ left: -(rail.current.clientWidth * .8), behavior: 'smooth' })}><ArrowLeft /></button>}
      {edges.next && <button className="mu-round" aria-label="Следующие исполнители" onClick={() => rail.current?.scrollBy({ left: rail.current.clientWidth * .8, behavior: 'smooth' })}><ArrowRight /></button>}
    </div></div><div className="mu-artists" ref={rail} onScroll={updateRail}>
      {artists.slice(0, artistLimit).map(([name, records]) => <button key={name} aria-pressed={artist === name} onClick={() => { setArtist(artist === name ? '' : name); setLimit(12); }}>
        <span className="mu-stack">{records[1] && <Artwork album={records[1]} />}<Artwork album={records[0]} /></span>
        <span className="mu-name"><strong>{name}</strong><small>{albumsCount(records.length)}</small></span>
      </button>)}
    </div></section>
    <section><div className="mu-heading"><h2>Альбомы <small>/ {filtered.length}</small></h2>
      <button className="mu-text" onClick={() => setAlphabetic(!alphabetic)}><ListFilter />{alphabetic ? 'По алфавиту' : 'По добавлению'}</button></div>
      {(genre || artist) && <p className="mu-filter">{[genre, artist].filter(Boolean).join(' / ')} <button onClick={() => { setGenre(''); setArtist(''); setLimit(12); }}>Сбросить выбор</button></p>}
      <AlbumGrid albums={filtered.slice(0, limit)} onAlbum={onAlbum} />
      {limit < filtered.length && <button className="mu-button mu-more" onClick={() => setLimit(limit + 12)}>Показать ещё</button>}
    </section>
    {playlists}
  </>;
}
